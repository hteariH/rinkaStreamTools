// Тиры донатов: во что попадает донат и что делать, если тир выключен для площадки.
// Пороги берём из тех же значений по умолчанию, что видит пользователь в панели.

import test from "node:test";
import assert from "node:assert/strict";

import { tierFor } from "../src/donations/rules.js";
import { DEFAULTS } from "../src/config.js";

const BASE = DEFAULTS.screamer.baseCurrency;
const tiers = () => structuredClone(DEFAULTS.alerts.tiers);

const donation = (fields) => ({
  source: "donationAlerts",
  amount: 0,
  currency: "USD",
  baseAmount: null,
  ...fields,
});

const idOf = (match) => (match ? match.tier.id : null);

test("тир выбирается по сумме, границы включительно", () => {
  const list = tiers();
  assert.equal(idOf(tierFor(donation({ amount: 0.5 }), list, BASE)), null);
  assert.equal(idOf(tierFor(donation({ amount: 1 }), list, BASE)), "small");
  assert.equal(idOf(tierFor(donation({ amount: 4.99 }), list, BASE)), "small");
  assert.equal(idOf(tierFor(donation({ amount: 5 }), list, BASE)), "medium");
  assert.equal(idOf(tierFor(donation({ amount: 19.99 }), list, BASE)), "medium");
  assert.equal(idOf(tierFor(donation({ amount: 20 }), list, BASE)), "big");
  assert.equal(idOf(tierFor(donation({ amount: 1000 }), list, BASE)), "big");
});

test("сумма сверяется с порогом своей валюты, курсы не применяются", () => {
  const list = tiers();
  // 250 UAH — это меньше 20 USD, но порог среднего в гривне свой: 200.
  assert.equal(idOf(tierFor(donation({ amount: 250, currency: "UAH" }), list, BASE)), "medium");
  assert.equal(idOf(tierFor(donation({ amount: 50, currency: "UAH" }), list, BASE)), "small");
});

test("для валюты без порога идёт пересчёт источника, иначе default", () => {
  const list = tiers();
  // DonationAlerts пересчитал донат сам — сверяемся с пересчитанной суммой.
  assert.equal(
    idOf(tierFor(donation({ amount: 500, currency: "JPY", baseAmount: 6 }), list, BASE)),
    "medium"
  );
  // Пересчёта нет — остаётся порог default, и 500 перекрывает даже крупный.
  assert.equal(idOf(tierFor(donation({ amount: 500, currency: "JPY" }), list, BASE)), "big");
});

test("выключенный для площадки тир не забирает донат себе", () => {
  const list = tiers();
  list.find((tier) => tier.id === "big").sources.donatello = false;

  assert.equal(idOf(tierFor(donation({ amount: 50 }), list, BASE)), "big");
  // Крупный для Donatello выключен, поэтому донат уходит в средний, а не пропадает.
  assert.equal(idOf(tierFor(donation({ amount: 50, source: "donatello" }), list, BASE)), "medium");
});

test("если для площадки выключены все подходящие тиры, алерта нет", () => {
  const list = tiers();
  for (const tier of list) {
    if (tier.id !== "big") tier.sources.donatello = false;
  }

  assert.equal(idOf(tierFor(donation({ amount: 3, source: "donatello" }), list, BASE)), null);
  assert.equal(idOf(tierFor(donation({ amount: 3 }), list, BASE)), "small");
});

test("тиры по умолчанию включены для обеих площадок", () => {
  for (const tier of tiers()) {
    assert.equal(tier.sources.donationAlerts, true, tier.id);
    assert.equal(tier.sources.donatello, true, tier.id);
  }
});
