// Опрос в чате: что считается голосом, кто может передумать и как это выглядит
// на оверлее. Голоса приходят из того же потока сообщений, что и розыгрыш, —
// значит, обычная болтовня не должна попадать в подсчёт.

import test from "node:test";
import assert from "node:assert/strict";

import { Poll } from "../src/poll/poll.js";
import { DEFAULTS } from "../src/config.js";

const config = (patch = {}) => ({ ...structuredClone(DEFAULTS.poll), ...patch });

function started(patch = {}, options = ["Doom", "Factorio", "Разговорный"]) {
  const poll = new Poll(config(patch));
  poll.start({ question: "Во что играем?", options, seconds: 0 });
  return poll;
}

const says = (poll, name, text, serviceId = "twitch") => poll.vote({ name, serviceId, text });

test("голосом считается сообщение из одной цифры", () => {
  const poll = started();

  assert.equal(says(poll, "Аня", "2"), true);
  // Обычная болтовня с числом внутри — не голос: иначе в подсчёт попадали бы
  // чужие разговоры.
  assert.equal(says(poll, "Петя", "2 балла из 10"), false);
  assert.equal(says(poll, "Вася", "думаю 1"), false);
  assert.equal(says(poll, "Гоша", "привет"), false);
  assert.equal(poll.total, 1);
});

test("вариант вне списка не засчитывается", () => {
  const poll = started();
  assert.equal(says(poll, "Аня", "7"), false);
  assert.equal(says(poll, "Аня", "0"), false);
  assert.equal(poll.total, 0);
});

test("с командой голосом считается только команда с номером", () => {
  const poll = started({ command: "!голос" });

  assert.equal(says(poll, "Аня", "2"), false, "без команды голоса быть не должно");
  assert.equal(says(poll, "Аня", "!голос 2"), true);
  // Регистр команды не важен — её набирают на бегу.
  assert.equal(says(poll, "Петя", "!ГОЛОС 1"), true);
  assert.equal(poll.total, 2);
});

test("один зритель — один голос, и его можно переменить", () => {
  const poll = started();

  says(poll, "Аня", "1");
  says(poll, "Аня", "1");
  assert.equal(poll.total, 1, "повтор того же голоса ничего не меняет");

  assert.equal(says(poll, "Аня", "3"), true);
  assert.equal(poll.total, 1, "переголосовавший остаётся одним человеком");

  const snapshot = poll.snapshot("default");
  assert.equal(snapshot.options[0].votes, 0, "старый голос не остался за первым вариантом");
  assert.equal(snapshot.options[2].votes, 1);
});

test("если менять голос запрещено, засчитывается первый", () => {
  const poll = started({ allowChange: false });

  says(poll, "Аня", "1");
  assert.equal(says(poll, "Аня", "2"), false);
  assert.equal(poll.snapshot("default").options[0].votes, 1);
});

test("один ник на разных площадках — разные зрители", () => {
  const poll = started();
  says(poll, "Аня", "1", "twitch");
  says(poll, "Аня", "2", "youtube");
  assert.equal(poll.total, 2);
});

test("закрытое голосование голосов не принимает", () => {
  const poll = started();
  says(poll, "Аня", "1");
  poll.stop();

  assert.equal(says(poll, "Петя", "2"), false);
  assert.equal(poll.total, 1);
  // Итоги остаются на экране: их обсуждают уже после отсчёта.
  assert.equal(poll.snapshot("default").visible, true);
  assert.equal(poll.snapshot("default").open, false);
});

test("опрос с одним вариантом не запускается", () => {
  const poll = new Poll(config());
  assert.equal(poll.start({ question: "Ну что?", options: ["Да"] }), false);
  assert.equal(poll.start({ question: "Ну что?", options: ["", "  "] }), false);
  assert.equal(poll.snapshot("default").visible, false);
});

test("вариантов не больше девяти — голосуют одним символом", () => {
  const poll = new Poll(config());
  poll.start({ question: "Много", options: Array.from({ length: 15 }, (_, i) => `Вариант ${i + 1}`) });
  assert.equal(poll.snapshot("default").options.length, 9);
});

test("проценты считает сервер, и ноль голосов его не смущает", () => {
  const poll = started();
  const empty = poll.snapshot("default");
  assert.deepEqual(empty.options.map((option) => option.percent), [0, 0, 0]);

  says(poll, "Аня", "1");
  says(poll, "Петя", "1");
  says(poll, "Вася", "2");

  const snapshot = poll.snapshot("default");
  assert.deepEqual(snapshot.options.map((option) => option.percent), [67, 33, 0]);
  assert.equal(snapshot.total, 3);
});

test("ведущего подсвечиваем только после закрытия и только одного", () => {
  const poll = started();
  says(poll, "Аня", "1");
  says(poll, "Петя", "2");

  // Пока идёт голосование, подсветка прыгала бы туда-сюда.
  assert.ok(poll.snapshot("default").options.every((option) => !option.leading));

  poll.stop();
  // Ничья — никого не выделяем: объявить победителем того, кто выше в списке,
  // было бы враньём.
  assert.ok(poll.snapshot("default").options.every((option) => !option.leading));

  poll.open = true;
  says(poll, "Вася", "2");
  poll.stop();
  assert.deepEqual(poll.snapshot("default").options.map((option) => option.leading), [false, true, false]);
});

test("убранный опрос не оставляет следов", () => {
  const poll = started();
  says(poll, "Аня", "1");
  poll.clear();

  const snapshot = poll.snapshot("default");
  assert.equal(snapshot.visible, false);
  assert.equal(snapshot.options.length, 0);
  assert.equal(poll.total, 0);
});

test("анонимное сообщение без имени голосом не считается", () => {
  const poll = started();
  assert.equal(poll.vote({ name: "", serviceId: "twitch", text: "1" }), false);
  assert.equal(poll.total, 0);
});
