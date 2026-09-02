// Перевод: подстановки, откат на русский и полнота словарей.
//
// Главная проверка тут — последняя: она сверяет словарь панели с тем, что и
// правда написано в разметке. Пропущенная строка иначе всплыла бы в эфире, на
// английской панели с русским словом посередине.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { t, setLang, currentLang } from "../src/i18n.js";

test("без перевода строка остаётся русской", () => {
  setLang("ru");
  assert.equal(t("Настройки сохранены"), "Настройки сохранены");
  assert.equal(currentLang(), "ru");
});

test("на английском строка берётся из словаря", () => {
  setLang("en");
  assert.equal(t("Настройки сохранены"), "Settings saved");
  setLang("ru");
});

test("подстановки работают на обоих языках", () => {
  const params = { amount: 50, currency: "USD", name: "Аня" };

  setLang("ru");
  assert.equal(t("донат {amount} {currency} от {name}", params), "донат 50 USD от Аня");
  setLang("en");
  assert.equal(t("донат {amount} {currency} от {name}", params), "donation of 50 USD from Аня");
  setLang("ru");
});

test("неизвестный ключ не теряется — остаётся как есть", () => {
  setLang("en");
  // Пропущенный перевод должен быть видно, а не превращаться в пустоту.
  assert.equal(t("такой строки в словаре нет"), "такой строки в словаре нет");
  setLang("ru");
});

test("неизвестный язык — это русский", () => {
  setLang("de");
  assert.equal(currentLang(), "ru");
  assert.equal(t("Настройки сохранены"), "Настройки сохранены");
});

/** Ключи словаря: строки в кавычках перед двоеточием, по одной на строку файла. */
function dictKeys(file) {
  const keys = new Set();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*"(.+)":\s*$|^\s*"(.+)":\s+"/.exec(line);
    if (match) keys.add(match[1] ?? match[2]);
  }
  return keys;
}

test("в словаре панели есть всё, что написано в разметке", () => {
  const keys = dictKeys("public/i18n.js");
  // Выкидываем то, что помечено translate="no": названия языков не переводятся.
  const html = readFileSync("public/index.html", "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<select[^>]*translate="no"[\s\S]*?<\/select>/g, "");

  const missing = [];
  const cyrillic = /[А-Яа-яЁё]/;
  for (const match of html.matchAll(/>([^<>]+)</g)) {
    const text = match[1].replace(/\s+/g, " ").trim();
    if (cyrillic.test(text) && !keys.has(text)) missing.push(text);
  }
  for (const match of html.matchAll(/(?:placeholder|title)="([^"]+)"/g)) {
    if (cyrillic.test(match[1]) && !keys.has(match[1])) missing.push(match[1]);
  }

  assert.deepEqual(missing, [], `без перевода осталось ${missing.length} строк панели`);
});

test("оба словаря переводят на английский, а не оставляют русское", () => {
  // Значение, совпадающее с ключом, — обычно забытая строка: скопировали ключ и
  // не перевели. Исключения бывают (одинаковые в обоих языках), но их немного.
  for (const file of ["src/i18n.js", "public/i18n.js"]) {
    const source = readFileSync(file, "utf8");
    const same = [];
    for (const match of source.matchAll(/^\s*"(.+)": "(.+)",$/gm)) {
      if (match[1] === match[2] && /[А-Яа-яЁё]/.test(match[1])) same.push(match[1]);
    }
    assert.deepEqual(same, [], `${file}: строки не переведены`);
  }
});
