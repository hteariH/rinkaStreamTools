// Медиатека алертов: что берём в папку, что отдаём наружу и что показываем на
// конкретном донате.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Media, safeName, kindOf } from "../src/media.js";
import { App } from "../src/app.js";
import { DEFAULTS } from "../src/config.js";

function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("имя файла отрезается до безопасного", () => {
  assert.equal(safeName("coin.gif"), "coin.gif");
  // Путь из имени убирается целиком — уйти из папки нечем.
  assert.equal(safeName("../../secret.gif"), "secret.gif");
  assert.equal(safeName("C:\\Windows\\system32\\evil.png"), "evil.png");
  // Кириллица и пробелы остаются: файлы называет человек.
  assert.equal(safeName("котик прыгает.gif"), "котик прыгает.gif");
  // Всё, из чего не выйдет картинки или звука, — мимо.
  assert.equal(safeName("script.exe"), null);
  assert.equal(safeName("..") , null);
  assert.equal(safeName(""), null);
});

test("вид файла определяется по расширению", () => {
  assert.equal(kindOf("a.gif"), "image");
  assert.equal(kindOf("a.WEBP"), "image");
  assert.equal(kindOf("a.mp3"), "sound");
  assert.equal(kindOf("a.txt"), null);
});

test("файл с занятым именем не затирает старый, а получает номер", async () => {
  const dir = tempDir("rst-media-");
  const media = new Media(dir);

  assert.equal(await media.save("coin.gif", Buffer.from("один")), "coin.gif");
  assert.equal(await media.save("coin.gif", Buffer.from("два")), "coin (2).gif");
  assert.equal(await media.save("coin.gif", Buffer.from("три")), "coin (3).gif");

  const { images } = await media.list();
  assert.deepEqual(images.map((file) => file.name), ["coin (2).gif", "coin (3).gif", "coin.gif"]);
  rmSync(dir, { recursive: true, force: true });
});

test("в список идут только картинки и звуки", async () => {
  const dir = tempDir("rst-media-");
  writeFileSync(path.join(dir, "cat.gif"), "gif");
  writeFileSync(path.join(dir, "ding.mp3"), "mp3");
  writeFileSync(path.join(dir, "заметки.txt"), "текст");

  const { images, sounds } = await new Media(dir).list();
  assert.deepEqual(images.map((file) => file.name), ["cat.gif"]);
  assert.deepEqual(sounds.map((file) => file.name), ["ding.mp3"]);
  rmSync(dir, { recursive: true, force: true });
});

test("нет папки — пустая медиатека, а не ошибка", async () => {
  const media = new Media(path.join(tmpdir(), "rst-media-которой-нет"));
  assert.deepEqual(await media.list(), { images: [], sounds: [] });
});

test("путь наружу папки не отдаётся", () => {
  const dir = tempDir("rst-media-");
  const media = new Media(dir);

  assert.equal(media.pathFor("cat.gif"), path.join(dir, "cat.gif"));
  // Имя обрезается до файла, поэтому чужой конфиг по такому запросу не откроется.
  assert.equal(media.pathFor("../../config.json"), null);
  assert.equal(media.pathFor("../cat.gif"), path.join(dir, "cat.gif"));

  // Папка с прямыми слэшами — путь всё равно должен сойтись: на Windows
  // path.resolve вернёт обратные, и сравнение строк тут врало бы.
  const slashed = new Media(dir.replace(/\\/g, "/"));
  assert.notEqual(slashed.pathFor("cat.gif"), null);
  rmSync(dir, { recursive: true, force: true });
});

/** App без start(): порт не занимаем и в сеть не ходим. */
function makeApp(tierPatch) {
  const config = structuredClone(DEFAULTS);
  Object.assign(config.alerts.tiers[2], tierPatch);
  const app = new App(config);
  const dir = tempDir("rst-media-app-");
  app.donors.filePath = path.join(dir, "donors.json");
  app.recent.filePath = path.join(dir, "recent.json");
  return { app, tier: app.config.alerts.tiers[2], cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("на донат берётся только то, что и правда лежит в папке", () => {
  const { app, tier, cleanup } = makeApp({ images: ["есть.gif", "нет.gif"], sounds: ["нет.mp3"] });
  app.mediaFiles = { images: [{ name: "есть.gif" }], sounds: [] };

  const picked = app.pickMedia(tier);
  assert.equal(picked.image, "есть.gif", "показали файл, которого нет на диске");
  assert.equal(picked.sound, null, "заиграл звук, которого нет на диске");
  cleanup();
});

test("две одинаковых гифки подряд не выпадают", () => {
  const { app, tier, cleanup } = makeApp({ images: ["a.gif", "b.gif"], sounds: [] });
  app.mediaFiles = { images: [{ name: "a.gif" }, { name: "b.gif" }], sounds: [] };

  let previous = app.pickMedia(tier).image;
  for (let i = 0; i < 20; i += 1) {
    const next = app.pickMedia(tier).image;
    assert.notEqual(next, previous, "одна и та же гифка два раза подряд");
    previous = next;
  }
  cleanup();
});

test("единственная гифка повторяется — это не повод показать пусто", () => {
  const { app, tier, cleanup } = makeApp({ images: ["одна.gif"], sounds: [] });
  app.mediaFiles = { images: [{ name: "одна.gif" }], sounds: [] };

  assert.equal(app.pickMedia(tier).image, "одна.gif");
  assert.equal(app.pickMedia(tier).image, "одна.gif");
  cleanup();
});

test("тир без медиа — алерт без картинки и без своего звука", () => {
  const { app, tier, cleanup } = makeApp({});
  assert.deepEqual(app.pickMedia(tier), { image: null, sound: null });
  cleanup();
});
