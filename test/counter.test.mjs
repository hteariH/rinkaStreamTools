// Счётчик и разбор горячих клавиш.
//
// Проверять тут по сути нечего, кроме двух вещей, которые видно только в эфире:
// счётчик не должен уходить в минус, когда минус не разрешён, а имя клавиши из
// панели должно превращаться ровно в тот код, который потом ищет опрос
// клавиатуры. Разъедется второе — хоткей просто молча не сработает.

import test from "node:test";
import assert from "node:assert/strict";

import { Counter } from "../src/counter/counter.js";
import { keyCode, parseHotkey } from "../src/counter/keys.js";

const settings = (patch = {}) => ({
  enabled: true,
  title: "Смертей",
  value: 0,
  step: 1,
  allowNegative: false,
  theme: "default",
  ...patch,
});

test("счётчик считает шагом из настроек", () => {
  const counter = new Counter(settings({ step: 5 }));

  assert.equal(counter.step, 5);
  assert.equal(counter.add(counter.step), true);
  assert.equal(counter.value, 5);
  assert.equal(counter.add(-counter.step), true);
  assert.equal(counter.value, 0);
});

test("ниже нуля не опускается, пока минус не разрешён", () => {
  const counter = new Counter(settings({ value: 1 }));

  counter.add(-3);
  assert.equal(counter.value, 0);
  // Второе нажатие ничего не меняет — и рассылать это некуда.
  assert.equal(counter.add(-1), false);

  counter.configure(settings({ allowNegative: true }));
  assert.equal(counter.add(-1), true);
  assert.equal(counter.value, -1);
});

test("запрет минуса подтягивает уже показанное число к нулю", () => {
  const counter = new Counter(settings({ allowNegative: true, value: -4 }));

  counter.configure(settings({ allowNegative: false }));
  assert.equal(counter.value, 0);
});

test("настройки меняются, значение — нет", () => {
  const counter = new Counter(settings({ value: 7 }));

  // Панель сохранила подпись, пока шёл эфир: счёт от этого сбиваться не должен.
  counter.configure(settings({ title: "Побед", value: 0 }));
  assert.equal(counter.value, 7);
  assert.equal(counter.snapshot("neon").title, "Побед");
});

test("шаг ноль — это единица: счётчик без шага бесполезен", () => {
  assert.equal(new Counter(settings({ step: 0 })).step, 1);
  assert.equal(new Counter(settings({ step: "чушь" })).step, 1);
  // Отрицательный шаг — это тот же шаг: знак задаёт кнопка, а не настройка.
  assert.equal(new Counter(settings({ step: -3 })).step, 3);
});

test("выключенный счётчик уезжает с оверлея, но остаётся источником", () => {
  const counter = new Counter(settings({ enabled: false, value: 3 }));
  const snapshot = counter.snapshot("default");

  assert.equal(snapshot.visible, false);
  assert.equal(snapshot.value, 3);
});

test("имя клавиши из браузера превращается в код Windows", () => {
  assert.equal(keyCode("F8"), 0x77);
  assert.equal(keyCode("KeyD"), 0x44);
  assert.equal(keyCode("Digit1"), 0x31);
  assert.equal(keyCode("Numpad3"), 0x63);
  assert.equal(keyCode("NumpadAdd"), 0x6b);
  assert.equal(keyCode("ArrowUp"), 0x26);
});

test("клавиши, которых нет, не превращаются в чужой код", () => {
  // F25 не существует, а «Ctrl» сам по себе — приставка, а не клавиша.
  assert.equal(keyCode("F25"), null);
  assert.equal(keyCode("ControlLeft"), null);
  assert.equal(keyCode(""), null);
});

test("модификаторы разбираются в любом порядке и регистре", () => {
  assert.deepEqual(parseHotkey("Ctrl+Shift+F8"), { code: 0x77, ctrl: true, alt: false, shift: true });
  assert.deepEqual(parseHotkey("shift+ctrl+F8"), { code: 0x77, ctrl: true, alt: false, shift: true });
  assert.deepEqual(parseHotkey("Alt+KeyD"), { code: 0x44, ctrl: false, alt: true, shift: false });
});

test("непонятная строка — это не хоткей, а не «клавиша по умолчанию»", () => {
  assert.equal(parseHotkey(""), null);
  assert.equal(parseHotkey("Ctrl"), null);
  assert.equal(parseHotkey("Super+KeyD"), null);
  assert.equal(parseHotkey("просто текст"), null);
});
