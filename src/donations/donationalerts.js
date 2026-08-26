// DonationAlerts: сумма цели и донаты в реальном времени.
//
// Официального локального API у них нет, зато есть страница виджета цели — та самая
// ссылка, которую стример вставляет в OBS. В её html лежат оба токена: один для REST,
// второй для Centrifugo. Оттуда же берётся id стримера (поле sub в JWT).
// Токены живут неделю, поэтому кешируются и перечитываются только при отказе.
//
// Протокол сокета — centrifuge v2: connect по токену со страницы, затем для приватного
// канала нужен отдельный токен подписки, который выдаёт их же subscribe-эндпоинт.

import { EventEmitter } from "node:events";
import WebSocket from "ws";

const WS_ENDPOINT = "wss://centrifugo.donationalerts.com/connection/websocket";
const SUBSCRIBE_ENDPOINT = "https://www.donationalerts.com/api/v1/centrifuge/subscribe";
const GOAL_API = "https://www.donationalerts.com/api/v1/donationgoal/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PING_INTERVAL_MS = 25000;
const RECONNECT_MS = 15000;
const HTTP_TIMEOUT_MS = 15000;

const API_TOKEN_RE = /token_widget_streamer\s*=\s*"([^"]+)"/;
const SOCKET_TOKEN_RE = /token_centrifugo_connect\s*=\s*"([^"]+)"/;
const GOAL_ID_RE = /\/widget\/goal\/(\d+)/;
const SUBJECT_RE = /"sub"\s*:\s*"?(?:User:)?(\d+)/;

export class DonationAlertsSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.credentials = null;
    this.ws = null;
    this.commandId = 0;
    this.connectCommandId = 0;
    this.channel = null;
    this.connecting = false;
    this.timers = [];
    this.amount = 0;
    this.currency = null;
    this.status = "off";
  }

  get enabled() {
    return Boolean(this.config.enabled && this.config.widgetUrl);
  }

  configure(config) {
    const changed =
      config.enabled !== this.config.enabled || config.widgetUrl !== this.config.widgetUrl;
    this.config = config;
    if (!changed) return;

    this.credentials = null;
    this._closeSocket();
    if (!this.enabled) {
      this.amount = 0;
      this._setStatus("off");
      this.emit("goal", { amount: 0, currency: this.currency });
    } else {
      this._ensureConnected();
    }
  }

  start() {
    this.timers.push(setInterval(() => this._ensureConnected(), RECONNECT_MS));
    this.timers.push(setInterval(() => this._ping(), PING_INTERVAL_MS));
    this._ensureConnected();
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this._closeSocket();
  }

  /** Текущая собранная сумма по цели. Ходит в сеть, зовётся по расписанию из goal.js. */
  async pollGoal() {
    if (!this.enabled) return null;

    const goalId = this._goalId();
    let goal = null;
    try {
      goal = await this._requestGoal(goalId, (await this._credentials()).apiToken);
    } catch {
      // Токен со страницы виджета протухает раз в неделю, а ещё его может отозвать
      // сам DonationAlerts — при первой неудаче перечитываем страницу и повторяем.
      this.credentials = null;
      goal = await this._requestGoal(goalId, (await this._credentials()).apiToken);
    }

    if (!goal || goal.raised_amount === undefined) {
      throw new Error("в ответе нет raised_amount");
    }

    this.amount = Number(goal.raised_amount) || 0;
    this.currency = goal.currency || this.currency;
    this.emit("goal", { amount: this.amount, currency: this.currency });
    return this.amount;
  }

  // ------------------------------------------------------------------ токены

  _goalId() {
    const match = GOAL_ID_RE.exec(this.config.widgetUrl || "");
    if (!match) throw new Error("в ссылке на виджет нет id цели (/widget/goal/<id>)");
    return match[1];
  }

  async _credentials() {
    if (this.credentials) return this.credentials;

    const response = await fetch(this.config.widgetUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`страница виджета ответила ${response.status}`);
    const html = await response.text();

    const apiToken = find(API_TOKEN_RE, html, "token_widget_streamer");
    const socketToken = find(SOCKET_TOKEN_RE, html, "token_centrifugo_connect");

    this.credentials = { apiToken, socketToken, userId: userIdOf(socketToken) };
    this.emit("log", `токены виджета получены, стример ${this.credentials.userId}`);
    return this.credentials;
  }

  async _requestGoal(goalId, token) {
    const response = await fetch(`${GOAL_API}${goalId}?include_timestamps=1`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`api цели ответило ${response.status}`);
    const body = await response.json();
    return body?.data ?? null;
  }

  // ------------------------------------------------------------------- сокет

  async _ensureConnected() {
    if (!this.enabled || this.connecting || this.ws) return;

    this.connecting = true;
    try {
      const credentials = await this._credentials();
      this.channel = `$alerts:donation_${credentials.userId}`;
      this._open(credentials);
    } catch (error) {
      this.credentials = null;
      this._setStatus("error");
      this.emit("log", `не удалось подключиться: ${error.message}`);
    } finally {
      this.connecting = false;
    }
  }

  _open(credentials) {
    const ws = new WebSocket(WS_ENDPOINT);
    this.ws = ws;

    ws.on("open", () => {
      this.connectCommandId = ++this.commandId;
      this._send({
        id: this.connectCommandId,
        method: "connect",
        params: { token: credentials.socketToken },
      });
    });

    ws.on("message", (raw) => {
      // Centrifugo склеивает несколько ответов в один кадр через перевод строки.
      for (const line of raw.toString().split("\n")) {
        if (!line.trim()) continue;
        try {
          this._handleFrame(JSON.parse(line), credentials);
        } catch (error) {
          this.emit("log", `непонятный кадр: ${error.message}`);
        }
      }
    });

    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this._setStatus(this.enabled ? "error" : "off");
    });

    ws.on("error", () => {
      try { ws.close(); } catch { /* уже закрыт */ }
    });
  }

  _handleFrame(frame, credentials) {
    if (frame.error) {
      // Чаще всего это протухший токен: следующая попытка должна перечитать
      // страницу виджета, а не долбиться тем же самым.
      this.emit("log", `ошибка centrifugo: ${JSON.stringify(frame.error)}`);
      this.credentials = null;
      this._closeSocket();
      return;
    }

    if (frame.id === this.connectCommandId) {
      const client = frame.result?.client;
      if (!client) {
        this.emit("log", "в ответе connect нет client id");
        return;
      }
      this._subscribe(client, credentials);
      return;
    }

    const publication = frame.result;
    if (publication?.channel === this.channel && publication.data?.data) {
      this._publishDonation(publication.data.data);
    }
  }

  async _subscribe(client, credentials) {
    try {
      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client, channels: [this.channel] }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body = await response.json();
      if (!Array.isArray(body?.channels)) {
        throw new Error(`subscribe вернул ${JSON.stringify(body)}`);
      }

      for (const channel of body.channels) {
        this._send({
          id: ++this.commandId,
          method: "subscribe",
          params: { channel: channel.channel, token: channel.token },
        });
      }
      this._setStatus("on");
      this.emit("log", `подписка на ${this.channel}`);
    } catch (error) {
      this._setStatus("error");
      this.emit("log", `подписка не удалась: ${error.message}`);
      this.credentials = null;
      this._closeSocket();
    }
  }

  _publishDonation(donation) {
    // DonationAlerts сам пересчитывает донат в валюту стримера и кладёт результат
    // в amount_in_user_currency — их собственный виджет цели считает именно по нему.
    const baseAmount = donation.amount_in_user_currency !== undefined
      ? Number(donation.amount_in_user_currency)
      : null;

    this.emit("donation", {
      id: `da-${donation.id ?? Date.now()}`,
      source: "donationAlerts",
      donorName: firstNonBlank(donation.username, donation.name),
      amount: Number(donation.amount) || 0,
      currency: donation.currency || "USD",
      baseAmount: Number.isFinite(baseAmount) ? baseAmount : null,
      message: donation.message || null,
      at: Date.now(),
    });
  }

  _ping() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this._send({ id: ++this.commandId, method: "ping" });
  }

  _send(command) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(command));
    } catch (error) {
      this.emit("log", `не отправилась команда: ${error.message}`);
    }
  }

  _closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { ws.close(); } catch { /* уже закрыт */ }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}

function find(pattern, html, what) {
  const match = pattern.exec(html);
  if (!match) throw new Error(`на странице виджета нет ${what}`);
  return match[1];
}

/** id стримера лежит в поле sub токена Centrifugo — как "User:3719625". */
function userIdOf(socketToken) {
  const parts = socketToken.split(".");
  if (parts.length < 2) throw new Error("токен centrifugo не похож на JWT");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  const match = SUBJECT_RE.exec(payload);
  if (!match) throw new Error("в токене centrifugo нет числового sub");
  return match[1];
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return null;
}
