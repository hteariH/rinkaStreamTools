// Связка «донат → тир → алерт → таблица донатеров и лента последних» на
// настоящем пути, а не через кнопку проверки: тестовый донат намеренно не идёт ни
// в цель, ни в таблицу, ни в ленту, поэтому кнопкой эту часть не проверить.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { App } from "../src/app.js";
import { DEFAULTS } from "../src/config.js";

/**
 * App без start(): порт не занимаем и в сеть не ходим. Рассылка в этом состоянии
 * молча никуда не уходит, а состояние считается как обычно — именно оно и нужно.
 */
function makeApp(patch = {}) {
  const config = structuredClone(DEFAULTS);
  Object.assign(config, patch);
  const app = new App(config);

  // Таблица донатеров и лента последних донатов пишутся на диск — уводим обе во
  // временную папку, иначе тест затирает данные живого эфира рядом с конфигом.
  const dir = mkdtempSync(path.join(tmpdir(), "rst-pipeline-"));
  app.donors.filePath = path.join(dir, "donors.json");
  app.recent.filePath = path.join(dir, "recent.json");
  app.tron.statePath = path.join(dir, "tron.json");

  return { app, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const donation = (fields) => ({
  id: "d1",
  source: "donationAlerts",
  donorName: "Аня",
  amount: 10,
  currency: "USD",
  baseAmount: null,
  message: null,
  at: Date.now(),
  ...fields,
});

/** Что ушло в сокет алертов: только сами алерты, без приветствий. */
function captureAlerts(app) {
  const alerts = [];
  const broadcast = app.hub.broadcast.bind(app.hub);
  app.hub.broadcast = (channel, message) => {
    if (channel === "/ws/alerts" && message.type === "alert") alerts.push(message);
    broadcast(channel, message);
  };
  return alerts;
}

const tronDonation = (fields) => donation({
  id: "tron-tx1",
  source: "tron",
  donorName: "TJTK…eKfa",
  amount: 25,
  currency: "USDT",
  ...fields,
});

test("свежий перевод USDT доходит до алерта, топа и ленты", async () => {
  const { app, cleanup } = makeApp();
  const alerts = captureAlerts(app);

  await app.onDonation(tronDonation());

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].tier, "big");
  assert.equal(app.topSnapshot().donors[0].name, "TJTK…eKfa");
  assert.equal(app.recent.history().length, 1);
  cleanup();
});

test("перевод, пришедший пока программа была закрыта: топ и лента да, алерт нет", async () => {
  const { app, cleanup } = makeApp();
  const alerts = captureAlerts(app);

  await app.onDonation(tronDonation({ quiet: true }));

  assert.equal(alerts.length, 0);
  assert.equal(app.topSnapshot().donors[0].total, 25);
  assert.equal(app.recent.history().length, 1);
  cleanup();
});

test("галочка площадки в тире выключает алерты USDT", async () => {
  const { app, cleanup } = makeApp();
  const alerts = captureAlerts(app);
  for (const tier of app.config.alerts.tiers) tier.sources.tron = false;

  await app.onDonation(tronDonation());

  assert.equal(alerts.length, 0);
  cleanup();
});

test("множитель USDT применяется в топе, как у остальных площадок", async () => {
  const { app, cleanup } = makeApp();
  app.config.tron = { ...app.config.tron, rate: 0.5 };

  await app.onDonation(tronDonation({ amount: 10 }));

  assert.equal(app.topSnapshot().donors[0].total, 5);
  cleanup();
});

test("USDT виден в цели и в статусах панели, выключенный — как выключенный", () => {
  const { app, cleanup } = makeApp();

  assert.equal(app.goal.snapshot().sources.tron.enabled, false);
  assert.equal(app.controlState().status.tron, "off");
  cleanup();
});

test("команда обнуления сбрасывает сумму USDT и отвечает панели", async () => {
  const { app, cleanup } = makeApp();
  app.config.tron = { ...app.config.tron, enabled: true, address: "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb" };
  app.tron.config = app.config.tron;
  app.tron.state = { address: app.tron.address, since: 1, cursor: 1, amount: 40, seen: {} };

  const sent = [];
  app.handleCommand({ type: "tron.reset" }, { readyState: 1, send: (text) => sent.push(JSON.parse(text)) });
  await app.tron.saving;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(app.tron.amount, 0);
  assert.equal(app.goal.snapshot().sources.tron.amount, 0);
  assert.equal(sent[0].type, "toast");
  cleanup();
});

test("настоящий донат попадает в таблицу донатеров", () => {
  const { app, cleanup } = makeApp();
  app.onDonation(donation({ amount: 10 }));

  const top = app.topSnapshot();
  assert.equal(top.donors.length, 1);
  assert.equal(top.donors[0].name, "Аня");
  assert.equal(top.donors[0].total, 10);
  cleanup();
});

test("донат из кнопки проверки в таблицу не идёт", () => {
  const { app, cleanup } = makeApp();
  app.onDonation(donation({ amount: 10, test: true }));

  assert.deepEqual(app.topSnapshot().donors, [], "тестовый донат попал в таблицу");
  cleanup();
});

test("настоящий донат попадает в ленту последних, а тестовый — нет", () => {
  const { app, cleanup } = makeApp();
  app.onDonation(donation({ amount: 10 }));
  app.onDonation(donation({ amount: 99, test: true }));

  const recent = app.recentSnapshot();
  assert.equal(recent.donations.length, 1, "тестовый донат попал в ленту");
  assert.equal(recent.donations[0].amount, 10);
  cleanup();
});

test("в ленте аноним остаётся, а в таблице донатеров его нет", () => {
  const { app, cleanup } = makeApp();
  app.onDonation(donation({ donorName: null, amount: 7 }));

  assert.equal(app.recentSnapshot().donations.length, 1, "аноним выпал из ленты");
  assert.deepEqual(app.topSnapshot().donors, [], "аноним попал в таблицу");
  cleanup();
});

test("в ленте сумма остаётся в валюте доната, множитель площадки к ней не идёт", () => {
  const { app, cleanup } = makeApp({
    donatello: { ...DEFAULTS.donatello, rate: 0.5 },
  });
  app.onDonation(donation({ source: "donatello", amount: 10, currency: "UAH" }));

  const [first] = app.recentSnapshot().donations;
  assert.equal(first.amount, 10, "к ленте применился множитель площадки");
  assert.equal(first.currency, "UAH");
  cleanup();
});

test("один ник с двух площадок складывается с учётом множителей", () => {
  const { app, cleanup } = makeApp({
    donationAlerts: { ...DEFAULTS.donationAlerts, rate: 1 },
    donatello: { ...DEFAULTS.donatello, rate: 0.5 },
  });

  app.onDonation(donation({ source: "donationAlerts", amount: 10 }));
  app.onDonation(donation({ source: "donatello", amount: 10 }));

  const top = app.topSnapshot();
  assert.equal(top.donors.length, 1, "ник не объединился между площадками");
  assert.equal(top.donors[0].total, 15);
  cleanup();
});

test("в списке ровно столько мест, сколько задано", () => {
  const { app, cleanup } = makeApp({ top: { title: "", limit: 2 } });
  for (const name of ["Первый", "Второй", "Третий"]) {
    app.onDonation(donation({ donorName: name, amount: 10 }));
  }

  const top = app.topSnapshot();
  assert.equal(top.donors.length, 2);
  assert.equal(top.totalDonors, 3, "общее число донатеров считается по всем, а не по списку");
  cleanup();
});

test("суммы в таблице приведены к валюте цели", () => {
  const { app, cleanup } = makeApp({ goal: { ...DEFAULTS.goal, currency: "EUR" } });
  app.onDonation(donation({ amount: 10 }));

  assert.equal(app.topSnapshot().currency, "EUR");
  cleanup();
});
