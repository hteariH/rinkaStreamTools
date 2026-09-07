// Панель как единое целое: настоящий panel.js запускается на заглушке DOM.
//
// Проверка появилась не от хорошей жизни: привязка переключателя языка однажды
// молча не встала в файл, и на глаз этого не видно — панель работает, просто одна
// кнопка ничего не делает. Тесты на модули такое не ловят, потому что ломается не
// модуль, а проводка между разметкой, панелью и сервером.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { DEFAULTS } from "../src/config.js";

/** Узел с тем минимумом, которым пользуется панель. */
function makeElement(id = "", tag = "div") {
  const listeners = {};
  return {
    id,
    tagName: tag.toUpperCase(),
    value: "",
    checked: false,
    textContent: "",
    innerText: "",
    innerHTML: "",
    hidden: false,
    dataset: {},
    style: {},
    options: [],
    files: [],
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(name, fn) { (listeners[name] ??= []).push(fn); },
    fire(name, event = {}) { for (const fn of listeners[name] ?? []) fn({ target: this, ...event }); },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentHTML() {},
    removeChild() {},
    getAttribute: () => null,
    setAttribute() {},
    scrollHeight: 0,
    scrollTop: 0,
    clientHeight: 0,
  };
}

/** Панель в песочнице: возвращает всё, что нужно для проверок. */
function loadPanel() {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id, id === "lang" ? "select" : "div"));
    return elements.get(id);
  };

  const textNodes = [
    { nodeValue: "Топ донатеров", parentNode: { nodeName: "DIV" }, parentElement: { closest: () => null } },
    { nodeValue: "Опрос в чате", parentNode: { nodeName: "DIV" }, parentElement: { closest: () => null } },
  ];

  const sent = [];
  const sandbox = {
    console,
    JSON, Number, String, Boolean, Object, Array, Math, Date, WeakMap, Map, Set, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    location: { protocol: "http:", host: "localhost:3777" },
    navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: class {
      constructor() { this.readyState = 1; }
      send(data) { sent.push(JSON.parse(data)); }
      close() {}
    },
    document: {
      documentElement: {},
      body: makeElement(),
      getElementById: el,
      querySelector: () => makeElement(),
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: (tag) => makeElement("", tag),
      createTreeWalker: () => {
        let i = 0;
        return { nextNode: () => (i < textNodes.length ? textNodes[i++] : null) };
      },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(readFileSync("public/i18n.js", "utf8"), sandbox, { filename: "i18n.js" });
  vm.runInContext(readFileSync("public/panel.js", "utf8"), sandbox, { filename: "panel.js" });

  return { sandbox, el, sent, textNodes };
}

/** Состояние, какое присылает сервер. */
function state(patch = {}) {
  return {
    type: "state",
    config: { ...structuredClone(DEFAULTS), ...patch },
    status: {},
    raffle: { count: 0, remaining: 0, participants: [], command: "!хил" },
    goal: { current: 0, target: 0, currency: "USD", percentage: 0, sources: {}, manualOffset: 0 },
    top: { donors: [], all: [], anonymous: { count: 0, total: 0 }, totalDonors: 0, currency: "USD", limit: 5 },
    recent: { donations: [] },
    poll: { visible: false, open: false, options: [], total: 0, seconds: 0 },
    counter: { visible: true, title: "Смертей", value: 0 },
    media: { images: [], sounds: [] },
    tts: { engine: "windows", voices: [], quota: null, hasKey: false },
    nowplaying: { track: null, apps: [] },
    dataDir: "C:/данные",
    log: [],
  };
}

test("выбор языка в списке уходит на сервер", () => {
  const { el, sent } = loadPanel();

  el("lang").value = "en";
  el("lang").fire("change");

  const save = sent.find((message) => message.type === "config.save");
  assert.ok(save, "панель ничего не отправила — переключатель ни к чему не привязан");
  assert.deepEqual(save.patch, { language: "en" });
});

test("язык из ответа сервера переключает надписи в разметке", () => {
  const { sandbox, el, textNodes } = loadPanel();

  sandbox.render(state({ language: "en" }));
  assert.equal(sandbox.window.i18n.lang, "en");
  assert.deepEqual(textNodes.map((node) => node.nodeValue), ["Top donors", "Chat poll"]);
  assert.equal(el("lang").value, "en", "в списке не отметился выбранный язык");

  // И обратно: панель следует за сервером, а не помнит свой выбор.
  sandbox.render(state({ language: "ru" }));
  assert.deepEqual(textNodes.map((node) => node.nodeValue), ["Топ донатеров", "Опрос в чате"]);
});

test("состояние от сервера отрисовывается целиком, без падений", () => {
  const { sandbox, el } = loadPanel();

  // Панель перерисовывает всё на каждом сообщении — если какая-то из веток
  // состояния разъедется с сервером, это упадёт здесь, а не в эфире.
  sandbox.render(state());
  assert.equal(el("data-dir").textContent, "C:/данные");
});
