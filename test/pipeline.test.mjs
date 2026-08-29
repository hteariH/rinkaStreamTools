// Связка «донат → тир → алерт/скример → таблица донатеров и лента последних» на
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
