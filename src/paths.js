// Определяет каталог с ресурсами (public/, config.json) для двух режимов запуска:
//  - обычный `node server.js` — корень проекта (папка над src/);
//  - standalone-сборка (Node SEA, .exe) — папка рядом с исполняемым файлом,
//    чтобы config.json и public/ можно было редактировать рядом с exe.

import path from "node:path";
import process from "node:process";
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
export const CONFIG_PATH = path.join(BASE_DIR, "config.json");
