// Собирает папку для раздачи: приложение с окном панели наверху и сервер со всеми
// ресурсами в подпапке server. Сервер — standalone-бинарник через esbuild + Node SEA,
// поэтому Node на машине, куда всё уедет, не нужен.
//
//   dist/
//     rinkaStreamTools.exe          <- единственный файл, по которому надо щёлкать
//     server/
//       rinkaStreamTools-server.exe
//       public/
//
// Само приложение собирается своим тулчейном (cargo), здесь только подбирается
// готовое: без Rust на машине сборка сервера иначе падала бы на ровном месте.
//
// Запуск: npm run build:exe   (требует Node 20+)

import { build } from "esbuild";
import { inject } from "postject";
import { execFileSync } from "node:child_process";
import {
  mkdirSync, copyFileSync, cpSync, existsSync, readFileSync, writeFileSync, rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
const bundle = path.join(dist, "bundle.cjs");
const blob = path.join(dist, "sea-prep.blob");
const seaConfig = path.join(dist, "sea-config.json");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const exe = (name) => (isWin ? `${name}.exe` : name);

// Имя сервера намеренно не совпадает с именем приложения: в папке должен быть
// ровно один очевидный файл для запуска.
const serverPath = path.join(serverDir, exe("rinkaStreamTools-server"));
const appPath = path.join(dist, exe("rinkaStreamTools"));
const appBuilt = path.join(root, "desktop", "target", "release", exe("rinka-stream-tools-desktop"));
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

rmSync(dist, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

console.log("[1/6] Сборка бандла (esbuild)...");
await build({
  entryPoints: [path.join(root, "server.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: bundle,
  // Необязательные нативные ускорители ws — оставляем внешними (ws сам ловит их отсутствие).
  external: ["bufferutil", "utf-8-validate"],
  // import.meta.url в CJS-бандле не используется (см. src/paths.js) — глушим предупреждение.
  logOverride: { "empty-import-meta": "silent" },
});

console.log("[2/6] Генерация SEA-blob...");
writeFileSync(seaConfig, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
}));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

console.log("[3/6] Копирование бинарника Node...");
copyFileSync(process.execPath, serverPath);

console.log("[4/6] Внедрение blob (postject)...");
await inject(serverPath, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: FUSE,
  ...(isMac ? { machoSegmentName: "NODE_SEA" } : {}),
});

console.log("[5/6] Копирование public/ и приложения...");
// Ресурсы ищутся рядом с бинарником сервера, поэтому лежат в server/, а не в корне.
cpSync(path.join(root, "public"), path.join(serverDir, "public"), { recursive: true });
// Опрос медиасессии, офлайновая озвучка и горячие клавиши сделаны скриптами на
// PowerShell: в бандл они не попадают — их запускает отдельный процесс, а не
// Node. Путь относительно бинарника тот же, что в исходниках, чтобы искать их в
// двух режимах запуска не пришлось по-разному.
for (const script of ["nowplaying/session.ps1", "tts/speak.ps1", "counter/hotkeys.ps1"]) {
  cpSync(path.join(root, "src", script), path.join(serverDir, "src", script));
}
// Конфиг сервер создаст и сам при первом запуске; кладём образец, чтобы настройки
// можно было занести до него. Рядом — образцы таблицы донатеров и ленты: их формат
// иначе виден только после первого эфира, а занести донаты, прошедшие мимо
// программы, хочется до него.
for (const sample of ["config.example.json", "donors.example.json", "recent.example.json"]) {
  const from = path.join(root, sample);
  if (existsSync(from)) copyFileSync(from, path.join(serverDir, sample));
}

if (existsSync(appBuilt)) {
  copyFileSync(appBuilt, appPath);
  console.log("       + приложение с окном панели");
} else {
  console.log("       ПРИЛОЖЕНИЕ НЕ СОБРАНО — в папке останется только сервер,");
  console.log("       запускать его пришлось бы руками. Собрать:");
  console.log("       cd desktop && cargo build --release");
}

console.log("[6/6] Уборка промежуточных файлов...");
for (const leftover of [bundle, blob, seaConfig]) {
  rmSync(leftover, { force: true });
}

console.log(`\nГотово: ${dist}`);
console.log("Отдавать папку целиком: приложение без подпапки server работать не будет.");
