// Офлайновая озвучка голосами Windows.
//
// Ничего не стоит, никуда не ходит и не зависит от чужих лимитов. Взамен —
// голос робота и та самая беда с русским: в списке видно только голоса SAPI5, а
// то, что ставится в «Параметрах → Речь → Добавить голоса», нередко доезжает
// одной лишь новой подсистемой (OneCore), которую System.Speech не видит.
// Поэтому панель показывает список как есть: чего в нём нет, тем не прочитать.
//
// Синтез делает скрипт на PowerShell (speak.ps1) — из Node к System.Speech не
// дотянуться. Текст уезжает файлом, звук возвращается файлом: аргументами такое
// не передать, а сообщение зрителя — чужой ввод.

import { spawn } from "node:child_process";
import { readFile, writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { TTS_SCRIPT } from "../paths.js";

// Синтез идёт локально и быстро, но чтение длинного сообщения — секунды.
const TIMEOUT_MS = 15000;

// Ниже этого в файле только заголовок wav: голос ничего не произнёс.
const SILENCE_BYTES = 1024;

export class WindowsVoice {
  constructor(config) {
    this.config = config || {};
  }

  /** Голос выбирать не обязательно: не выбран — читает голосом по умолчанию. */
  get ready() {
    return process.platform === "win32";
  }

  /** Лимитов у офлайнового голоса нет — и показывать в панели нечего. */
  async quota() {
    return null;
  }

  async voices() {
    const out = await run(["-List"], TIMEOUT_MS);
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, culture = ""] = line.split("\t");
        // Язык голоса нужен панели: голосом одного языка текст другого читается
        // молча, и предупредить об этом лучше до эфира, а не после.
        return { id: name, name: culture ? `${name} (${culture})` : name, culture };
      });
  }

  /**
   * Озвучить текст. Возвращает wav — его умеет играть любой браузер, а перегонять
   * во что-то компактнее нечем и незачем: звук живёт минуту и никуда не уезжает.
   */
  async synthesize(text) {
    if (!this.ready) throw new Error("голоса Windows есть только в Windows");

    const dir = await mkdtemp(path.join(tmpdir(), "rinka-tts-"));
    const textFile = path.join(dir, "text.txt");
    const wavFile = path.join(dir, "voice.wav");

    try {
      // С BOM: PowerShell читает файл как ANSI, если его нет, и кириллица
      // превращается в мусор.
      await writeFile(textFile, "﻿" + text, "utf8");

      const args = ["-TextFile", textFile, "-Out", wavFile];
      if (this.config.voice) args.push("-Voice", String(this.config.voice));
      if (Number.isFinite(Number(this.config.rate))) {
        // У System.Speech скорость — от -10 до 10.
        args.push("-Rate", String(clampRate(this.config.rate)));
      }

      await run(args, TIMEOUT_MS);
      const audio = await readFile(wavFile);

      /*
       * Голос читает только «свой» язык: английский голос на кириллице не
       * ругается, а молча пишет пустой wav — один заголовок и ни одного сэмпла.
       * Молчащий алерт выглядит как поломка неизвестно где, поэтому говорим прямо.
       */
      if (audio.length < SILENCE_BYTES) {
        throw new Error(
          `голос ${this.config.voice || "по умолчанию"} не прочитал текст — похоже, нужен голос того же языка`
        );
      }

      return { audio, ext: "wav" };
    } finally {
      // Временные файлы убираем всегда: озвучка идёт на каждый донат, и мусор
      // копился бы весь эфир.
      await Promise.all([quietly(textFile), quietly(wavFile)]);
    }
  }
}

function clampRate(value) {
  const rate = Math.round(Number(value) || 0);
  return Math.min(10, Math.max(-10, rate));
}

/** Запустить speak.ps1 и дождаться его. Вернёт то, что он написал в stdout. */
function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", TTS_SCRIPT, ...args],
      { windowsHide: true }
    );

    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { err += chunk; });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("озвучка не уложилась во время"));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`PowerShell не запустился: ${error.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(out);
        return;
      }
      // Простыню PowerShell в лог не тащим — только первую строку.
      const first = err.trim().split("\n")[0] || `код ${code}`;
      reject(new Error(first));
    });
  });
}

async function quietly(filePath) {
  try {
    await unlink(filePath);
  } catch {
    /* файла может не быть — синтез мог и не дойти до записи */
  }
}
