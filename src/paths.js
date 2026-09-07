// Определяет каталог с ресурсами (public/, config.json) для двух режимов запуска:
//  - обычный `node server.js` — корень проекта (папка над src/);
//  - standalone-сборка (Node SEA, .exe) — папка рядом с исполняемым файлом,
//    чтобы config.json и public/ можно было редактировать рядом с exe.

import path from "node:path";
import os from "node:os";
import process from "node:process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// require, работающий в обоих режимах: в настоящем ESM (node server.js) его нет —
// создаём через createRequire; в esbuild-CJS-бандле (standalone exe) он глобальный.
// typeof для необъявленного идентификатора безопасен и не бросает ошибку.
// eslint-disable-next-line no-undef
const req = (typeof require !== "undefined") ? require : createRequire(import.meta.url);

function isSea() {
  try {
    return req("node:sea").isSea();
  } catch {
    return false;
  }
}

export const BASE_DIR = isSea()
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLIC_DIR = path.join(BASE_DIR, "public");

/*
 * Данные стримера — настройки, таблица донатеров, лента и медиа алертов — лежат
 * отдельно от самой программы.
 *
 * Раньше они жили рядом с exe, и это ломалось об обычную привычку обновляться:
 * браузер распаковывает новый архив в соседнюю папку «имя (1)», человек запускает
 * оттуда — и оказывается с чистыми настройками, а прошлые донаты остаются в
 * старой папке. Профиль пользователя от того, куда распакована программа, не
 * зависит вовсе.
 *
 * Портативный режим никуда не делся: если рядом с exe лежит папка data, берётся
 * она — это для флешки и для тех, кто хочет держать всё в одном месте.
 *
 * Ищется она в двух местах: рядом с сервером и этажом выше, рядом с самим
 * приложением. Человек видит в папке rinkaStreamTools.exe и server/, и класть
 * data он будет к тому, по чему щёлкает, — а сервер лежит внутри server/.
 *
 * В разработке (обычный `node server.js`) всё как было, в корне репозитория:
 * запуск из исходников не должен трогать данные живого эфира.
 */
const PORTABLE_DIRS = [
  // Рядом с приложением: сюда её и положат, глядя на rinkaStreamTools.exe.
  path.join(BASE_DIR, "..", "data"),
  // Рядом с сервером — если положили именно туда.
  path.join(BASE_DIR, "data"),
];

function profileDir() {
  // APPDATA есть только в Windows; на остальных системах — привычный ~/.config.
  const base = process.env.APPDATA || process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "rinkaStreamTools");
}

export const DATA_DIR = !isSea()
  ? BASE_DIR
  : PORTABLE_DIRS.find((dir) => existsSync(dir)) ?? profileDir();

export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
// Таблица донатеров и лента последних донатов — данные, а не настройки, поэтому
// лежат отдельно от конфига и друг от друга: очистить одно, не трогая другое,
// иначе было бы нельзя.
export const DONORS_PATH = path.join(DATA_DIR, "donors.json");
export const RECENT_PATH = path.join(DATA_DIR, "recent.json");
// Гифки и звуки алертов, которые стример добавил сам.
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const NOWPLAYING_SCRIPT = path.join(BASE_DIR, "src", "nowplaying", "session.ps1");
// Офлайновая озвучка — тоже через PowerShell и по тому же правилу.
export const TTS_SCRIPT = path.join(BASE_DIR, "src", "tts", "speak.ps1");
// Горячие клавиши счётчика: клавиатуру опрашивает такой же скрипт.
export const HOTKEYS_SCRIPT = path.join(BASE_DIR, "src", "counter", "hotkeys.ps1");
