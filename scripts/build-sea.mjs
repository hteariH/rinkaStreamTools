// Собирает standalone-исполняемый файл (для текущей ОС) через esbuild + Node SEA.
// Результат: dist/rinkaStreamTools(.exe) вместе с public/ и config.json рядом —
// папку можно zip'нуть и отдать как есть.
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
const bundle = path.join(dist, "bundle.cjs");
const blob = path.join(dist, "sea-prep.blob");
const seaConfig = path.join(dist, "sea-config.json");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const exeName = isWin ? "rinkaStreamTools.exe" : "rinkaStreamTools";
const exePath = path.join(dist, exeName);
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

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
copyFileSync(process.execPath, exePath);

console.log("[4/6] Внедрение blob (postject)...");
await inject(exePath, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: FUSE,
  ...(isMac ? { machoSegmentName: "NODE_SEA" } : {}),
});

console.log("[5/6] Копирование public/ и config.json...");
// Без public/ рядом exe поднимется, но будет молча отдавать 404 на всё —
// поэтому ресурсы кладём в dist сразу, а не отдельным шагом упаковки.
cpSync(path.join(root, "public"), path.join(dist, "public"), { recursive: true });
// Конфиг exe создаст и сам при первом запуске; кладём образец, чтобы настройки
// можно было занести до него.
const configSample = path.join(root, "config.example.json");
if (existsSync(configSample)) {
  copyFileSync(configSample, path.join(dist, "config.example.json"));
}

// Оверлей поверх игры собирается своим тулчейном (cargo), поэтому здесь его не
// собираем, а лишь подбираем готовый: без Rust на машине сборка бы просто падала.
const overlayName = isWin ? "rinka-screamer-overlay.exe" : "rinka-screamer-overlay";
const overlayBuilt = path.join(root, "desktop-overlay", "target", "release", overlayName);
if (existsSync(overlayBuilt)) {
  copyFileSync(overlayBuilt, path.join(dist, overlayName));
  console.log("       + оверлей поверх игры");
} else {
  console.log("       оверлей поверх игры не собран — пропускаю");
  console.log("       собрать: cd desktop-overlay && cargo build --release");
}

console.log("[6/6] Уборка промежуточных файлов...");
for (const leftover of [bundle, blob, seaConfig]) {
  rmSync(leftover, { force: true });
}

console.log(`\nГотово: ${exePath}`);
console.log("Отдавать целиком папку dist — exe без public/ рядом работать не будет.");
