// Скримеры: страница оверлея тянет картинки и звуки по путям, зашитым прямо в ней,
// и подбирает вариацию по имени тира. Ошибка здесь не видна ни на сборке, ни в
// консоли сервера — она вылезает пустым экраном посреди эфира, поэтому проверяем
// статикой: все ли файлы на месте и на каждый ли тир есть чем ответить.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULTS } from "../src/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overlay = readFileSync(path.join(root, "public", "overlay", "screamer.js"), "utf8");

/** Пути к медиа, как они записаны в оверлее: '/screamers/img/scream.jpg'. */
function mediaPaths() {
  return [...overlay.matchAll(/'(\/screamers\/[^']+)'/g)].map((match) => match[1]);
}

/** Имя вариации → список тиров, которым она подходит. */
function variantTiers() {
  const found = new Map();
  const re = /^\s{4}(\w+):\s*\{$/gm;
  for (const match of overlay.matchAll(re)) {
    const rest = overlay.slice(match.index);
    const tiers = /tiers:\s*\[([^\]]*)\]/.exec(rest);
    if (!tiers) continue;
    found.set(
      match[1],
      [...tiers[1].matchAll(/'([^']+)'/g)].map((tier) => tier[1])
    );
  }
  return found;
}

test("все картинки и звуки, на которые ссылается оверлей, лежат на месте", () => {
  const paths = mediaPaths();
  // Если регулярка перестанет находить пути, тест обязан упасть, а не молча пройти.
  assert.ok(paths.length >= 20, `нашлось всего ${paths.length} путей — разметка изменилась?`);

  const missing = paths.filter((rel) => !existsSync(path.join(root, "public", rel)));
  assert.deepEqual(missing, [], `нет файлов: ${missing.join(", ")}`);
});

test("вариаций найдено столько же, сколько их описано", () => {
  const variants = variantTiers();
  assert.ok(variants.size >= 7, `нашлось ${variants.size} вариаций`);
  for (const [name, tiers] of variants) {
    assert.ok(tiers.length > 0, `у вариации ${name} пустой список тиров`);
  }
});

test("на каждый тир, вызывающий скример, есть хотя бы одна вариация", () => {
  const variants = variantTiers();
  const screaming = DEFAULTS.alerts.tiers.filter((tier) => tier.screamer);
  assert.ok(screaming.length > 0, "ни один тир по умолчанию не вызывает скример");

  for (const tier of screaming) {
    const suitable = [...variants].filter(([, tiers]) => tiers.includes(tier.id));
    assert.ok(suitable.length > 0, `для тира ${tier.id} нет ни одной вариации`);
  }
});

test("имена тиров в оверлее не разошлись с конфигом", () => {
  const known = new Set(DEFAULTS.alerts.tiers.map((tier) => tier.id));
  const used = new Set([...variantTiers().values()].flat());

  const unknown = [...used].filter((tier) => !known.has(tier));
  assert.deepEqual(unknown, [], `оверлей ждёт тиры, которых нет в конфиге: ${unknown.join(", ")}`);
});
