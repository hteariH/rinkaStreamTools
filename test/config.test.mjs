// Тема была одна на цель, топ и ленту, а стала у каждого своя. Проверяется тут
// не столько мерж умолчаний, сколько перенос: у человека уже собрана сцена OBS,
// и обновление программы не должно молча вернуть два оверлея к default.

import test from "node:test";
import assert from "node:assert/strict";

import { applyDefaults, DEFAULTS } from "../src/config.js";

test("старая тема цели переезжает на топ и на ленту", () => {
  const config = applyDefaults({ goal: { theme: "neon" } });

  assert.equal(config.goal.theme, "neon");
  assert.equal(config.top.theme, "neon", "топ вернулся к default и сцена поехала");
  assert.equal(config.recent.theme, "neon");
});

test("своя тема оверлея сильнее унаследованной", () => {
  const config = applyDefaults({
    goal: { theme: "neon" },
    top: { theme: "hud" },
    recent: { theme: "slim" },
  });

  assert.equal(config.top.theme, "hud");
  assert.equal(config.recent.theme, "slim");
});

test("явно выбранный default не считается «не задано»", () => {
  const config = applyDefaults({ goal: { theme: "neon" }, top: { theme: "default" } });
  assert.equal(config.top.theme, "default", "выбор человека перебит унаследованной темой");
});

test("без темы цели всё остаётся на умолчаниях", () => {
  const config = applyDefaults({ port: 4000 });

  assert.equal(config.port, 4000);
  assert.equal(config.top.theme, DEFAULTS.top.theme);
  assert.equal(config.recent.theme, DEFAULTS.recent.theme);
});

test("пустой файл не роняет разбор", () => {
  assert.equal(applyDefaults({}).top.theme, "default");
});
