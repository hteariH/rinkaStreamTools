// Клиент к WebSocket-серверу AxelChat.
// Подключается, слушает NEW_MESSAGES_RECEIVED, эмитит нормализованные сообщения.
// Авто-reconnect с бэкоффом — AxelChat может быть ещё не запущен / перезапуститься.

import { EventEmitter } from "node:events";
import WebSocket from "ws";

export class AxelChatClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.stopped = false;
    this.reconnectDelay = 1000; // растёт до 15с
    this.maxDelay = 15000;
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
    }
  }

  _connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectDelay = 1000;
      this.emit("status", "connected");
    });

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      this._handle(msg);
    });

    ws.on("close", () => {
      this.emit("status", "disconnected");
      this._scheduleReconnect();
    });

    ws.on("error", (err) => {
      this.emit("status", `error: ${err.message}`);
      // 'close' последует за 'error' — reconnect планируем там.
    });
  }

  _scheduleReconnect() {
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    setTimeout(() => this._connect(), delay);
  }

  _handle(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "HELLO") {
      this.emit("status", "hello");
      return;
    }
    if (msg.type !== "NEW_MESSAGES_RECEIVED") return;
    const messages = msg.data?.messages;
    if (!Array.isArray(messages)) return;

    for (const m of messages) {
      if (m?.deleted) continue;
      const text = AxelChatClient._extractText(m?.contents);
      if (!text) continue;
      const author = m.author || {};
      this.emit("message", {
        authorId: author.id || "",
        name: author.name || "",
        serviceId: author.serviceId || "unknown",
        text,
      });
    }
  }

  static _extractText(contents) {
    if (!Array.isArray(contents)) return "";
    const parts = [];
    for (const c of contents) {
      if (c?.type === "text" && c?.data?.text) parts.push(c.data.text);
    }
    return parts.join("").trim();
  }
}
