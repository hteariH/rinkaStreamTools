// HTTP-сервер статики (панель + оверлеи) и WebSocket-хаб на одном порту.
//
// У каждого оверлея свой канал: /ws/raffle, /ws/goal, /ws/top, /ws/recent,
// /ws/track, /ws/poll, /ws/counter, /ws/alerts, /ws/screamer, плюс двусторонний
// /ws/control.
// Каналы разведены по пути апгрейда, поэтому оверлей в OBS получает только своё
// и не парсит чужое.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer } from "ws";
import { PUBLIC_DIR } from "./paths.js";
import { MEDIA_MIME, MAX_BYTES } from "./media.js";

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
  "/track": "/overlay/track.html",
  "/poll": "/overlay/poll.html",
  "/counter": "/overlay/counter.html",
  "/alerts": "/overlay/alert.html",
  "/screamer": "/overlay/screamer.html",
};

export class Hub {
  /**
   * @param {number} port
   * @param {Record<string, () => any>} snapshots  канал -> начальное состояние для нового клиента
   * @param {(channel: string, message: any, ws: object) => void} onMessage  входящие (нужны только для /ws/control)
   * @param {{media?: object, tts?: object, onMediaChange?: () => void}} [options]
   *   media — медиатека алертов на /media/*, tts — готовая озвучка на /tts/*
   */
  constructor(port, snapshots, onMessage, options = {}) {
    this.port = port;
    this.snapshots = snapshots;
    this.onMessage = onMessage;
    this.media = options.media || null;
    this.tts = options.tts || null;
    this.onMediaChange = options.onMediaChange || (() => {});
    this.server = null;
    this.channels = new Map();
  }

  start() {
    this.server = http.createServer((req, res) => this._route(req, res));

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

  /**
   * Медиатека живёт своим адресом: гифки и звуки лежат не в public/, а рядом с
   * конфигом, и панель их туда же кладёт и оттуда убирает.
   */
  _route(req, res) {
    const urlPath = req.url.split("?")[0];
    if (this.media && urlPath.startsWith("/media/")) return this._serveMedia(req, res, urlPath);
    if (this.media && urlPath === "/media") return this._changeMedia(req, res);
    if (this.tts && urlPath.startsWith("/tts/")) return this._serveVoice(res, urlPath);
    return this._serveStatic(req, res);
  }

  /**
   * Озвучка доната. Лежит в памяти минуты и играет один раз, поэтому и адрес
   * живёт столько же: оверлей забирает звук сразу, как получил алерт.
   */
  _serveVoice(res, urlPath) {
    const id = urlPath.slice("/tts/".length).replace(/\.(mp3|wav)$/, "");
    const entry = this.tts.take(id);
    if (!entry) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      // Облако отдаёт mp3, голоса Windows — wav: тип берём от того, что записано.
      "Content-Type": entry.ext === "wav" ? "audio/wav" : "audio/mpeg",
      "Cache-Control": "no-store",
    });
    res.end(entry.audio);
  }

  async _serveMedia(req, res, urlPath) {
    const name = decodeURIComponent(urlPath.slice("/media/".length));
    const filePath = this.media.pathFor(name);
    if (!filePath) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MEDIA_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        // Тот же файл может смениться под тем же именем, пока идёт эфир.
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }

  /**
   * Добавить файл или убрать его. Тело запроса — сам файл, как есть: панель
   * грузит по одному, и multipart тут был бы парсером ради ничего.
   */
  _changeMedia(req, res) {
    const query = new URLSearchParams(req.url.split("?")[1] || "");
    const name = query.get("name") || "";

    const reply = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    };

    if (req.method === "DELETE") {
      this.media.remove(name).then(
        () => { this.onMediaChange(); reply(200, { ok: true }); },
        (error) => reply(400, { error: error.message })
      );
      return;
    }

    if (req.method !== "POST") {
      reply(405, { error: "так нельзя" });
      return;
    }

    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      // Обрываем на месте, а не после полной загрузки: гигабайтное видео не
      // должно сначала целиком приехать в память и только потом не понравиться.
      if (size > MAX_BYTES) {
        reply(413, { error: "файл слишком большой" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => { /* оборвалось на той стороне — ответ уже не нужен */ });
    req.on("end", () => {
      if (size > MAX_BYTES) return;
      this.media.save(name, Buffer.concat(chunks)).then(
        (saved) => { this.onMediaChange(); reply(200, { name: saved }); },
        (error) => reply(400, { error: error.message })
      );
    });
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
