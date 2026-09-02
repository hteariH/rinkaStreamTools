// Donatello: собранная сумма и донаты в реальном времени.
//
// Как и у DonationAlerts, всё берётся со страницы виджета — той ссылки, что стример
// вставляет в OBS. В её html лежат userId и widgetId, а эндпоинт /info рядом отдаёт
// текущую сумму и валюту виджета.
//
// Сокет — socket.io (engine.io v4) поверх голого WebSocket. Важно: он транслирует
// события всех стримеров сразу, поэтому всё, что не относится к нашему userId,
// отбрасывается на месте и никуда не уходит.

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { t } from "../i18n.js";

const SOCKET_URL = "wss://donatello.to/socket.io/?EIO=4&transport=websocket&userId=";
const RECONNECT_MS = 15000;
const HTTP_TIMEOUT_MS = 15000;
const DEFAULT_CURRENCY = "USD";

const USER_ID_RE = /const userId = '([^']+)'/;
const WIDGET_ID_RE = /const widgetId = '([^']+)'/;

export class DonatelloSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.identity = null;
    this.ws = null;
    this.connecting = false;
    this.timer = null;
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

    this.identity = null;
    this.currency = null;
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
    this.timer = setInterval(() => this._ensureConnected(), RECONNECT_MS);
    this._ensureConnected();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._closeSocket();
  }

  async pollGoal() {
    if (!this.enabled) return null;

    const info = await this._info();
    if (!info || info.donatedAmount === undefined) {
      throw new Error(t("в ответе нет donatedAmount"));
    }

    // donatedAmount приходит строкой, иногда с запятой вместо точки.
    const raw = String(info.donatedAmount).replace(",", ".").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount)) throw new Error(t("не разобрал сумму «{raw}»", { raw }));

    this.amount = amount;
    this.currency = info.widgetCurrency || this.currency || DEFAULT_CURRENCY;
    this.emit("goal", { amount: this.amount, currency: this.currency });
    return this.amount;
  }

  // --------------------------------------------------------------- страница

  async _info() {
    const response = await fetch(`${this.config.widgetUrl}/info`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(t("/info ответил {status}", { status: response.status }));
    return response.json();
  }

  async _getIdentity() {
    if (this.identity) return this.identity;

    const response = await fetch(this.config.widgetUrl, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(t("страница виджета ответила {status}", { status: response.status }));
    const html = await response.text();

    this.identity = {
      userId: find(USER_ID_RE, html, "userId"),
      widgetId: find(WIDGET_ID_RE, html, "widgetId"),
    };
    this.emit("log", `страница виджета прочитана, стример ${this.identity.userId}`);
    return this.identity;
  }

  // ----------------------------------------------------------------- сокет

  async _ensureConnected() {
    if (!this.enabled || this.connecting || this.ws) return;

    this.connecting = true;
    try {
      const identity = await this._getIdentity();
      this._open(identity);
    } catch (error) {
      this.identity = null;
      this._setStatus("error");
      this.emit("log", `не удалось подключиться: ${error.message}`);
    } finally {
      this.connecting = false;
    }
  }

  _open(identity) {
    const ws = new WebSocket(SOCKET_URL + identity.userId);
    this.ws = ws;

    ws.on("message", (raw) => {
      const frame = raw.toString();
      if (frame.startsWith("0")) {          // handshake -> заходим в неймспейс по умолчанию
        this._sendRaw("40");
        this._setStatus("on");
        this.emit("log", "подключено");
      } else if (frame === "2") {           // ping -> pong
        this._sendRaw("3");
      } else if (frame.startsWith("42")) {  // событие
        this._handleEvent(frame.slice(2), identity);
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

  /** Событие приходит массивом ["<имя>", {...}], где имя — id стримера или виджета. */
  _handleEvent(payload, identity) {
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    if (!Array.isArray(event) || event.length < 2) return;

    const [name, data] = event;
    if (name !== identity.userId || data?.userId !== identity.userId) return;
    if (data.amount === undefined || data.isDecrement) return;

    const donorName = typeof data.lastDonatorName === "string" ? data.lastDonatorName.trim() : "";

    this.emit("donation", {
      id: `donatello-${Date.now()}`,
      source: "donatello",
      donorName: donorName || null,
      amount: Number(data.amount) || 0,
      // Суммы в сокете приходят в валюте виджета, а не донатера.
      currency: this.currency || DEFAULT_CURRENCY,
      baseAmount: null,
      message: typeof data.lastDonatorMessage === "string" ? data.lastDonatorMessage : null,
      at: Date.now(),
    });
  }

  _sendRaw(frame) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(frame);
    } catch (error) {
      this.emit("log", `не отправился кадр: ${error.message}`);
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
  if (!match) throw new Error(t("на странице виджета нет {what}", { what }));
  return match[1];
}
