// Нагрузка на панель: сколько полных состояний уходит на поток событий.
//
// Состояние тяжёлое — настройки, таблица донатеров, лента, медиатека и двести
// строк лога, — а поводов его разослать много: каждый участник розыгрыша, каждый
// голос в опросе, каждый опрос медиасессии. За часы эфира из этого вырастает
// нагрузка, которую видно на экране: панель перерисовывается целиком, а оверлеи
// в OBS делят с ней процессор, и первой начинает дёргаться бегущая строка —
// единственная, что движется непрерывно.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { App } from "../src/app.js";
import { DEFAULTS } from "../src/config.js";

/** App без start(): порт не занимаем, в сеть не ходим, рассылки считаем сами. */
function makeApp() {
  const app = new App(structuredClone(DEFAULTS));

  const dir = mkdtempSync(path.join(tmpdir(), "rst-push-"));
  app.donors.filePath = path.join(dir, "donors.json");
  app.recent.filePath = path.join(dir, "recent.json");

  const sent = [];
  app.hub.broadcast = (channel) => sent.push(channel);
  const states = () => sent.filter((channel) => channel === "/ws/control").length;

  return { app, states, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("наплыв в чате не превращается в сотню полных состояний", async () => {
  const { app, states, cleanup } = makeApp();

  // Двести зрителей заходят подряд — так бывает сразу после перезапуска
  // розыгрыша, когда все пишут команду заново.
  for (let i = 0; i < 200; i += 1) {
    app.raffle.tryAdd({ name: `viewer${i}`, serviceId: "twitch", text: app.raffle.command });
    app.pushControl();
  }

  assert.equal(states(), 1, `на пачку сразу ушло ${states()} состояний вместо одного`);

  // Хвост схлопнутых рассылок приходит одной штукой.
  await wait(400);
  assert.ok(states() <= 2, `после пачки ушло ${states()} состояний`);
  cleanup();
});

test("одиночное действие в панели отзывается сразу", async () => {
  const { app, states, cleanup } = makeApp();

  app.pushControl();
  assert.equal(states(), 1, "первая рассылка задержалась");

  // Через паузу следующее действие тоже уходит без ожидания.
  await wait(300);
  app.pushControl();
  assert.equal(states(), 2);
  cleanup();
});

test("опрос медиасессии не поднимает рассылку на каждом тике", async () => {
  const { app, states, cleanup } = makeApp();

  // Список приложений приходит дважды в секунду и обычно не меняется.
  for (let i = 0; i < 20; i += 1) app.nowPlaying.emit("apps", ["Spotify.exe"]);

  await wait(400);
  assert.ok(states() <= 2, `на двадцать одинаковых списков ушло ${states()} состояний`);
  cleanup();
});
