// Скримеры: страница оверлея тянет картинки и звуки по путям, зашитым прямо в ней,
// и подбирает вариацию по имени тира. Ошибка здесь не видна ни на сборке, ни в
// консоли сервера — она вылезает пустым экраном посреди эфира, поэтому проверяем
// статикой: все ли файлы на месте, на каждый ли тир есть чем ответить и не лезет ли
// в случайный подбор проверочное сердечко.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULTS } from "../src/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overlay = readFileSync(path.join(root, "public", "overlay", "screamer.js"), "utf8");

const BLOCK_END = "\n    },";

/** Пути к медиа, как они записаны в оверлее: '/screamers/img/scream.jpg'. */
function mediaPaths() {
  return [...overlay.matchAll(/'(\/screamers\/[^']+)'/g)].map((match) => match[1]);
}

/**
 * Имя вариации → её исходник. Границу блока ищем по закрывающей скобке с тем же
 * отступом: окно фиксированной длины залезало бы в соседнюю вариацию, и признаки
 * одной приписывались бы другой.
 */
function variantSources() {
  const found = new Map();
  for (const match of overlay.matchAll(/^ {4}(\w+):\s*\{$/gm)) {
    const rest = overlay.slice(match.index);
    const end = rest.indexOf(BLOCK_END);
    if (end === -1) continue;
    found.set(match[1], rest.slice(0, end));
  }
  return found;
}

/** Имя вариации → { tiers, check }. */
function variants() {
  const found = new Map();
  for (const [name, source] of variantSources()) {
    const tiers = /tiers:\s*\[([^\]]*)\]/.exec(source);
    if (!tiers) continue;
    found.set(name, {
      tiers: [...tiers[1].matchAll(/'([^']+)'/g)].map((tier) => tier[1]),
      check: /check:\s*true/.test(source),
    });
  }
  return found;
}

/** Только настоящие вариации: проверочные в случайный подбор не идут. */
function realVariants() {
  return new Map(
    [...variants()]
      .filter(([, variant]) => !variant.check)
      .map(([name, variant]) => [name, variant.tiers])
  );
}

test("все картинки и звуки, на которые ссылается оверлей, лежат на месте", () => {
  const paths = mediaPaths();
  // Если регулярка перестанет находить пути, тест обязан упасть, а не молча пройти.
  assert.ok(paths.length >= 20, `нашлось всего ${paths.length} путей — разметка изменилась?`);

  const missing = paths.filter((rel) => !existsSync(path.join(root, "public", rel)));
  assert.deepEqual(missing, [], `нет файлов: ${missing.join(", ")}`);
});

test("вариаций найдено столько же, сколько их описано", () => {
  assert.ok(variants().size >= 8, `нашлось ${variants().size} вариаций`);
  for (const [name, tiers] of realVariants()) {
    assert.ok(tiers.length > 0, `у вариации ${name} пустой список тиров`);
  }
});

test("на каждый тир, вызывающий скример, есть хотя бы одна вариация", () => {
  const real = realVariants();
  const screaming = DEFAULTS.alerts.tiers.filter((tier) => tier.screamer);
  assert.ok(screaming.length > 0, "ни один тир по умолчанию не вызывает скример");

  for (const tier of screaming) {
    const suitable = [...real].filter(([, tiers]) => tiers.includes(tier.id));
    assert.ok(suitable.length > 0, `для тира ${tier.id} нет ни одной вариации`);
  }
});

test("имена тиров в оверлее не разошлись с конфигом", () => {
  const known = new Set(DEFAULTS.alerts.tiers.map((tier) => tier.id));
  const used = new Set([...realVariants().values()].flat());

  const unknown = [...used].filter((tier) => !known.has(tier));
  assert.deepEqual(unknown, [], `оверлей ждёт тиры, которых нет в конфиге: ${unknown.join(", ")}`);
});

test("проверочная вариация есть, и это сердечко", () => {
  const check = [...variants()].filter(([, variant]) => variant.check).map(([name]) => name);
  assert.deepEqual(check, ["heart"]);
});

test("сердечко не выпадает на настоящий донат", () => {
  const heart = variants().get("heart");
  // Пустой список тиров плюс check: true — так она остаётся только для ручного
  // выбора. Если тиры ей однажды пропишут, она полезет в случайный подбор.
  assert.deepEqual(heart.tiers, []);
  assert.equal(heart.check, true);

  // И запасной набор, который берётся когда под тир ничего не нашлось, тоже
  // обязан её отбрасывать.
  assert.match(
    overlay,
    /const real = Object\.keys\(VARIANTS\)\.filter\(name => !VARIANTS\[name\]\.check\);/,
    "случайный подбор не отсеивает проверочные вариации"
  );
});

test("сердечко не тянет ни картинок, ни звуков из набора скримеров", () => {
  // Смысл проверки в том, чтобы не пугать: любой файл из /screamers здесь лишний.
  const source = variantSources().get("heart");
  assert.ok(source, "не нашёл вариацию heart");
  assert.ok(!source.includes("/screamers/"), "в сердечке ссылка на медиа скримеров");
  assert.ok(!/\bplay\(/.test(source), "сердечко зовёт play() из набора звуков скримеров");
});
