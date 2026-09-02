// Переезд данных из папки программы в профиль. Это делается один раз при первом
// запуске новой версии, и ошибиться тут дорого: за этими файлами вся история
// эфиров и настроенные площадки.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { migrateData } from "../src/data.js";

function dirs() {
  const from = mkdtempSync(path.join(tmpdir(), "rst-old-"));
  const to = mkdtempSync(path.join(tmpdir(), "rst-new-"));
  return {
    from,
    to,
    cleanup: () => {
      rmSync(from, { recursive: true, force: true });
      rmSync(to, { recursive: true, force: true });
    },
  };
}

test("настройки, донаты и медиа переезжают в новое место", async () => {
  const { from, to, cleanup } = dirs();
  writeFileSync(path.join(from, "config.json"), '{"port":3777}');
  writeFileSync(path.join(from, "donors.json"), '{"donors":[]}');
  writeFileSync(path.join(from, "recent.json"), '{"donations":[]}');
  mkdirSync(path.join(from, "media"));
  writeFileSync(path.join(from, "media", "котик.gif"), "gif");

  const moved = await migrateData(from, to);

  assert.deepEqual(moved, ["config.json", "donors.json", "recent.json", "media/котик.gif"]);
  assert.equal(readFileSync(path.join(to, "config.json"), "utf8"), '{"port":3777}');
  assert.ok(existsSync(path.join(to, "media", "котик.gif")));
  // Старое остаётся на месте: откат на прошлую версию не должен остаться ни с чем.
  assert.ok(existsSync(path.join(from, "config.json")));
  cleanup();
});

test("второй запуск ничего не трогает", async () => {
  const { from, to, cleanup } = dirs();
  writeFileSync(path.join(from, "config.json"), '{"port":1}');

  assert.deepEqual(await migrateData(from, to), ["config.json"]);
  assert.deepEqual(await migrateData(from, to), [], "переезд повторился");
  cleanup();
});

test("свежие настройки не затираются старыми", async () => {
  const { from, to, cleanup } = dirs();
  writeFileSync(path.join(from, "config.json"), '{"port":1111}');
  writeFileSync(path.join(to, "config.json"), '{"port":2222}');

  await migrateData(from, to);

  // На новом месте главное — то, что там уже есть: человек мог настроить программу
  // заново, и вернуть ему прошлогодний конфиг значит потерять свежую работу.
  assert.equal(readFileSync(path.join(to, "config.json"), "utf8"), '{"port":2222}');
  cleanup();
});

test("переезжать некуда — не ошибка", async () => {
  const { from, to, cleanup } = dirs();
  assert.deepEqual(await migrateData(from, to), []);
  cleanup();
});

test("одна и та же папка не копируется сама в себя", async () => {
  const { from, cleanup } = dirs();
  writeFileSync(path.join(from, "config.json"), "{}");
  assert.deepEqual(await migrateData(from, from), []);
  cleanup();
});
