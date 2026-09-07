// Горячие клавиши счётчика.
//
// Смысл хоткея в том, чтобы жать его, не отрываясь от игры, — значит клавишу
// надо слышать, когда окно панели не в фокусе. Из Node так не умеют без
// нативного модуля, поэтому клавиатуру опрашивает маленький скрипт на PowerShell
// (лежит рядом, hotkeys.ps1) — тем же способом, каким уже читается медиасессия.
//
// Клавиша при этом остаётся игре: скрипт спрашивает у системы состояние, а не
// перехватывает нажатие. Повесить счётчик смертей на ту же кнопку, которой в
// игре что-то делают, — нормальный случай, а не ошибка настройки.

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import process from "node:process";

import { HOTKEYS_SCRIPT } from "../paths.js";
import { parseHotkey } from "./keys.js";
import { t } from "../i18n.js";

const RESTART_MS = 15000;
// Тридцать миллисекунд — быстрее, чем человек успевает заметить, и втрое реже,
// чем кадр в игре: на нагрузку это не влияет, а нажатие короче не бывает.
const POLL_MS = 30;

export class Hotkeys extends EventEmitter {
  /** @param {Record<string, string>} hotkeys действие -> клавиша, например { plus: "F8" } */
  constructor(hotkeys) {
    super();
    this.hotkeys = hotkeys || {};
    this.child = null;
    this.timer = null;
    this.stopped = true;
    this.status = "off";
    this.buffer = "";
  }

  start() {
    this.stopped = false;
    this._spawn();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this._kill();
    this._setStatus("off");
  }

  /** Привязки живут в самом скрипте — на смену перезапускаем опрос. */
  configure(hotkeys) {
    const next = hotkeys || {};
    const changed = describe(next) !== describe(this.hotkeys);
    this.hotkeys = next;
    if (!changed || this.stopped) return;
    this._kill();
    clearTimeout(this.timer);
    this.timer = null;
    this._spawn();
  }

  /** Строка привязок для скрипта. Пусто — вешать нечего. */
  bindings() {
    const parts = [];
    for (const [action, hotkey] of Object.entries(this.hotkeys)) {
      if (!hotkey) continue;
      const binding = parseHotkey(hotkey);
      if (!binding) {
        this.emit("log", t("клавиша «{hotkey}» непонятна — задай её заново в панели", { hotkey }));
        continue;
      }
      parts.push([action, binding.code, +binding.ctrl, +binding.alt, +binding.shift].join(","));
    }
    return parts.join(";");
  }

  _spawn() {
    const bindings = this.bindings();
    // Ни одной клавиши не задано — это не поломка, а нормальная настройка по
    // умолчанию: счётчик и кнопками в панели работает.
    if (!bindings) {
      this._setStatus("off");
      return;
    }

    if (process.platform !== "win32") {
      this._setStatus("error");
      this.emit("log", t("горячие клавиши пока только в Windows"));
      return;
    }

    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", HOTKEYS_SCRIPT,
      "-Bindings", bindings,
      "-IntervalMs", String(POLL_MS),
      // Сервер мог упасть, не убив нас за собой: скрипт следит за этим pid сам и
      // уходит следом, иначе PowerShell остался бы висеть до перезагрузки.
      "-ParentPid", String(process.pid),
    ];

    this.buffer = "";
    let child;
    try {
      child = spawn("powershell.exe", args, { windowsHide: true });
    } catch (error) {
      this._fail(t("не запустился PowerShell: {error}", { error: error.message }));
      return;
    }
    this.child = child;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this._onData(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim().split("\n")[0];
      if (text) this.emit("log", text);
    });

    child.on("error", (error) => this._fail(t("опрос клавиш не запустился: {error}", { error: error.message })));
    child.on("exit", () => {
      // Хоткей поменяли — прошлый опрос убили мы сами, и жаловаться в лог на его
      // смерть значит пугать стримера каждой правкой настроек.
      if (this.child !== child) return;
      this.child = null;
      if (this.stopped) return;
      this._fail(t("опрос клавиш прервался, перезапускаю…"));
    });

    this._setStatus("on");
  }

  _onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    // Последний кусок может быть недописанной строкой — оставляем до следующего раза.
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const action = line.trim();
      // Скрипт печатает только имена действий, которые сам же и получил, но
      // сверяемся с текущими привязками: настройки могли смениться, пока строка
      // ехала из процесса.
      if (action && this.hotkeys[action]) this.emit("press", action);
    }
  }

  _fail(text) {
    this._setStatus("error");
    this.emit("log", text);
    this._kill();

    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this._spawn();
    }, RESTART_MS);
  }

  _kill() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    try {
      child.kill();
    } catch {
      /* процесс уже ушёл — ловить нечего */
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}

function describe(hotkeys) {
  return Object.entries(hotkeys)
    .map(([action, hotkey]) => `${action}=${hotkey || ""}`)
    .sort()
    .join(";");
}
