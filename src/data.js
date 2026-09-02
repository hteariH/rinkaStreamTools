// Переезд данных из папки программы в профиль пользователя.
//
// До этого настройки, таблица донатеров, лента и медиа лежали рядом с exe. Это
// ломалось об обычную привычку обновляться: браузер распаковывает новый архив в
// соседнюю папку «имя (1)», человек запускает оттуда — и оказывается с чистыми
// настройками, а прошлые донаты остаются в старой папке.
//
// Поэтому при первом запуске новой версии данные, лежащие рядом с exe,
// переезжают в профиль. Именно копируются, а не переносятся: если человек
// вернётся на старую версию, ей будет чем работать.

import { mkdir, readdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";

// Что именно считается данными стримера.
const FILES = ["config.json", "donors.json", "recent.json"];
const FOLDERS = ["media"];

/**
 * Скопировать данные из старого места в новое, если в новом их ещё нет.
 * Возвращает список того, что переехало, — для лога.
 *
 * @param {string} from папка программы
 * @param {string} to папка данных
 */
export async function migrateData(from, to) {
  if (path.resolve(from) === path.resolve(to)) return [];

  await mkdir(to, { recursive: true });
  const moved = [];

  for (const name of FILES) {
    // Файл на новом месте уже есть — он и главный: перезаписать его старым
    // значило бы откатить настройки, которые человек уже поменял.
    if (await exists(path.join(to, name))) continue;
    if (!(await exists(path.join(from, name)))) continue;

    await copyFile(path.join(from, name), path.join(to, name));
    moved.push(name);
  }

  for (const name of FOLDERS) {
    const source = path.join(from, name);
    const target = path.join(to, name);
    if (!(await exists(source))) continue;

    await mkdir(target, { recursive: true });
    for (const file of await readdir(source)) {
      // Файлы медиатеки не сливаются по содержимому: одноимённый на новом месте
      // считается тем же самым.
      if (await exists(path.join(target, file))) continue;
      const info = await stat(path.join(source, file));
      if (!info.isFile()) continue;

      await copyFile(path.join(source, file), path.join(target, file));
      moved.push(`${name}/${file}`);
    }
  }

  return moved;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
