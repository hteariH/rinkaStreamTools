// Озвучка донатов: что уходит на синтез, чем читаем и что видно панели.
// Сеть не трогается; офлайновый движок проверяется только там, где он есть.

import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

import { Tts } from "../src/tts/service.js";
import { speechText } from "../src/tts/text.js";
import { WindowsVoice } from "../src/tts/windows.js";
import { DEFAULTS } from "../src/config.js";

const config = (patch = {}) => ({ ...structuredClone(DEFAULTS.tts), ...patch });
const donation = (patch = {}) => ({ donorName: "Аня", message: "спасибо за стрим", ...patch });

/* ------------------------------------------------------------------ текст */

test("имя читается перед сообщением, если это включено", () => {
  assert.equal(speechText(donation(), config()), "Аня пишет: спасибо за стрим");
  assert.equal(speechText(donation(), config({ readName: false })), "спасибо за стрим");
  // Аноним — просто сообщение, без выдуманного имени.
  assert.equal(speechText(donation({ donorName: null }), config()), "спасибо за стрим");
});

test("ссылки не читаются вслух", () => {
  const text = speechText(
    donation({ message: "зацени https://example.com/очень/длинный/адрес вот" }),
    config({ readName: false })
  );
  assert.equal(text, "зацени вот");
});

test("длинное сообщение режется по лимиту символов", () => {
  const text = speechText(
    donation({ message: "а".repeat(500) }),
    config({ readName: false, maxChars: 50 })
  );
  // У облака счёт посимвольный: лимит — это прямые деньги, а не косметика.
  assert.ok(text.length <= 51, `в синтез ушло ${text.length} символов`);
  assert.ok(text.endsWith("…"));
});

test("донат без сообщения не озвучивается", () => {
  assert.equal(speechText(donation({ message: "" }), config()), "");
  assert.equal(speechText(donation({ message: "   " }), config()), "");
  // Из одних ссылок читать тоже нечего.
  assert.equal(speechText(donation({ message: "https://example.com" }), config()), "");
});

/* ----------------------------------------------------------------- движки */

test("по умолчанию читает офлайновый голос, а не облако", () => {
  // Бесплатно и без ключей: включил галочку — работает, если голос есть в системе.
  assert.equal(new Tts(config()).engineName, "windows");
});

test("облачный движок готов только с ключом и голосом", () => {
  const cloud = (elevenlabs) => new Tts(config({ engine: "elevenlabs", enabled: true, elevenlabs }));

  assert.equal(cloud({ apiKey: "", voiceId: "" }).enabled, false);
  assert.equal(cloud({ apiKey: "k", voiceId: "" }).enabled, false);
  assert.equal(cloud({ apiKey: "k", voiceId: "v" }).enabled, true);
  // Ключ копируют из кабинета вместе с переносом строки — края обрезаются.
  assert.equal(cloud({ apiKey: " k \n", voiceId: " v " }).enabled, true);
});

test("смена движка сбрасывает то, что относилось к прошлому", () => {
  const tts = new Tts(config({ engine: "elevenlabs", elevenlabs: { apiKey: "k", voiceId: "v" } }));
  tts.voices = [{ id: "v", name: "Голос" }];
  tts.quota = { used: 10, limit: 100 };

  tts.configure(config({ engine: "windows" }));
  assert.equal(tts.engineName, "windows");
  assert.deepEqual(tts.voices, [], "остались голоса прошлого движка");
  assert.equal(tts.quota, null, "остался лимит прошлого движка");
});

test("смена ключа тоже сбрасывает список голосов", () => {
  const make = (apiKey) => config({ engine: "elevenlabs", elevenlabs: { apiKey, voiceId: "v", modelId: "m" } });
  const tts = new Tts(make("старый"));
  tts.voices = [{ id: "v", name: "Голос" }];

  tts.configure(make("новый"));
  assert.deepEqual(tts.voices, [], "остался список голосов чужого аккаунта");
});

test("ключ не уходит в панель", () => {
  const tts = new Tts(config({
    engine: "elevenlabs",
    enabled: true,
    elevenlabs: { apiKey: "секретный-ключ", voiceId: "v" },
  }));

  const state = JSON.stringify(tts.state());
  assert.ok(!state.includes("секретный-ключ"), "ключ уехал в состояние панели");
  assert.equal(tts.state().hasKey, true);
});

/* ------------------------------------------------------------------ звук */

test("в памяти держится последняя горстка озвучек, не больше", () => {
  const tts = new Tts(config());
  for (let i = 0; i < 30; i += 1) {
    tts.remember(`id-${i}`, { audio: Buffer.from(`звук ${i}`), ext: "wav" });
  }

  assert.ok(tts.cache.size <= 20, `в памяти ${tts.cache.size} озвучек`);
  // Свежая на месте, самая старая вытеснена.
  assert.equal(tts.take("id-29").audio.toString(), "звук 29");
  assert.equal(tts.take("id-0"), null);
});

test("озвучка выключена — синтез даже не начинается", async () => {
  const tts = new Tts(config({ enabled: false }));
  assert.equal(await tts.speak(donation()), null);
});

/* ---------------------------------------------------- голоса самой Windows */

// Проверяем настоящий PowerShell — но только там, где он есть.
const onWindows = process.platform === "win32" ? test : test.skip;

onWindows("список голосов Windows приходит с языком каждого", async () => {
  const voices = await new WindowsVoice({}).voices();

  assert.ok(voices.length > 0, "система не отдала ни одного голоса");
  for (const voice of voices) {
    assert.ok(voice.id, "у голоса нет имени");
    // Язык нужен панели: голосом одного языка текст другого читается молча.
    assert.match(voice.culture, /^[a-z]{2}-[A-Z]{2}$/, `странный язык: ${voice.culture}`);
  }
});

onWindows("текст на языке голоса озвучивается", async () => {
  const voices = await new WindowsVoice({}).voices();
  const english = voices.find((voice) => voice.culture.startsWith("en"));
  if (!english) return; // английского голоса может не быть — проверять нечего

  const { audio, ext } = await new WindowsVoice({ voice: english.id }).synthesize("thanks for the stream");
  assert.equal(ext, "wav");
  assert.ok(audio.length > 1024, `получилось ${audio.length} байт — это тишина`);
});
