// Проверка обновлений: только узнать, что вышла новая версия, и сказать об этом в
// панели. Скачивает и ставит её сам человек — данные лежат отдельно от программы,
// так что он ничего при этом не теряет, а заменять работающий exe перед эфиром
// программе незачем.
//
// Вести себя проверка должна тихо: нет сети или GitHub не ответил — это не повод
// что-то показывать стримеру, только строка в логе.

import { EventEmitter } from "node:events";
import { t } from "./i18n.js";

const REPO = "hteariH/rinkaStreamTools";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

// Первая проверка — не в момент запуска: программа в это время занята своим
// стартом, а новости о версии подождут.
const FIRST_CHECK_MS = 10_000;
// Релизы выходят редко, а без токена GitHub даёт всего 60 запросов в час на IP.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

// Пре-релизы вроде v2.0.0-rc1 предлагать незачем.
const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)$/;

function parse(version) {
  const match = RELEASE.exec(String(version ?? ""));
  return match ? match.slice(1).map(Number) : null;
}

/** Новее ли a, чем b. Как числа: как строка "1.10.0" меньше, чем "1.9.0". */
export function isNewer(a, b) {
  const [left, right] = [parse(a), parse(b)];
  if (!left || !right) return false;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

/**
 * События: "change" — заметка в панели появилась, сменилась или пропала;
 * "log" — строка для лога.
 */
export class UpdateChecker extends EventEmitter {
  constructor({ current, check = true, fetch = globalThis.fetch }) {
    super();
    this.current = current;
    this.enabled = Boolean(check);
    this.fetch = fetch;
    this.latest = null;
    this.failed = false;
    this.started = false;
    this.firstCheck = null;
    this.interval = null;
  }

  /** Сборке без номера версии ("dev") сравнивать себя не с чем. */
  get active() {
    return this.enabled && parse(this.current) !== null;
  }

  start() {
    this.started = true;
    this._schedule();
  }

  stop() {
    this.started = false;
    this._unschedule();
  }

  /** Зовётся на каждое сохранение панели, поэтому реагирует только на смену значения. */
  configure({ check }) {
    const enabled = Boolean(check);
    if (enabled === this.enabled) return;
    this.enabled = enabled;

    this._unschedule();
    this.failed = false;
    if (enabled) {
      this._schedule();
    } else if (this.latest) {
      this.latest = null;
      this.emit("change");
    }
  }

  async check() {
    if (!this.active) return;
    try {
      const version = await this._fetchLatest();
      // Пока шёл запрос, проверку могли выключить: заметка не должна вернуться.
      if (this.active) this._accept(version);
    } catch (error) {
      if (!this.active || this.failed) return;
      // Пока сети нет, попытки идут по расписанию; одного сообщения на обрыв хватит.
      this.failed = true;
      this.emit("log", t("обновления не проверились: {error}", { error: error.message }));
    }
  }

  snapshot() {
    return { current: this.current, latest: this.latest };
  }

  async _fetchLatest() {
    const response = await this.fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "rinkaStreamTools" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(t("GitHub ответил {status}", { status: response.status }));

    const { tag_name: tag } = await response.json();
    if (!parse(tag)) throw new Error(t("не разобрал номер версии «{tag}»", { tag }));
    return String(tag).replace(/^v/, "");
  }

  _accept(version) {
    this.failed = false;
    // Если релиз отозвали и последней снова стала наша версия, заметка уходит.
    const latest = isNewer(version, this.current) ? version : null;
    if (latest === this.latest) return;

    this.latest = latest;
    if (latest) this.emit("log", t("вышла версия {version}: {url}", { version: latest, url: RELEASES_URL }));
    this.emit("change");
  }

  _schedule() {
    if (!this.started || !this.active) return;
    // unref: сами по себе эти таймеры не должны держать процесс живым.
    this.firstCheck = setTimeout(() => this.check(), FIRST_CHECK_MS);
    this.firstCheck.unref?.();
    this.interval = setInterval(() => this.check(), CHECK_EVERY_MS);
    this.interval.unref?.();
  }

  _unschedule() {
    clearTimeout(this.firstCheck);
    clearInterval(this.interval);
    this.firstCheck = null;
    this.interval = null;
  }
}
