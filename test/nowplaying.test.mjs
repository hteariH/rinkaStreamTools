// «Сейчас играет»: разбор того, что приходит от плеера, и что из этого уезжает
// на оверлей. Источники (PowerShell и файл) здесь не трогаются — проверяется
// логика, общая для обоих.

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTrack,
  splitArtistTitle,
  sameTrack,
  trackSnapshot,
} from "../src/nowplaying/track.js";
import { parseFileText } from "../src/nowplaying/file.js";
import { SystemMediaSource } from "../src/nowplaying/system.js";
import { pickByAlbum } from "../src/nowplaying/cover.js";
import { NowPlaying } from "../src/nowplaying/nowplaying.js";
import { DEFAULTS } from "../src/config.js";

const config = (patch = {}) => ({ ...structuredClone(DEFAULTS.nowplaying), ...patch });

test("исполнитель и название разбираются из одной строки", () => {
  const track = normalizeTrack({ title: "Кино — Кукушка", status: "Playing" });
  assert.equal(track.artist, "Кино");
  assert.equal(track.title, "Кукушка");
});

test("дефис внутри имени исполнителя не считается разделителем", () => {
  // Разделитель — тире с пробелами по бокам, а не любой дефис: иначе AC/DC и
  // Jay-Z разваливались бы на части.
  assert.equal(splitArtistTitle("Jay-Z"), null);
  assert.deepEqual(splitArtistTitle("AC/DC - Back in Black"), {
    artist: "AC/DC",
    title: "Back in Black",
  });
});

test("исполнителя из плеера не перебиваем разбором названия", () => {
  const track = normalizeTrack({ artist: "Кино", title: "Кукушка - Live", status: "Playing" });
  assert.equal(track.artist, "Кино");
  assert.equal(track.title, "Кукушка - Live");
});

test("остановленный плеер — это тишина, а пауза нет", () => {
  assert.equal(normalizeTrack({ title: "Кукушка", status: "Stopped" }), null);
  assert.equal(normalizeTrack({ title: "Кукушка", status: "Closed" }), null);
  assert.equal(normalizeTrack({ title: "Кукушка", status: "Paused" }).status, "paused");
});

test("пустой трек — тишина", () => {
  assert.equal(normalizeTrack({ title: "  ", artist: "", status: "Playing" }), null);
  assert.equal(normalizeTrack(null), null);
});

test("смена паузы считается изменением, повтор того же — нет", () => {
  const playing = normalizeTrack({ artist: "Кино", title: "Кукушка", status: "Playing" });
  const paused = normalizeTrack({ artist: "Кино", title: "Кукушка", status: "Paused" });

  assert.ok(sameTrack(playing, { ...playing }));
  assert.ok(!sameTrack(playing, paused));
  assert.ok(!sameTrack(playing, null));
  assert.ok(sameTrack(null, null));
});

test("на паузе оверлей пуст, если это включено в настройках", () => {
  const paused = normalizeTrack({ artist: "Кино", title: "Кукушка", status: "Paused" });

  assert.equal(trackSnapshot(paused, config({ hideWhenPaused: true }), "default").track, null);
  assert.equal(
    trackSnapshot(paused, config({ hideWhenPaused: false }), "default").track.status,
    "paused"
  );
});

test("альбом на оверлей не уходит — он нужен только для обложки", () => {
  const track = normalizeTrack({
    artist: "Linkin Park",
    title: "Numb",
    album: "Meteora",
    status: "Playing",
  });

  assert.equal(track.album, "Meteora");
  assert.deepEqual(Object.keys(trackSnapshot(track, config(), "default").track).sort(), [
    "artist", "cover", "status", "title",
  ]);
});

test("файл плеера: одна строка и две разбираются по-разному", () => {
  assert.deepEqual(parseFileText("Кино - Кукушка"), {
    title: "Кино - Кукушка",
    artist: "",
    status: "playing",
  });
  assert.deepEqual(parseFileText("Кукушка\r\nКино\r\n"), {
    title: "Кукушка",
    artist: "Кино",
    status: "playing",
  });
  assert.equal(parseFileText("  \n\n"), null);
});

test("обложка выбирается по альбому, а не по первому попавшемуся варианту", () => {
  const results = [
    { album: "Live In Texas" },
    { album: "Meteora (Deluxe Edition)" },
  ];
  const albumOf = (item) => item.album;

  // Скобки и регистр в счёт не идут: каталоги пишут одно и то же издание по-разному.
  assert.equal(pickByAlbum(results, "meteora", albumOf).album, "Meteora (Deluxe Edition)");
  // Альбома плеер не назвал или совпадения нет — первый вариант каталога.
  assert.equal(pickByAlbum(results, "", albumOf).album, "Live In Texas");
  assert.equal(pickByAlbum(results, "One More Light", albumOf).album, "Live In Texas");
  assert.equal(pickByAlbum([], "Meteora", albumOf), null);
});

test("обложка ищется один раз на трек и переживает паузу", async () => {
  let calls = 0;
  const covers = {
    find: async () => {
      calls += 1;
      return "https://example.invalid/cover.jpg";
    },
  };

  const service = new NowPlaying(config({ enabled: true }), covers);
  const seen = [];
  service.on("change", (track) => seen.push(track));

  service._onRawTrack({ artist: "Кино", title: "Кукушка", status: "Playing" });
  await new Promise((resolve) => setImmediate(resolve));
  service._onRawTrack({ artist: "Кино", title: "Кукушка", status: "Paused" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls, 1, "обложку искали заново на паузе");
  assert.equal(service.current.cover, "https://example.invalid/cover.jpg");
  // Три рассылки: трек, он же с обложкой, он же на паузе.
  assert.equal(seen.length, 3);
});

test("обложка, опоздавшая к смене трека, на оверлей не попадает", async () => {
  // Ответы каталога придерживаем: важно, что будет с ответом на трек, который уже
  // сняли с эфира, — второй запрос так и остаётся висеть.
  const pending = [];
  const covers = {
    find: () => new Promise((resolve) => pending.push(resolve)),
  };

  const service = new NowPlaying(config({ enabled: true }), covers);
  service._onRawTrack({ artist: "Кино", title: "Кукушка", status: "Playing" });
  service._onRawTrack({ artist: "Кино", title: "Группа крови", status: "Playing" });

  pending[0]("https://example.invalid/kukushka.jpg");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(service.current.title, "Группа крови");
  assert.equal(service.current.cover, null, "обложка прошлого трека прилипла к новому");
});

test("список приложений уходит только когда он изменился", () => {
  // Скрипт опроса печатает список на каждом тике — дважды в секунду. Раньше
  // каждая такая строка поднимала рассылку полного состояния в панель, и за
  // пару часов эфира набегали тысячи лишних перерисовок.
  const source = new SystemMediaSource({ appFilter: "", pollIntervalMs: 1500 });
  const seen = [];
  source.on("apps", (apps) => seen.push(apps));

  const line = (apps) => JSON.stringify({ apps, track: null }) + "\n";
  source._onData(line(["Spotify.exe"]));
  source._onData(line(["Spotify.exe"]));
  source._onData(line(["Spotify.exe"]));
  assert.equal(seen.length, 1, `на одинаковый список ушло ${seen.length} рассылок`);

  // Открыли ещё один плеер — вот теперь панели есть что показать.
  source._onData(line(["Spotify.exe", "AIMP.exe"]));
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], ["Spotify.exe", "AIMP.exe"]);
});
