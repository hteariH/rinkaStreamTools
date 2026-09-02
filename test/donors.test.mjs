// Топ донатеров: объединение по имени между площадками и приведение к валюте цели.
// Складывать гривны с одной площадки и доллары с другой нельзя, а объединять по
// имени — единственный доступный способ: общего id у зрителя между площадками нет.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Donors } from "../src/donations/donors.js";

const RATES = { donationAlerts: 1, donatello: 0.5 };

function makeDonors(rates = RATES) {
  const dir = mkdtempSync(path.join(tmpdir(), "rst-donors-"));
  const donors = new Donors(path.join(dir, "donors.json"), (source) => rates[source]);
  return { donors, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const donation = (fields) => ({
  source: "donationAlerts",
  donorName: "Аня",
  amount: 0,
  at: 1,
  ...fields,
});

test("донаты одного человека складываются", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ amount: 10 }));
  donors.add(donation({ amount: 5.5 }));

  const [top] = donors.top();
  assert.equal(top.name, "Аня");
  assert.equal(top.total, 15.5);
  assert.equal(top.count, 2);
  cleanup();
});

test("один ник на двух площадках — один человек", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ source: "donationAlerts", amount: 10 }));
  donors.add(donation({ source: "donatello", amount: 10 }));

  const list = donors.top();
  assert.equal(list.length, 1, "имя не объединилось между площадками");
  // Donatello приведён множителем 0.5, поэтому 10 + 10 × 0.5 = 15.
  assert.equal(list[0].total, 15);
  assert.deepEqual(list[0].sources, ["donationAlerts", "donatello"]);
  cleanup();
});

test("регистр и пробелы в нике не разводят человека на двоих", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ donorName: "MaxPower", amount: 10 }));
  donors.add(donation({ donorName: "  maxpower ", amount: 5 }));

  const list = donors.top();
  assert.equal(list.length, 1);
  assert.equal(list[0].total, 15);
  // Показываем последнее написание: человек мог сменить ник.
  assert.equal(list[0].name, "maxpower");
  cleanup();
});

test("анонимные донаты в список не идут, но учитываются отдельно", () => {
  const { donors, cleanup } = makeDonors();
  assert.equal(donors.add(donation({ donorName: null, amount: 7 })), null);
  assert.equal(donors.add(donation({ donorName: "   ", amount: 3 })), null);
  donors.add(donation({ donorName: "Аня", amount: 1 }));

  assert.equal(donors.top().length, 1, "аноним попал в список");
  assert.equal(donors.anonymous.count, 2);
  assert.equal(donors.anonymous.total, 10);
  cleanup();
});

test("список идёт сверху вниз, при равных суммах выше тот, кто занёс раньше", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ donorName: "Первый", amount: 10, at: 100 }));
  donors.add(donation({ donorName: "Второй", amount: 10, at: 200 }));
  donors.add(donation({ donorName: "Третий", amount: 50, at: 300 }));

  assert.deepEqual(donors.top().map((d) => d.name), ["Третий", "Первый", "Второй"]);
  cleanup();
});

test("таблица переживает перезапуск", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rst-donors-"));
  const file = path.join(dir, "donors.json");

  const first = new Donors(file, (source) => RATES[source]);
  first.add(donation({ donorName: "Аня", amount: 12 }));
  first.add(donation({ donorName: null, amount: 3 }));
  await first.save();

  const second = new Donors(file, (source) => RATES[source]);
  await second.load();

  assert.deepEqual(second.top().map((d) => [d.name, d.total]), [["Аня", 12]]);
  assert.equal(second.anonymous.count, 1);
  assert.equal(second.anonymous.total, 3);

  rmSync(dir, { recursive: true, force: true });
});

test("испорченный файл не роняет сервер", async () => {
  const donors = new Donors(path.join(tmpdir(), "нет-такого-файла-rst.json"), () => 1);
  await donors.load();
  assert.deepEqual(donors.top(), []);
});

test("сброс очищает и людей, и анонимов", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ amount: 10 }));
  donors.add(donation({ donorName: null, amount: 5 }));
  donors.reset();

  assert.deepEqual(donors.top(), []);
  assert.equal(donors.anonymous.count, 0);
  cleanup();
});

test("донатера можно убрать из таблицы", () => {
  const { donors, cleanup } = makeDonors();
  donors.add(donation({ donorName: "Аня", amount: 10 }));
  donors.add(donation({ donorName: "Гадкий ник", amount: 5 }));

  // Имя сравнивается без регистра — тем же ключом, что и объединение донатов.
  assert.equal(donors.remove("гадкий НИК"), true);
  assert.equal(donors.remove("кого нет"), false);
  assert.deepEqual(donors.all().map((entry) => entry.name), ["Аня"]);
  cleanup();
});

test("донат мимо площадок добавляется руками и складывается с прежними", () => {
  const { donors, cleanup } = makeDonors({ donationAlerts: 2 });
  donors.add(donation({ donorName: "Аня", amount: 10 }));

  // Множитель площадки к ручной сумме не применяется: площадки тут не было.
  const entry = donors.addManual("Аня", 5);
  assert.equal(entry.total, 25, "20 с площадки по множителю 2 плюс 5 наличными");
  assert.equal(entry.count, 2);
  assert.ok(entry.sources.includes("manual"));
  cleanup();
});

test("пустое имя или сумма не создают донатера", () => {
  const { donors, cleanup } = makeDonors();
  assert.equal(donors.addManual("", 10), null);
  assert.equal(donors.addManual("Аня", 0), null);
  assert.equal(donors.addManual("Аня", -5), null);
  assert.equal(donors.all().length, 0);
  cleanup();
});
