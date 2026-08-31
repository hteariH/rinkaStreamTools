// Разбор того, что играет: приведение сырых данных из источника к одному виду.
//
// Источники дают разное. Медиасессия Windows отдаёт заголовок и исполнителя
// отдельными полями, но браузер кладёт в них название ролика и имя канала, а
// foobar и AIMP через файл пишут одной строкой «Исполнитель — Название». Поэтому
// разбор один на всех: если исполнителя нет, а в названии есть тире — делим по нему.
//
// Чистая логика, без процессов и файлов: её и проверяют тесты.

// Тире, которыми плееры разделяют исполнителя и название. Порядок важен: длинное
// «пробел-тире-пробел» ищется раньше, иначе «AC/DC - Back in Black» развалилось бы
// по первому попавшемуся дефису внутри имени.
const SEPARATORS = [" — ", " – ", " -- ", " - "];

// Названия бывают длиной в абзац (сборники, ролики с описанием в заголовке).
// На оверлее такое не читается, а в лог не помещается.
const MAX_LEN = 160;

/** Играет ли что-то на самом деле. Всё, кроме этих двух, — тишина. */
const STATUSES = new Set(["playing", "paused"]);

/**
 * Сырые данные источника → запись трека или null, если играть нечего.
 * @param {{title?: string, artist?: string, album?: string, app?: string, status?: string}} raw
 */
export function normalizeTrack(raw) {
  if (!raw) return null;

  const status = String(raw.status ?? "playing").toLowerCase();
  if (!STATUSES.has(status)) return null;

  let title = clean(raw.title);
  let artist = clean(raw.artist);

  // Исполнителя нет, а в названии он, похоже, есть — делим.
  if (!artist && title) {
    const split = splitArtistTitle(title);
    if (split) ({ artist, title } = split);
  }

  if (!title && !artist) return null;

  return {
    title: cut(title, MAX_LEN),
    artist: cut(artist, MAX_LEN),
    // Альбом на оверлей не идёт: место занимает, а читать его некому. Он нужен,
    // чтобы найти ту самую обложку, — Spotify называет альбом точно, и по нему из
    // выдачи каталога выбирается нужный вариант, а не первый попавшийся сборник.
    album: cut(clean(raw.album), MAX_LEN),
    status,
    app: clean(raw.app),
    // Ссылку на обложку дописывает служба, когда каталог ответит: искать её
    // синхронно значило бы задерживать смену трека на оверлее.
    cover: null,
  };
}

/**
 * «Исполнитель — Название» одной строкой. Возвращает null, если разделителя нет:
 * название без исполнителя — обычное дело, выдумывать его не надо.
 */
export function splitArtistTitle(line) {
  const text = clean(line);
  if (!text) return null;

  for (const separator of SEPARATORS) {
    const at = text.indexOf(separator);
    if (at <= 0) continue;
    const artist = text.slice(0, at).trim();
    const title = text.slice(at + separator.length).trim();
    if (artist && title) return { artist, title };
  }
  return null;
}

/** Один и тот же трек в том же состоянии — рассылать нечего. */
export function sameTrack(a, b) {
  if (!a || !b) return a === b;
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.album === b.album &&
    a.status === b.status
  );
}

/** Строка для лога панели: «Исполнитель — Название». */
export function trackLabel(track) {
  if (!track) return "тишина";
  return [track.artist, track.title].filter(Boolean).join(" — ");
}

/**
 * Что уходит на оверлей.
 *
 * Пауза разбирается здесь, а не на странице: прятать оверлей на паузе — настройка,
 * а настройки живут на сервере. Оверлею достаётся уже готовое решение.
 */
export function trackSnapshot(track, config, theme) {
  const visible = track && !(track.status === "paused" && config.hideWhenPaused !== false);

  return {
    type: "track",
    // Подпись оверлея («Сейчас играет»), а не название песни — оно внутри track.
    title: config.title || "",
    theme,
    // Пикселей в секунду: длинное название едет строкой, короткое стоит на месте.
    speed: Number(config.speed) > 0 ? Number(config.speed) : 40,
    track: visible
      ? {
          title: track.title,
          artist: track.artist,
          status: track.status,
          cover: track.cover || null,
        }
      : null,
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cut(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}
