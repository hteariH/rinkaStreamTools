// Медиатека алертов: гифки и звуки, которые стример добавил сам.
//
// Лежит в папке media/ рядом с конфигом — то есть рядом с exe, а не внутри
// public/. Так её видно из проводника, она переживает обновление программы (в
// public/ всё перезаписывается новой сборкой) и её не унесёт из репозитория
// чужими картинками.
//
// Файлы кладутся из панели: браузер шлёт тело файла как есть, имя — в адресе.
// Multipart тут не нужен вовсе — грузим по одному файлу, а разбирать границы
// формы руками в проекте без зависимостей значило бы писать парсер ради ничего.

import { mkdir, readdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

// Гифка — главный случай, но незачем запрещать остальное: оверлей покажет любую
// картинку, которую умеет браузер.
const IMAGE_EXT = new Set([".gif", ".png", ".jpg", ".jpeg", ".webp", ".apng", ".avif"]);
const SOUND_EXT = new Set([".mp3", ".ogg", ".wav", ".m4a", ".opus", ".flac"]);

// Потолок на файл. Гифка на десяток мегабайт в OBS уже подтормаживает, но
// запрещать её мы не вправе — это забота стримера; тут защита от случайно
// выбранного видео на гигабайт.
export const MAX_BYTES = 25 * 1024 * 1024;

export const MEDIA_MIME = {
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
};

/** Картинка, звук или ничего из этого. */
export function kindOf(name) {
  const ext = path.extname(String(name ?? "")).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (SOUND_EXT.has(ext)) return "sound";
  return null;
}

/**
 * Имя файла, пригодное для записи на диск, или null.
 *
 * Имя приходит снаружи — из адреса запроса, — поэтому от него отрезается всё,
 * чем можно уйти из папки: путь, разделители, точки-родители. Кириллицу и
 * пробелы оставляем: файлы называет человек, и «котик прыгает.gif» здесь
 * нормальное имя.
 */
export function safeName(raw) {
  // basename и по слэшу, и по обратному слэшу: имя могло прийти из Windows.
  const base = String(raw ?? "").split(/[\\/]/).pop().trim();
  if (!base || base === "." || base === "..") return null;
  if (!kindOf(base)) return null;

  const ext = path.extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^\p{L}\p{N} ._()\-]+/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return stem ? stem + ext : null;
}

export class Media {
  /** @param {string} dir папка медиатеки */
  constructor(dir) {
    this.dir = dir;
  }

  /** Файлы по видам. Нет папки — пустая медиатека, это не ошибка. */
  async list() {
    let names;
    try {
      names = await readdir(this.dir);
    } catch {
      return { images: [], sounds: [] };
    }

    const images = [];
    const sounds = [];
    for (const name of names.sort((a, b) => a.localeCompare(b, "ru"))) {
      const kind = kindOf(name);
      if (!kind) continue;
      let size = 0;
      try {
        const info = await stat(path.join(this.dir, name));
        if (!info.isFile()) continue;
        size = info.size;
      } catch {
        continue;
      }
      (kind === "image" ? images : sounds).push({ name, size, kind });
    }
    return { images, sounds };
  }

  /** Полный путь к файлу медиатеки или null, если имя нам не нравится. */
  pathFor(name) {
    const safe = safeName(name);
    if (!safe) return null;

    // Пояс поверх подтяжек: после safeName выйти из папки уже нечем, но проверка
    // стоит дёшево, а цена ошибки — чтение чужого файла с диска стримера.
    //
    // Сравниваются именно пути, а не строки: путь к папке может прийти с прямыми
    // слэшами, а path.resolve на Windows вернёт обратные, и проверка «начинается
    // с» отвергала бы собственные же файлы.
    const dir = path.resolve(this.dir);
    const full = path.resolve(dir, safe);
    const inside = path.relative(dir, full);
    return inside && !inside.startsWith("..") && !path.isAbsolute(inside) ? full : null;
  }

  /**
   * Записать файл. Имя занято — добавляем номер: молча затирать чужую гифку,
   * которая уже выбрана в тире, нельзя.
   */
  async save(name, data) {
    const safe = safeName(name);
    if (!safe) throw new Error("не тот тип файла");
    if (data.length > MAX_BYTES) throw new Error("файл слишком большой");

    await mkdir(this.dir, { recursive: true });

    const ext = path.extname(safe);
    const stem = safe.slice(0, safe.length - ext.length);
    let final = safe;
    for (let n = 2; await exists(path.join(this.dir, final)); n += 1) {
      final = `${stem} (${n})${ext}`;
    }

    await writeFile(path.join(this.dir, final), data);
    return final;
  }

  async remove(name) {
    const full = this.pathFor(name);
    if (!full) throw new Error("не тот тип файла");
    await unlink(full);
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
