// Проверка обновлений. Главное тут не само сравнение версий, а то, что программа
// ведёт себя тихо: нет сети или GitHub не в духе — это не повод что-то показывать
// стримеру перед эфиром.

import test from "node:test";
import assert from "node:assert/strict";

import { UpdateChecker, isNewer, RELEASES_URL } from "../src/update.js";
import { DEFAULTS, applyDefaults } from "../src/config.js";
import { VERSION } from "../src/version.js";

const answer = (tag) => async () => ({ ok: true, status: 200, json: async () => ({ tag_name: tag }) });

/** Проверка с подставленным ответом GitHub; считает запросы, события и строки лога. */
function checker({ fetch = answer("v1.9.0"), current = "1.9.0", check = true } = {}) {
  const seen = { requests: 0, changes: 0, logs: [] };
  const updates = new UpdateChecker({
    current,
    check,
    fetch: (...args) => {
      seen.requests += 1;
      return fetch(...args);
    },
  });
  updates.on("change", () => { seen.changes += 1; });
  updates.on("log", (text) => seen.logs.push(text));
  return { updates, seen };
}

test("версии сравниваются как числа, а не как строки", () => {
  assert.equal(isNewer("1.10.0", "1.9.0"), true, "как строка 1.10.0 меньше 1.9.0");
  assert.equal(isNewer("2.0.0", "1.99.99"), true);
  assert.equal(isNewer("1.9.1", "1.9.0"), true);
  assert.equal(isNewer("1.9.0", "1.9.0"), false);
  assert.equal(isNewer("1.8.9", "1.9.0"), false);
});

test("вышла новая версия — она в снимке, а в логе ровно одна строка", async () => {
  const { updates, seen } = checker({ fetch: answer("v1.10.0") });

  await updates.check();
  await updates.check();

  assert.deepEqual(updates.snapshot(), { current: "1.9.0", latest: "1.10.0" });
  assert.equal(seen.changes, 1, "панель незачем дёргать, если ничего не изменилось");
  assert.equal(seen.logs.length, 1, "раз в шесть часов одна и та же строка забьёт лог");
});

test("такая же или более старая версия — молчим", async () => {
  for (const tag of ["v1.9.0", "v1.8.2"]) {
    const { updates, seen } = checker({ fetch: answer(tag) });
    await updates.check();
    assert.equal(updates.snapshot().latest, null, tag);
    assert.equal(seen.changes, 0, tag);
    assert.deepEqual(seen.logs, [], tag);
  }
});

test("версия вышла ещё раз — новая заметка и новая строка", async () => {
  let tag = "v1.10.0";
  const { updates, seen } = checker({ fetch: async () => answer(tag)() });

  await updates.check();
  tag = "v1.11.0";
  await updates.check();

  assert.equal(updates.snapshot().latest, "1.11.0");
  assert.equal(seen.changes, 2);
  assert.equal(seen.logs.length, 2);
});

test("нет сети — ничего не показываем, в логе одна строка на обрыв", async () => {
  let online = false;
  const { updates, seen } = checker({
    fetch: async () => {
      if (!online) throw new Error("fetch failed");
      return answer("v1.9.0")();
    },
  });

  await updates.check();
  await updates.check();
  assert.equal(updates.snapshot().latest, null);
  assert.equal(seen.changes, 0);
  assert.equal(seen.logs.length, 1, "повторять одну и ту же ошибку незачем");

  // Сеть вернулась и снова пропала — это уже новый обрыв.
  online = true;
  await updates.check();
  online = false;
  await updates.check();
  assert.equal(seen.logs.length, 2);
});

test("сбой не прячет уже найденную версию", async () => {
  let online = true;
  const { updates } = checker({
    fetch: async () => {
      if (!online) throw new Error("fetch failed");
      return answer("v1.10.0")();
    },
  });

  await updates.check();
  online = false;
  await updates.check();

  assert.equal(updates.snapshot().latest, "1.10.0");
});

test("непонятный ответ GitHub — такая же ошибка, а не новая версия", async () => {
  const replies = [
    async () => ({ ok: false, status: 403, json: async () => ({ message: "rate limit" }) }),
    async () => ({ ok: true, status: 200, json: async () => ({}) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("not json"); } }),
    answer("nightly"),
    answer("v2.0.0-rc1"),
  ];
  for (const fetch of replies) {
    const { updates, seen } = checker({ fetch });
    await updates.check();
    assert.equal(updates.snapshot().latest, null);
    assert.equal(seen.logs.length, 1);
  }
});

test("сборка без версии не проверяет ничего", async () => {
  const { updates, seen } = checker({ current: "dev", fetch: answer("v9.9.9") });

  await updates.check();
  updates.configure({ check: true });

  assert.equal(seen.requests, 0, "«dev» не с чем сравнивать");
  assert.deepEqual(updates.snapshot(), { current: "dev", latest: null });
});

test("первая проверка — вскоре после старта, дальше раз в шесть часов", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { updates, seen } = checker();

  updates.start();
  assert.equal(seen.requests, 0, "старт не должен ждать сети");

  t.mock.timers.tick(10_000);
  assert.equal(seen.requests, 1);

  t.mock.timers.tick(6 * 60 * 60 * 1000);
  assert.equal(seen.requests, 2);

  updates.stop();
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  assert.equal(seen.requests, 2, "после остановки запросов быть не должно");
});

test("настройка выключена — наружу не ходим вовсе", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { updates, seen } = checker({ check: false });

  updates.start();
  t.mock.timers.tick(7 * 60 * 60 * 1000);

  assert.equal(seen.requests, 0);
});

test("выключили настройку — заметка пропала, таймеры остановились", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { updates, seen } = checker({ fetch: answer("v1.10.0") });

  updates.start();
  await updates.check();
  const before = seen.requests;

  updates.configure({ check: false });
  assert.equal(updates.snapshot().latest, null);
  assert.equal(seen.changes, 2, "панель должна узнать, что заметки больше нет");

  t.mock.timers.tick(7 * 60 * 60 * 1000);
  assert.equal(seen.requests, before);
});

test("включили настройку — проверка снова идёт", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { updates, seen } = checker({ check: false });

  updates.start();
  updates.configure({ check: true });
  t.mock.timers.tick(10_000);

  assert.equal(seen.requests, 1);
});

test("сохранение других настроек проверку не перезапускает", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { updates, seen } = checker();

  updates.start();
  t.mock.timers.tick(10_000);
  // applyConfig зовёт configure на каждое сохранение любого поля панели.
  updates.configure({ check: true });
  t.mock.timers.tick(10_000);

  assert.equal(seen.requests, 1);
});

test("ответ, пришедший после выключения, заметку не возвращает", async () => {
  let release;
  const { updates, seen } = checker({
    fetch: () => new Promise((resolve) => { release = () => resolve(answer("v1.10.0")()); }),
  });

  const pending = updates.check();
  updates.configure({ check: false });
  release();
  await pending;

  assert.equal(updates.snapshot().latest, null);
  assert.deepEqual(seen.logs, []);
});

test("адрес страницы релизов — наш репозиторий и только он", () => {
  assert.equal(RELEASES_URL, "https://github.com/hteariH/rinkaStreamTools/releases/latest");
});

test("при запуске из исходников версия — dev", () => {
  assert.equal(VERSION, "dev");
});

test("проверка обновлений включена по умолчанию, выключенная не включается сама", () => {
  assert.equal(DEFAULTS.updates.check, true);
  assert.equal(applyDefaults({}).updates.check, true);
  assert.equal(applyDefaults({ updates: { check: false } }).updates.check, false);
});
