// Лента последних донатов: порядок, анонимы, длинные сообщения и то, что она
// переживает перезапуск. В отличие от топа тут не сумма за всё время, а сами
// донаты — каждый в валюте, в которой пришёл.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Recent } from "../src/donations/recent.js";

function makeRecent() {
  const dir = mkdtempSync(path.join(tmpdir(), "rst-recent-"));
  const file = path.join(dir, "recent.json");
  return { recent: new Recent(file), file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const donation = (fields) => ({
  id: "da-1",
  source: "donationAlerts",
  donorName: "Аня",
  amount: 10,
  currency: "USD",
  message: null,
  at: 1000,
  ...fields,
});

test("свежий донат идёт первым", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ id: "1", donorName: "Первый", at: 100 }));
  recent.add(donation({ id: "2", donorName: "Второй", at: 200 }));

  assert.deepEqual(recent.list().map((d) => d.name), ["Второй", "Первый"]);
  cleanup();
});

test("суммы не сводятся к одной валюте — каждый донат в своей", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ id: "1", source: "donatello", amount: 500, currency: "UAH" }));
  recent.add(donation({ id: "2", amount: 10, currency: "USD" }));

  assert.deepEqual(
    recent.list().map((d) => [d.amount, d.currency]),
    [[10, "USD"], [500, "UAH"]]
  );
  cleanup();
});

test("анонимы остаются в ленте, но без выдуманного имени", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ donorName: null }));
  recent.add(donation({ id: "2", donorName: "   " }));

  assert.equal(recent.list().length, 2, "аноним выпал из ленты");
  assert.deepEqual(recent.list().map((d) => d.name), [null, null]);
  cleanup();
});

test("длинное сообщение обрезается — в панели у строки один экран в ширину", () => {
  const { recent, cleanup } = makeRecent();
  const entry = recent.add(donation({ message: "а".repeat(300) }));

  assert.equal(entry.message.length, 140);
  assert.ok(entry.message.endsWith("…"));
  cleanup();
});

test("пустое сообщение не превращается в пустую строку под донатом", () => {
  const { recent, cleanup } = makeRecent();
  assert.equal(recent.add(donation({ message: "   " })).message, null);
  assert.equal(recent.add(donation({ id: "2", message: undefined })).message, null);
  cleanup();
});

test("в ленте показывается столько строк, сколько задано, а хранится запас", () => {
  const { recent, cleanup } = makeRecent();
  for (let i = 0; i < 60; i += 1) recent.add(donation({ id: String(i), at: i }));

  assert.equal(recent.list(3).length, 3);
  // Число мест меняется на лету, и после «покажи не 3, а 10» лента не должна
  // начинать копиться заново.
  assert.equal(recent.list(50).length, 50);
  cleanup();
});

test("лента переживает перезапуск", async () => {
  const { recent, file, cleanup } = makeRecent();
  recent.add(donation({ id: "1", donorName: "Аня", amount: 12, currency: "USD", at: 100 }));
  recent.add(donation({ id: "2", donorName: null, amount: 3, currency: "UAH", at: 200 }));
  await recent.save();

  const second = new Recent(file);
  await second.load();

  assert.deepEqual(
    second.list().map((d) => [d.name, d.amount, d.currency]),
    [[null, 3, "UAH"], ["Аня", 12, "USD"]]
  );
  cleanup();
});

test("испорченный файл не роняет сервер", async () => {
  const { recent, file, cleanup } = makeRecent();
  writeFileSync(file, "{ это не json", "utf8");
  await recent.load();
  assert.deepEqual(recent.list(), []);
  cleanup();
});

test("сброс очищает ленту", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({}));
  recent.reset();
  assert.deepEqual(recent.list(), []);
  cleanup();
});

test("на оверлей уходит только имя и сумма — бегущая строка, сообщений там нет", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ donorName: "Аня", amount: 10, currency: "USD", message: "спасибо" }));

  const snapshot = recent.snapshot({ title: "Последние донаты", limit: 3, speed: 90 }, "neon");
  assert.equal(snapshot.type, "recent");
  assert.equal(snapshot.theme, "neon");
  assert.equal(snapshot.speed, 90);
  assert.deepEqual(snapshot.donations, [
    { id: "da-1", name: "Аня", amount: 10, currency: "USD" },
  ], "в бегущую строку попало лишнее — сообщение или время");
  cleanup();
});

test("без заданной скорости строка едет, а не стоит", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({}));

  assert.equal(recent.snapshot({ limit: 3 }, "default").speed, 60);
  assert.equal(recent.snapshot({ limit: 3, speed: 0 }, "default").speed, 60);
  cleanup();
});

test("в панель уходит вся лента с сообщениями", () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ message: "спасибо" }));

  const [first] = recent.history();
  assert.equal(first.message, "спасибо");
  assert.ok(first.at > 0, "в панели время нужно — по нему сверяют, дошёл ли донат");
  cleanup();
});

test("донат можно убрать из ленты", async () => {
  const { recent, cleanup } = makeRecent();
  recent.add(donation({ id: "a", donorName: "Аня" }));
  recent.add(donation({ id: "b", donorName: "Гадкий ник" }));

  assert.equal(recent.remove("b"), true);
  assert.equal(recent.remove("b"), false, "второй раз убирать уже нечего");
  assert.deepEqual(recent.list().map((item) => item.id), ["a"]);
  await cleanup();
});

test("донат мимо площадок добавляется в ленту руками", async () => {
  const { recent, cleanup } = makeRecent();
  const entry = recent.addManual({ name: "Аня", amount: 500, currency: "UAH", message: "наличными" });

  assert.equal(entry.amount, 500);
  assert.equal(entry.currency, "UAH");
  assert.equal(recent.list()[0].id, entry.id, "новый донат должен быть сверху");
  // Сообщение видно в панели, но на оверлей лента его не отдаёт.
  assert.equal(recent.snapshot({ limit: 5 }, "default").donations[0].message, undefined);
  await cleanup();
});

test("донат без суммы в ленту не идёт", async () => {
  const { recent, cleanup } = makeRecent();
  assert.equal(recent.addManual({ name: "Аня", amount: 0, currency: "USD" }), null);
  assert.equal(recent.list().length, 0);
  await cleanup();
});
