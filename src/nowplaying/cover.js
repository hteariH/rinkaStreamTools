// Обложка трека: ищется по исполнителю, названию и альбому в открытых каталогах —
// сначала iTunes Search, потом Deezer. Ключи и регистрация им не нужны, поэтому
// стримеру настраивать нечего: включил галочку — обложки появились.
//
// Свою обложку Spotify наружу не отдаёт: в медиасессии Windows она лежит потоком,
// который PowerShell 5.1 прочитать не может, а Web API требует авторизации. Зато
// сам альбом Spotify называет точно — по нему из выдачи каталога и выбирается
// нужный вариант, иначе на «Numb» прилетела бы обложка сборника, а не альбома.
//
// Два каталога, а не один: у iTunes лучше с зарубежным, у Deezer — с тем, чего в
// нём нет. Не нашлось ни там, ни там — оверлей покажет трек без обложки, это не
// ошибка.
//
// Наружу уходит только «исполнитель + название + альбом»: ни донатов, ни зрителей,
// ни ников в этих запросах нет.

import { log } from "../log.js";

const TIMEOUT_MS = 5000;

// Сколько вариантов просить у каталога, чтобы было из чего выбирать по альбому.
const CANDIDATES = 8;

// Треки повторяются (плейлист идёт по кругу, песня ставится на паузу и обратно),
// а каталог отвечает на одно и то же одинаково — второй раз спрашивать незачем.
// Промахи кэшируются тоже: искать несуществующую обложку заново на каждой паузе
// значит долбить каталог зря.
const CACHE_MAX = 200;

export class Covers {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Ссылка на обложку или null. Никогда не бросает: обложка — украшение, из-за
   * неё эфир останавливаться не должен.
   */
  async find(artist, title, album = "") {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return null;

    const key = `${query}|${album}`;
    if (this.cache.has(key)) return this.cache.get(key);

    let url = null;
    try {
      url = (await fromItunes(query, album)) || (await fromDeezer(query, album));
    } catch (error) {
      // Нет сети — обложек не будет, и ладно. Пишем один раз на трек, а не на
      // каждый опрос: лог панели не должен зарастать этим.
      log.info("track", `обложка не нашлась: ${error.message}`);
    }

    this.remember(key, url);
    return url;
  }

  remember(key, url) {
    // Простое вытеснение по возрасту: Map хранит порядок вставки, самый старый —
    // первый. Для двух сотен треков за эфир этого хватает с запасом.
    if (this.cache.size >= CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, url);
  }

  clear() {
    this.cache.clear();
  }
}

async function fromItunes(query, album) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${CANDIDATES}`;
  const results = (await getJson(url))?.results ?? [];
  const best = pickByAlbum(results, album, (item) => item.collectionName);
  const art = best?.artworkUrl100;
  // Отдаётся превью в сотню пикселей, но по тому же адресу лежит и крупная
  // картинка — на оверлее сотня выглядела бы мылом.
  return art ? String(art).replace(/\/100x100bb\.jpg$/, "/600x600bb.jpg") : null;
}

async function fromDeezer(query, album) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${CANDIDATES}`;
  const results = (await getJson(url))?.data ?? [];
  const best = pickByAlbum(results, album, (item) => item.album?.title);
  return best?.album?.cover_big || null;
}

/**
 * Из выдачи каталога — вариант с тем же альбомом, что назвал плеер. Альбома нет
 * или совпадения нет — берём первый: он и так самый близкий по релевантности.
 *
 * Сравнение нестрогое: один и тот же альбом каталоги пишут то «Meteora», то
 * «Meteora (Bonus Track Version)», и требовать точного равенства значило бы почти
 * всегда откатываться к первому попавшемуся.
 */
export function pickByAlbum(results, album, albumOf) {
  if (!results.length) return null;

  const wanted = simplify(album);
  if (!wanted) return results[0];

  return (
    results.find((item) => {
      const found = simplify(albumOf(item));
      return found && (found === wanted || found.includes(wanted) || wanted.includes(found));
    }) || results[0]
  );
}

/** Название альбома без регистра, скобок и знаков: сравнивать нужно суть. */
function simplify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function getJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "rinkaStreamTools" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
