// Донаты с Donatello: какая у доната сумма и в какой валюте.
//
// В сокете Donatello два события. Донат приходит с полем amount, и валюты в нём
// нет вовсе — сумма всегда в гривнах, во что бы донатер ни платил. Следом
// приходит событие цели: donatedAmount уже в валюте виджета. Собственный виджет
// Donatello рисует «+10» именно по приросту цели.
//
// Раньше гривны из доната подписывались валютой виджета, и у цели в долларах
// донат на 10 USDT превратился на экране в «430 USD» — в скримере, в ленте и в
// топе. Цель при этом была верной: она читается отдельно.

import test from "node:test";
import assert from "node:assert/strict";

import { DonatelloSource } from "../src/donations/donatello.js";

const identity = { userId: "u1", widgetId: "w1" };

/** Источник, который уже знает свою цель — как после первого опроса /info. */
function source({ currency, amount }) {
  const donatello = new DonatelloSource({ enabled: true, widgetUrl: "https://donatello.to/widget/w1/token/t" });
  donatello.currency = currency;
  donatello.amount = amount;
  // В эфире ждём событие цели пару секунд; в тестах незачем.
  donatello.pairMs = 20;
  const donations = [];
  donatello.on("donation", (donation) => donations.push(donation));
  return { donatello, donations };
}

/** Кадры в том виде, в каком их шлёт сокет (без префикса socket.io). */
const donationEvent = (amount, extra = {}) => JSON.stringify(["u1", {
  userId: "u1",
  updateTopWidget: true,
  updateTimeWidget: true,
  amount: String(amount),
  isDecrement: false,
  isSubscription: false,
  lastDonatorName: "EXPRESScard",
  lastDonatorMessage: "На хорошее настроение!",
  ...extra,
}]);

const goalEvent = (donatedAmount, widgetCurrency) => JSON.stringify(["w1", {
  userId: "u1",
  widgetId: "w1",
  updateGoalWidget: true,
  goalWidgetData: { donatedAmount: String(donatedAmount), widgetCurrency },
}]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("цель в гривнах: донат уходит сразу и в гривнах", () => {
  const { donatello, donations } = source({ currency: "UAH", amount: 1000 });

  donatello._handleEvent(donationEvent(430), identity);

  assert.equal(donations.length, 1);
  assert.equal(donations[0].amount, 430);
  assert.equal(donations[0].currency, "UAH");
});

test("цель в долларах: сумма доната — прирост цели, а не гривны из сокета", () => {
  const { donatello, donations } = source({ currency: "USD", amount: 22 });

  donatello._handleEvent(donationEvent(430), identity);
  // Пока цель не сдвинулась, сумма в долларах неизвестна — рано что-то показывать.
  assert.equal(donations.length, 0);

  donatello._handleEvent(goalEvent(32, "USD"), identity);

  assert.equal(donations.length, 1);
  assert.equal(donations[0].amount, 10);
  assert.equal(donations[0].currency, "USD");
  assert.equal(donations[0].donorName, "EXPRESScard");
  assert.equal(donations[0].message, "На хорошее настроение!");
});

test("цель из сокета держит сумму свежей: второй донат считается от первого", () => {
  const { donatello, donations } = source({ currency: "USD", amount: 22 });

  donatello._handleEvent(donationEvent(430), identity);
  donatello._handleEvent(goalEvent(32, "USD"), identity);
  donatello._handleEvent(donationEvent(215), identity);
  donatello._handleEvent(goalEvent(37, "USD"), identity);

  assert.deepEqual(donations.map((donation) => donation.amount), [10, 5]);
  assert.equal(donatello.amount, 37);
});

test("цель не сдвинулась — донат уходит в гривнах, а не пропадает", async () => {
  const { donatello, donations } = source({ currency: "USD", amount: 22 });

  donatello._handleEvent(donationEvent(430), identity);
  await wait(60);

  assert.equal(donations.length, 1);
  assert.equal(donations[0].amount, 430);
  assert.equal(donations[0].currency, "UAH");
});

test("валюта цели ещё не известна — гривны не выдаются за доллары", async () => {
  const { donatello, donations } = source({ currency: null, amount: 0 });

  donatello._handleEvent(donationEvent(430), identity);
  await wait(60);

  assert.equal(donations.length, 1);
  assert.equal(donations[0].currency, "UAH");
});

test("чужая цель не сдвигает нашу", () => {
  const { donatello, donations } = source({ currency: "USD", amount: 22 });

  donatello._handleEvent(donationEvent(430), identity);
  donatello._handleEvent(JSON.stringify(["w2", {
    userId: "u2", widgetId: "w2", goalWidgetData: { donatedAmount: "2150985", widgetCurrency: "USD" },
  }]), identity);

  assert.equal(donations.length, 0);
  assert.equal(donatello.amount, 22);
});
