// USDT (TRC-20): донаты прямым переводом на адрес стримера.
//
// У блокчейна нет ни виджета, ни сокета, ни чужого счётчика собранного, поэтому
// здесь всё наоборот, чем у площадок: сумму ведём мы сами, а переводы раз в минуту
// спрашиваем у TronGrid. Ключ и вход не нужны: адрес и его переводы и так публичны.
//
// Считаем с момента добавления адреса: баланс кошелька к сбору отношения не имеет.
// Поэтому момент начала, сумма и уже учтённые переводы лежат в своём файле —
// перезапуск программы не должен ни задвоить донат, ни потерять собранное. Переводы,
// пришедшие пока программа была закрыта, идут в сумму, топ и ленту, но без алерта:
// пачка вчерашних алертов на старте эфира никому не нужна.
//
// Берём только подтверждённые переводы: алерт приходит на пару минут позже, зато
// сумма в эфире не откатится назад.

import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { t } from "../i18n.js";

const API_URL = "https://api.trongrid.io/";
// Настоящий USDT. Токен с именем USDT может выпустить кто угодно, и такие рассылают
// на чужие адреса нарочно, поэтому сверяемся с контрактом, а не с названием.
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_DECIMALS = 6;
const CURRENCY = "USDT";

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const HTTP_TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 200;
// Сколько страниц за один опрос. Порядок переводов — от старых к новым, так что
// не влезшее просто приедет следующим опросом.
const MAX_PAGES = 10;
// Старше этого — алерта не будет. С запасом больше обычной задержки: подтверждение
// сети плюс ожидание опроса укладываются примерно в две минуты.
const ALERT_WINDOW_MS = 5 * 60_000;
// Каждый опрос заново смотрит этот отрезок: узел может отдать более ранний блок
// позже. Повторов это не даёт — учтённые переводы запомнены.
const OVERLAP_MS = 10 * 60_000;
// Спам копейками — обычное дело для адреса на виду.
const DEFAULT_MIN_AMOUNT = 0.1;

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_PREFIX = 0x41;

/** Адрес TRON с верной контрольной суммой: опечатка иначе молчала бы вечно. */
export function isTronAddress(value) {
  if (typeof value !== "string" || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false;

  let number = 0n;
  for (const char of value) number = number * 58n + BigInt(BASE58.indexOf(char));
  const hex = number.toString(16).padStart(50, "0");
  if (hex.length !== 50) return false;

  const bytes = Buffer.from(hex, "hex");
  if (bytes[0] !== TRON_PREFIX) return false;
  const body = bytes.subarray(0, 21);
  const checksum = sha256(sha256(body)).subarray(0, 4);
  return checksum.equals(bytes.subarray(21));
}

function sha256(data) {
  return createHash("sha256").update(data).digest();
}

/** Имени в переводе нет. Короткий адрес складывает повторные донаты в топе. */
function shortAddress(address) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

export class TronSource extends EventEmitter {
  /**
   * @param {object} config секция tron из config.json
   * @param {{statePath: string, fetch?: typeof fetch, now?: () => number}} options
   */
  constructor(config, { statePath, fetch: fetchImpl, now } = {}) {
    super();
    this.config = config;
    this.statePath = statePath;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.now = now ?? Date.now;
    this.currency = CURRENCY;
    this.status = "off";
    this.state = null;
    this.timer = null;
    // Смена адреса или обнуление делают идущий запрос чужим: его ответ выбрасывается.
    this.generation = 0;
    this.running = null;
    this.failures = 0;
    this.nextAt = 0;
    this.saving = Promise.resolve();
  }

  get address() {
    return String(this.config.address ?? "").trim();
  }

  get enabled() {
    return Boolean(this.config.enabled && this.address);
  }

  get amount() {
    return this.state?.amount ?? 0;
  }

  /** Прочитать файл состояния. Вызывается один раз, до первого опроса. */
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.statePath, "utf8"));
      if (
        typeof raw.address === "string" &&
        Number.isFinite(raw.since) &&
        Number.isFinite(raw.cursor) &&
        Number.isFinite(raw.amount) &&
        raw.seen && typeof raw.seen === "object"
      ) {
        this.state = raw;
      }
    } catch {
      // Файла ещё нет или он испорчен — считаем с текущего момента.
    }
    this._syncAddress();
    await this.saving;
  }

  configure(config) {
    const before = this.config;
    this.config = config;
    const changed =
      config.enabled !== before.enabled ||
      String(config.address ?? "").trim() !== String(before.address ?? "").trim() ||
      config.apiKey !== before.apiKey;
    if (!changed) return;

    this.generation += 1;
    this.running = null;
    this.failures = 0;
    this.nextAt = 0;

    if (!this.enabled) {
      this._setStatus("off");
      this.emit("goal", { amount: 0, currency: this.currency });
      return;
    }
    this._syncAddress();
    this.emit("goal", { amount: this.amount, currency: this.currency });
    this.check();
  }

  start() {
    this.timer = setInterval(() => this.check(), POLL_MS);
    this.check();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Цель опрашивает площадки по своему таймеру и после каждого доната. Здесь спрашивать
   * нечего: сумма уже своя, а лишние запросы только приближают к лимиту TronGrid.
   */
  async pollGoal() {
    return this.enabled ? this.amount : null;
  }

  /** Новый сбор: считать заново с этого момента. Прежние переводы не вернутся. */
  async reset() {
    this.generation += 1;
    this.running = null;
    this.state = this._fresh(this.address);
    this.emit("goal", { amount: 0, currency: this.currency });
    await this._save();
  }

  /** Один опрос. Не бросает: сбой сети — повод для лампочки, а не для падения. */
  check() {
    if (!this.enabled) return Promise.resolve();

    if (!isTronAddress(this.address)) {
      if (this.status !== "error") {
        this.emit("log", t("«{address}» не похоже на адрес TRON — проверь, нет ли опечатки", { address: this.address }));
      }
      this._setStatus("error");
      return Promise.resolve();
    }
    if (this.running) return this.running;
    if (this.now() < this.nextAt) return Promise.resolve();

    const run = this._poll(this.generation).finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    return run;
  }

  // ----------------------------------------------------------------- опрос

  async _poll(generation) {
    this._syncAddress();
    const address = this.address;

    try {
      let url = this._firstPage(address);
      for (let page = 0; url && page < MAX_PAGES; page += 1) {
        const body = await this._request(url);
        if (generation !== this.generation) return;

        // Страницу учитываем сразу, не дожидаясь следующей: порядок от старых к новым,
        // и обрыв посередине не должен заставлять начинать всё сначала.
        await this._apply(body.data, address);
        if (generation !== this.generation) return;

        const next = body.meta?.links?.next;
        url = typeof next === "string" && next.startsWith(API_URL) ? next : null;
      }
      this.failures = 0;
      this.nextAt = 0;
      this._setStatus("on");
    } catch (error) {
      if (generation !== this.generation) return;
      this.failures += 1;
      this.nextAt = this.now() + Math.min(POLL_MS * 2 ** this.failures, MAX_BACKOFF_MS);
      if (this.status !== "error") {
        this.emit("log", t("TronGrid не ответил: {error}", { error: error.message }));
      }
      this._setStatus("error");
    }
  }

  _firstPage(address) {
    const params = new URLSearchParams({
      only_to: "true",
      only_confirmed: "true",
      contract_address: USDT_CONTRACT,
      order_by: "block_timestamp,asc",
      limit: String(PAGE_LIMIT),
      min_timestamp: String(Math.max(this.state.since, this.state.cursor - OVERLAP_MS)),
    });
    return `${API_URL}v1/accounts/${address}/transactions/trc20?${params}`;
  }

  async _request(url) {
    const headers = { Accept: "application/json" };
    const apiKey = String(this.config.apiKey ?? "").trim();
    if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

    const response = await this.fetch(url, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!response.ok) throw new Error(t("ответ {status}", { status: response.status }));

    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error(t("в ответе нет списка переводов"));
    return body;
  }

  /** Учесть страницу: сначала запись на диск, потом донаты — иначе сбой их задвоит. */
  async _apply(rows, address) {
    const state = this.state;
    const donations = [];

    for (const row of rows) {
      const at = Number(row.block_timestamp);
      if (row.type !== "Transfer" || row.to !== address) continue;
      if (row.token_info?.address !== USDT_CONTRACT) continue;
      if (!Number.isFinite(at) || at < state.since) continue;

      const key = `${row.transaction_id}:${row.from}:${row.value}`;
      if (key in state.seen) continue;
      state.seen[key] = at;
      state.cursor = Math.max(state.cursor, at);

      const amount = round6(Number(row.value) / 10 ** USDT_DECIMALS);
      if (!(amount > 0) || amount < this._minAmount()) continue;

      state.amount = round6(state.amount + amount);
      donations.push({
        id: `tron-${key}`,
        source: "tron",
        donorName: shortAddress(String(row.from)),
        amount,
        currency: CURRENCY,
        baseAmount: null,
        message: null,
        at,
        ...(this.now() - at > ALERT_WINDOW_MS ? { quiet: true } : {}),
      });
    }

    const oldest = state.cursor - OVERLAP_MS;
    for (const [key, at] of Object.entries(state.seen)) {
      if (at < oldest) delete state.seen[key];
    }

    if (!donations.length) return;
    await this._save();
    this.emit("goal", { amount: state.amount, currency: CURRENCY });
    for (const donation of donations) this.emit("donation", donation);
  }

  _minAmount() {
    const value = Number(this.config.minAmount);
    return this.config.minAmount !== "" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_AMOUNT;
  }

  // ------------------------------------------------------------- состояние

  _fresh(address) {
    const now = this.now();
    return { address, since: now, cursor: now, amount: 0, seen: {} };
  }

  /** Новый адрес — новый счёт. Выключение и включение того же адреса счёт не трогают. */
  _syncAddress() {
    if (!this.enabled || !isTronAddress(this.address)) return;
    if (this.state?.address === this.address) return;
    this.state = this._fresh(this.address);
    this._save();
  }

  /** Запись через временный файл: сумма есть только здесь, файл битым быть не должен. */
  _save() {
    const payload = JSON.stringify(this.state, null, 2) + "\n";
    const temp = `${this.statePath}.tmp`;
    this.saving = this.saving
      .then(async () => {
        await writeFile(temp, payload, "utf8");
        await rename(temp, this.statePath);
      })
      .catch((error) => {
        this.emit("log", t("не удалось сохранить сумму USDT: {error}", { error: error.message }));
      });
    return this.saving;
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}
