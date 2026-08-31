// Что играет — по текстовому файлу, который пишет сам плеер.
//
// Это запасной путь для тех, кому медиасессия Windows не подходит: foobar2000,
// AIMP и Snip умеют писать текущий трек в файл, и многие стримеры так уже живут.
// Здесь файл только читают.
//
// Формат — какой есть: одна строка «Исполнитель — Название» (её разберёт
// normalizeTrack) или две строки, где первая название, а вторая исполнитель.
// Пустой файл значит тишину: плееры так и отмечают остановку.
//
// Читаем по таймеру, а не через fs.watch: плееры переписывают файл целиком, и
// слежение за именем то теряет его, то срабатывает дважды на одну запись.

import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

export class FileTrackSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.timer = null;
    this.status = "off";
    this.lastRaw = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._poll(), pollMs(this.config));
    this._poll();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.lastRaw = null;
    this._setStatus("off");
  }

  configure(config) {
    const changed =
      config.filePath !== this.config.filePath ||
      config.pollIntervalMs !== this.config.pollIntervalMs;
    this.config = config;
    if (!changed || !this.timer) return;
    this.stop();
    this.start();
  }

  async _poll() {
    const filePath = String(this.config.filePath || "").trim();
    if (!filePath) {
      this._setStatus("error");
      this.emit("track", null);
      return;
    }

    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      // Плеер ещё не запускался или файл убрали — в эфире это просто тишина.
      // Пишем один раз на обрыв: опрос идёт раз в секунду, и лог панели иначе
      // забился бы одной и той же строкой.
      if (this.status !== "error") this.emit("log", `файл не читается: ${error.message}`);
      this._setStatus("error");
      this.lastRaw = null;
      this.emit("track", null);
      return;
    }

    this._setStatus("on");

    // Тот же текст — рассылать нечего: плеер переписывает файл и когда трек
    // не менялся.
    if (text === this.lastRaw) return;
    this.lastRaw = text;
    this.emit("track", parseFileText(text));
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}

/**
 * Содержимое файла — сырой трек или null (пусто = тишина).
 *
 * Играет плеер или стоит на паузе, из файла не узнать: пишут в него только сам
 * трек. Поэтому всё, что в файле есть, считается играющим.
 */
export function parseFileText(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;
  // Одна строка — делить её на исполнителя и название будет normalizeTrack:
  // разделители у него общие для всех источников.
  if (lines.length === 1) return { title: lines[0], artist: "", status: "playing" };
  return { title: lines[0], artist: lines[1], status: "playing" };
}

function pollMs(config) {
  return Math.max(300, Number(config.pollIntervalMs) || 1500);
}
