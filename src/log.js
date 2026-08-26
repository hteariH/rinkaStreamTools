// Общий лог: пишет в консоль и держит последние строки, чтобы панель управления
// показывала их сразу при открытии, а не с момента подключения.

import { EventEmitter } from "node:events";

const MAX_LINES = 200;

class Log extends EventEmitter {
  constructor() {
    super();
    this.lines = [];
  }

  write(scope, text, level = "info") {
    const entry = { at: Date.now(), scope, text: String(text), level };
    this.lines.push(entry);
    if (this.lines.length > MAX_LINES) this.lines.shift();

    const stamp = new Date(entry.at).toLocaleTimeString("ru-RU");
    console.log(`${stamp} [${scope}] ${entry.text}`);
    this.emit("line", entry);
    return entry;
  }

  info(scope, text) { return this.write(scope, text, "info"); }
  warn(scope, text) { return this.write(scope, text, "warn"); }
  ok(scope, text) { return this.write(scope, text, "ok"); }

  recent() {
    return this.lines;
  }
}

export const log = new Log();
