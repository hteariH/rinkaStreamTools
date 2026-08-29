// HTTP-сервер статики (панель + оверлеи) и WebSocket-хаб на одном порту.
//
// У каждого оверлея свой канал: /ws/raffle, /ws/goal, /ws/top, /ws/recent,
// /ws/alerts, /ws/screamer, плюс двусторонний /ws/control для панели управления.
// Каналы разведены по пути апгрейда, поэтому оверлей в OBS получает только своё
// и не парсит чужое.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer } from "ws";
import { PUBLIC_DIR } from "./paths.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};

// Короткие адреса для OBS: /raffle вместо /overlay/raffle.html.
const ALIASES = {
  "/": "/index.html",
  "/raffle": "/overlay/raffle.html",
  "/goal": "/overlay/goal.html",
  "/top": "/overlay/top.html",
  "/recent": "/overlay/recent.html",
  "/alerts": "/overlay/alert.html",
  "/screamer": "/overlay/screamer.html",
};

export class Hub {
  /**
   * @param {number} port
   * @param {Record<string, () => any>} snapshots  канал -> начальное состояние для нового клиента
   * @param {(channel: string, message: any, ws: object) => void} onMessage  входящие (нужны только для /ws/control)
   */
  constructor(port, snapshots, onMessage) {
    this.port = port;
    this.snapshots = snapshots;
    this.onMessage = onMessage;
    this.server = null;
    this.channels = new Map();
  }

  start() {
    this.server = http.createServer((req, res) => this._serveStatic(req, res));

    for (const channel of Object.keys(this.snapshots)) {
      const wss = new WebSocketServer({ noServer: true });
      wss.on("connection", (ws) => {
        const initial = this.snapshots[channel]();
        if (initial !== undefined) ws.send(JSON.stringify(initial));
        ws.on("message", (raw) => {
          if (!this.onMessage) return;
          try {
            this.onMessage(channel, JSON.parse(raw.toString()), ws);
          } catch {
            /* мусор из сокета игнорируем — панель шлёт только валидный JSON */
          }
        });
      });
      this.channels.set(channel, wss);
    }

    this.server.on("upgrade", (req, socket, head) => {
      const channel = req.url.split("?")[0].replace(/\/$/, "");
      const wss = this.channels.get(channel);
      if (!wss) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    });

    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, () => resolve());
    });
  }

  broadcast(channel, payload) {
    const wss = this.channels.get(channel);
    if (!wss) return;
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  }

  async _serveStatic(req, res) {
    const urlPath = req.url.split("?")[0];
    const rel = ALIASES[urlPath] || urlPath;
    // Защита от path traversal.
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}
