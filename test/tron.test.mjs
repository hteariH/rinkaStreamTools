// Донаты в USDT (TRC-20): опрос переводов на адрес стримера.
//
// У блокчейна нет ни виджета, ни сокета, ни чужого счётчика суммы: сумма, повторы
// и «что уже учтено» — всё наше. Поэтому главное, что здесь проверяется, — деньги
// не считаются дважды и не теряются: ни на повторном опросе, ни на перезапуске,
// ни при обрыве связи посередине страниц.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { TronSource, isTronAddress } from "../src/donations/tron.js";
import { Goal } from "../src/donations/goal.js";
import { migrateData } from "../src/data.js";

const ADDRESS = "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb";
const OTHER_ADDRESS = "TJTKCzQpsG19CSMYF9TPtxz6wSHPSyeKfa";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

/** Перевод в том виде, в каком его отдаёт TronGrid. */
function transfer({ id = "tx1", value = "15500000", at = T0 + 1000, from = OTHER_ADDRESS, to = ADDRESS, token = USDT, type = "Transfer" } = {}) {
  return {
    transaction_id: id,
    token_info: { symbol: "USDT", address: token, decimals: 6, name: "Tether USD" },
    block_timestamp: at,
    from,
    to,
    type,
    value,
  };
}

const page = (data, next) => ({
  status: 200,
  body: { data, success: true, meta: { at: T0, page_size: data.length, ...(next ? { links: { next } } : {}) } },
});

/** Сеть по сценарию: каждый запрос забирает следующий ответ, запросы запоминаются. */
function network(...replies) {
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers ?? {} });
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (reply instanceof Error) throw reply;
    if (typeof reply === "function") return reply();
    return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
  };
  return { fetchStub, calls, push: (...more) => replies.push(...more), set: (reply) => { replies.length = 0; replies.push(reply); } };
}

async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "tron-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "tron.json");
}

/** Источник с адресом, добавленным в момент T0. Часы двигает сам тест. */
async function make(statePath, reply, { config = {}, at = T0 } = {}) {
  const net = network(reply);
  const clock = { now: at };
  const source = new TronSource(
    { enabled: true, address: ADDRESS, rate: 1, minAmount: 0.1, apiKey: "", ...config },
    { statePath, fetch: net.fetchStub, now: () => clock.now }
  );
  const donations = [];
  source.on("donation", (donation) => donations.push(donation));
  await source.load();
  return { source, net, clock, donations };
}

test("перевод становится донатом: сумма из шести знаков, USDT, короткий адрес вместо имени", async (t) => {
  const { source, donations } = await make(await setup(t), page([transfer()]));

  await source.check();

  assert.equal(donations.length, 1);
  const [donation] = donations;
  assert.equal(donation.source, "tron");
  assert.equal(donation.amount, 15.5);
  assert.equal(donation.currency, "USDT");
  assert.equal(donation.donorName, "TJTK…eKfa");
  assert.equal(donation.message, null);
  assert.equal(donation.at, T0 + 1000);
  assert.equal(source.amount, 15.5);
  assert.equal(source.currency, "USDT");
  assert.equal(source.status, "on");
});

test("один и тот же перевод на следующем опросе не считается второй раз", async (t) => {
  const { source, donations } = await make(await setup(t), page([transfer()]));

  await source.check();
  await source.check();

  assert.equal(donations.length, 1);
  assert.equal(source.amount, 15.5);
});

test("суммы складываются без хвостов плавающей точки", async (t) => {
  const { source } = await make(await setup(t), page([
    transfer({ id: "a", value: "100000" }),
    transfer({ id: "b", value: "200000" }),
  ]));

  await source.check();

  assert.equal(source.amount, 0.3);
});

test("после перезапуска сумма на месте, а старый перевод не становится донатом снова", async (t) => {
  const statePath = await setup(t);
  const first = await make(statePath, page([transfer()]));
  await first.source.check();

  const second = await make(statePath, page([transfer(), transfer({ id: "tx2", value: "1000000", at: T0 + 2000 })]), { at: T0 + 5000 });
  assert.equal(second.source.amount, 15.5);
  await second.source.check();

  assert.deepEqual(second.donations.map((donation) => donation.amount), [1]);
  assert.equal(second.source.amount, 16.5);
});

test("опрос просит только входящие подтверждённые USDT начиная с момента добавления адреса", async (t) => {
  const { source, net } = await make(await setup(t), page([]));

  await source.check();

  const url = new URL(net.calls[0].url);
  assert.equal(url.hostname, "api.trongrid.io");
  assert.ok(url.pathname.includes(ADDRESS));
  assert.equal(url.searchParams.get("only_to"), "true");
  assert.equal(url.searchParams.get("only_confirmed"), "true");
  assert.equal(url.searchParams.get("contract_address"), USDT);
  assert.equal(url.searchParams.get("order_by"), "block_timestamp,asc");
  assert.equal(url.searchParams.get("min_timestamp"), String(T0));
});

test("перевод раньше момента добавления адреса не считается", async (t) => {
  const { source, donations } = await make(await setup(t), page([transfer({ at: T0 - 1 })]));

  await source.check();

  assert.equal(donations.length, 0);
  assert.equal(source.amount, 0);
});

test("перевод меньше минимальной суммы не считается, ровно минимальная — считается", async (t) => {
  const { source, donations } = await make(await setup(t), page([
    transfer({ id: "dust", value: "99999" }),
    transfer({ id: "edge", value: "100000" }),
  ]));

  await source.check();

  assert.deepEqual(donations.map((donation) => donation.amount), [0.1]);
  assert.equal(source.amount, 0.1);
});

test("минимальная сумма 0 пропускает всё, кроме нулевых переводов", async (t) => {
  const { source, donations } = await make(await setup(t), page([
    transfer({ id: "zero", value: "0" }),
    transfer({ id: "one", value: "1" }),
  ]), { config: { minAmount: 0 } });

  await source.check();

  assert.deepEqual(donations.map((donation) => donation.amount), [0.000001]);
});

test("поддельный токен, чужой получатель и не-Transfer не считаются, даже если сервер их отдал", async (t) => {
  const { source, donations } = await make(await setup(t), page([
    transfer({ id: "fake", token: OTHER_ADDRESS }),
    transfer({ id: "outgoing", to: OTHER_ADDRESS }),
    transfer({ id: "approval", type: "Approval" }),
  ]));

  await source.check();

  assert.equal(donations.length, 0);
  assert.equal(source.amount, 0);
});

test("свежий перевод идёт с алертом, пришедший пока программа была закрыта — без", async (t) => {
  const { source, clock, donations } = await make(await setup(t), page([
    transfer({ id: "old", at: T0 + 1000 }),
    transfer({ id: "edge", at: T0 + 2000 }),
    transfer({ id: "fresh", at: T0 + 3000 }),
  ]));
  // Возраст переводов: 5 мин 1 с, ровно 5 минут и 4 мин 59 с.
  clock.now = T0 + 3000 + 5 * MINUTE - 1000;

  await source.check();

  assert.deepEqual(donations.map((donation) => Boolean(donation.quiet)), [true, false, false]);
  assert.equal(source.amount, 46.5, "в сумму идут все три");
});

test("новый опрос подхватывает перевод, появившийся в сети задним числом", async (t) => {
  const { source, net, clock, donations } = await make(await setup(t), page([transfer({ id: "late-block", at: T0 + 5 * MINUTE })]));
  clock.now = T0 + 6 * MINUTE;
  await source.check();

  // Узел отдал более ранний блок позже: перевод старше последнего учтённого.
  net.set(page([transfer({ id: "earlier", at: T0 + 4 * MINUTE, value: "2000000" }), transfer({ id: "late-block", at: T0 + 5 * MINUTE })]));
  await source.check();

  const url = new URL(net.calls[1].url);
  assert.ok(Number(url.searchParams.get("min_timestamp")) <= T0 + 4 * MINUTE);
  assert.deepEqual(donations.map((donation) => donation.amount), [15.5, 2]);
});

test("смена адреса начинает счёт заново, с момента смены", async (t) => {
  const { source, net, clock, donations } = await make(await setup(t), page([transfer()]));
  await source.check();

  clock.now = T0 + 10 * MINUTE;
  net.set(page([]));
  source.configure({ ...source.config, address: OTHER_ADDRESS });
  assert.equal(source.amount, 0);
  await source.check();

  const url = new URL(net.calls.at(-1).url);
  assert.ok(url.pathname.includes(OTHER_ADDRESS));
  assert.equal(url.searchParams.get("min_timestamp"), String(T0 + 10 * MINUTE));
  assert.equal(donations.length, 1);
});

test("выключение и включение того же адреса сумму и момент начала не трогают", async (t) => {
  const { source, net, clock, donations } = await make(await setup(t), page([transfer()]));
  await source.check();

  net.set(page([transfer(), transfer({ id: "while-off", at: T0 + 20 * MINUTE, value: "3000000" })]));
  source.configure({ ...source.config, enabled: false });
  assert.equal(source.status, "off");
  assert.equal(source.enabled, false);

  clock.now = T0 + 40 * MINUTE;
  source.configure({ ...source.config, enabled: true });
  await source.check();

  assert.equal(source.amount, 18.5);
  assert.deepEqual(donations.map((donation) => donation.amount), [15.5, 3]);
  assert.equal(donations[1].quiet, true);
});

test("ответ на запрос по старому адресу после смены адреса выбрасывается", async (t) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const { source, net, donations } = await make(await setup(t), async () => {
    await held;
    return { ok: true, status: 200, json: async () => page([transfer()]).body };
  });

  const inFlight = source.check();
  net.set(page([]));
  source.configure({ ...source.config, address: OTHER_ADDRESS });
  release();
  await inFlight;

  assert.equal(donations.length, 0);
  assert.equal(source.amount, 0);
});

test("адрес с опечаткой: сеть не трогаем, лампочка красная, причина в логе", async (t) => {
  // Последняя буква заменена: длина и алфавит те же, контрольная сумма нет.
  const typo = "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwc";
  const { source, net } = await make(await setup(t), page([]), { config: { address: typo } });
  const logs = [];
  source.on("log", (text) => logs.push(text));

  await source.check();

  assert.equal(net.calls.length, 0);
  assert.equal(source.status, "error");
  assert.equal(logs.length, 1);
  await source.check();
  assert.equal(logs.length, 1, "одну и ту же причину раз в минуту не повторяем");
});

for (const [name, value, want] of [
  ["настоящий адрес", ADDRESS, true],
  ["контрольная сумма не сходится", "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwc", false],
  ["пусто", "", false],
  ["адрес Ethereum", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", false],
  ["символ вне base58", "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jw0", false],
  ["обрезанный адрес", "TWd4WrZ9wn84f5x1", false],
]) {
  test(`проверка адреса: ${name}`, () => {
    assert.equal(isTronAddress(value), want);
  });
}

test("все страницы ответа учитываются", async (t) => {
  const next = "https://api.trongrid.io/v1/next-page";
  const { source, net } = await make(await setup(t), page([transfer({ id: "p1" })], next));
  net.set(page([transfer({ id: "p1" })], next));
  net.push(page([transfer({ id: "p2", at: T0 + 2000 })]));

  await source.check();

  assert.equal(net.calls[1].url, next);
  assert.equal(source.amount, 31);
});

test("обрыв на второй странице: первая учтена, остальное приходит следующим опросом", async (t) => {
  const next = "https://api.trongrid.io/v1/next-page";
  const { source, net, clock, donations } = await make(await setup(t), page([transfer({ id: "p1" })], next));
  net.set(page([transfer({ id: "p1" })], next));
  net.push(new Error("обрыв"));

  await source.check();

  assert.equal(source.amount, 15.5);
  assert.equal(source.status, "error");

  net.set(page([transfer({ id: "p1" }), transfer({ id: "p2", at: T0 + 2000 })]));
  clock.now = T0 + 10 * MINUTE;
  await source.check();

  assert.equal(source.amount, 31);
  assert.equal(source.status, "on");
  assert.equal(donations.length, 2);
});

test("ссылка на следующую страницу с чужого хоста не запрашивается и ключ туда не уходит", async (t) => {
  const { source, net } = await make(await setup(t), page([transfer()], "https://evil.example/steal"), { config: { apiKey: "secret" } });

  await source.check();

  assert.equal(net.calls.length, 1);
  assert.equal(source.amount, 15.5);
});

test("ключ TronGrid уходит заголовком, а без ключа заголовка нет", async (t) => {
  const withKey = await make(await setup(t), page([]), { config: { apiKey: "secret" } });
  await withKey.source.check();
  assert.equal(withKey.net.calls[0].headers["TRON-PRO-API-KEY"], "secret");

  const without = await make(await setup(t), page([]));
  await without.source.check();
  assert.equal("TRON-PRO-API-KEY" in without.net.calls[0].headers, false);
});

test("при ошибке сервера сумма цела, опросы редеют, после восстановления лампочка зелёная", async (t) => {
  const { source, net, clock } = await make(await setup(t), page([transfer()]));
  await source.check();
  assert.equal(source.amount, 15.5);

  const logs = [];
  source.on("log", (text) => logs.push(text));

  net.set({ status: 429, body: {} });
  clock.now += MINUTE;
  await source.check();
  assert.equal(source.status, "error");
  assert.equal(source.amount, 15.5);
  const afterFirstFailure = net.calls.length;

  // Минута прошла, а пауза после ошибки — две: этот тик запроса не делает.
  clock.now += MINUTE;
  await source.check();
  assert.equal(net.calls.length, afterFirstFailure);

  clock.now += MINUTE;
  await source.check();
  assert.equal(net.calls.length, afterFirstFailure + 1);
  assert.equal(logs.length, 1, "про один обрыв пишем один раз");

  net.set(page([transfer()]));
  clock.now += 60 * MINUTE;
  await source.check();
  assert.equal(source.status, "on");
  assert.equal(source.amount, 15.5);
});

test("ответ без списка переводов — это ошибка, а не пустой результат", async (t) => {
  const { source } = await make(await setup(t), { status: 200, body: { success: false, error: "boom" } });

  await source.check();

  assert.equal(source.status, "error");
});

test("обнуление: сумма 0, старые переводы не возвращаются, новые считаются", async (t) => {
  const statePath = await setup(t);
  const { source, net, clock, donations } = await make(statePath, page([transfer()]));
  await source.check();

  clock.now = T0 + 10 * MINUTE;
  await source.reset();
  assert.equal(source.amount, 0);

  net.set(page([transfer(), transfer({ id: "new", at: T0 + 11 * MINUTE, value: "2000000" })]));
  clock.now = T0 + 12 * MINUTE;
  await source.check();

  assert.equal(source.amount, 2);
  assert.deepEqual(donations.map((donation) => donation.amount), [15.5, 2]);

  const restarted = await make(statePath, page([]), { at: T0 + 13 * MINUTE });
  assert.equal(restarted.source.amount, 2);
});

test("испорченный файл состояния не роняет источник: счёт начинается с текущего момента", async (t) => {
  const statePath = await setup(t);
  await writeFile(statePath, "{ не json", "utf8");

  const { source, net } = await make(statePath, page([]));
  await source.check();

  assert.equal(source.amount, 0);
  assert.equal(new URL(net.calls[0].url).searchParams.get("min_timestamp"), String(T0));
  JSON.parse(await readFile(statePath, "utf8"));
});

test("опрос цели в сеть не ходит и отдаёт накопленное", async (t) => {
  const { source, net } = await make(await setup(t), page([transfer()]));
  await source.check();
  const calls = net.calls.length;

  assert.equal(await source.pollGoal(), 15.5);
  assert.equal(net.calls.length, calls);
});

test("в цель сумма идёт с множителем, а выключенный источник даёт ноль", async (t) => {
  const { source } = await make(await setup(t), page([transfer({ value: "10000000" })]), { config: { rate: 0.9 } });
  await source.check();

  const goal = new Goal({ target: 100, currency: "EUR" }, [{ key: "tron", source, config: source.config }]);
  assert.equal(goal.snapshot().current, 9);

  source.configure({ ...source.config, enabled: false });
  assert.equal(goal.snapshot().current, 0);
});

test("файл состояния переезжает вместе с остальными данными", async (t) => {
  const from = path.dirname(await setup(t));
  const to = path.dirname(await setup(t));
  await writeFile(path.join(from, "tron.json"), "{}", "utf8");

  const moved = await migrateData(from, to);

  assert.deepEqual(moved, ["tron.json"]);
});
