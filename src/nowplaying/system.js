// Что играет — по медиасессии Windows (SMTC). Это тот же источник, из которого
// всплывашка громкости знает про Spotify, AIMP, foobar и ролик во вкладке
// браузера: плеер уже рассказал системе, что у него на экране, и настраивать в
// самом плеере ничего не надо.
//
// Из Node в WinRT напрямую не дотянуться без нативного модуля, поэтому опрос
// делает маленький скрипт на PowerShell (лежит рядом, session.ps1): один
// долгоживущий процесс печатает по строке JSON, здесь их только читают. Спавнить
// PowerShell на каждый опрос было бы дороже самого опроса.

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import process from "node:process";

import { NOWPLAYING_SCRIPT } from "../paths.js";
import { t } from "../i18n.js";

const RESTART_MS = 15000;

export class SystemMediaSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.child = null;
    this.timer = null;
    this.stopped = true;
    this.status = "off";
    this.buffer = "";
    // Что видели в прошлый раз: список приложений приходит на каждом опросе, а
    // меняется он редко — рассылать одно и то же дважды в секунду незачем.
    this.lastApps = "";
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

  /** Фильтр приложения и частота опроса живут в самом скрипте — перезапускаем. */
  configure(config) {
    const changed =
      config.appFilter !== this.config.appFilter ||
      config.pollIntervalMs !== this.config.pollIntervalMs;
    this.config = config;
    if (!changed || this.stopped) return;
    this._kill();
    this._spawn();
  }

  _spawn() {
    if (process.platform !== "win32") {
      // Медиасессии нет — это не поломка, а другая ОС. Отмечаем статусом и не
      // пытаемся перезапускаться по кругу.
      this._setStatus("error");
      this.emit("log", t("медиасессия есть только в Windows — выбери источник «файл»"));
      return;
    }

    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", NOWPLAYING_SCRIPT,
      "-AppFilter", String(this.config.appFilter || ""),
      "-IntervalMs", String(Math.max(300, Number(this.config.pollIntervalMs) || 1500)),
      // Сервер мог упасть, не убив нас за собой: скрипт следит за этим pid сам и
      // уходит следом, иначе PowerShell остался бы висеть до перезагрузки.
      "-ParentPid", String(process.pid),
    ];

    this.buffer = "";
    this.lastApps = "";
    try {
      this.child = spawn("powershell.exe", args, { windowsHide: true });
    } catch (error) {
      this._fail(t("не запустился PowerShell: {error}", { error: error.message }));
      return;
    }

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this._onData(chunk));
    // stderr скрипта — его собственные ошибки, а не поток данных: в лог уходит
    // одной строкой, чтобы простыня PowerShell не забила панель.
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim().split("\n")[0];
      if (text) this.emit("log", text);
    });

    this.child.on("error", (error) => this._fail(t("опрос не запустился: {error}", { error: error.message })));
    this.child.on("exit", () => {
      this.child = null;
      if (this.stopped) return;
      this._fail(t("опрос прервался, перезапускаю…"));
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    // Последний кусок может быть недописанной строкой — оставляем до следующего раза.
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const text = line.trim();
      if (!text.startsWith("{")) continue;

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }

      if (payload.error) {
        this._fail(payload.error);
        return;
      }

      this._setStatus("on");

      /*
       * Список приложений нужен панели: по нему стример выбирает, что писать в
       * фильтр, чтобы не хватать ролики из браузера. Но приходит он с каждым
       * опросом, то есть дважды в секунду, а меняется — когда открыли или закрыли
       * плеер. Раньше на каждый такой список панель получала всё состояние
       * целиком и перерисовывалась заново: за пару часов эфира это тысячи
       * лишних перерисовок, и тем тяжелее, чем больше накопилось донатов и лога.
       */
      const apps = Array.isArray(payload.apps) ? payload.apps : [];
      const key = JSON.stringify(apps);
      if (key !== this.lastApps) {
        this.lastApps = key;
        this.emit("apps", apps);
      }
      this.emit("track", payload.track || null);
    }
  }

  _fail(text) {
    this._setStatus("error");
    this.emit("log", text);
    this.emit("track", null);
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
