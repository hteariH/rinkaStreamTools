// rinkaStreamTools — точка входа.
// Поднимает локальный сервер: панель управления на "/" и оверлеи для OBS
// на /raffle, /goal, /top, /recent, /alerts и /screamer.

import { existsSync } from "node:fs";
import { loadConfig, saveConfig } from "./src/config.js";
import { migrateData } from "./src/data.js";
import { BASE_DIR, CONFIG_PATH, DATA_DIR, PUBLIC_DIR } from "./src/paths.js";
import { log } from "./src/log.js";
import { App } from "./src/app.js";
import { t } from "./src/i18n.js";

/**
 * Когда сервер запущен окном-приложением, оно передаёт свой pid. Закрылось
 * приложение — уходим следом: иначе после аварийного завершения (или снятия через
 * диспетчер задач) сервер остался бы висеть и держать порт до перезагрузки.
 * Штатный выход приложение делает само, это подстраховка на всё остальное.
 */
function watchParent() {
  const pid = Number(process.env.RINKA_PARENT_PID);
  if (!Number.isInteger(pid) || pid <= 0) return;

  const timer = setInterval(() => {
    try {
      // Сигнал 0 ничего не шлёт, только проверяет, что процесс существует.
      process.kill(pid, 0);
    } catch (error) {
      // EPERM значит, что процесс жив, просто чужой — это не повод выходить.
      if (error.code !== "ESRCH") return;
      log.info("server", t("приложение закрылось — выхожу"));
      process.exit(0);
    }
  }, 5000);
  timer.unref();
}

async function main() {
  // Без public/ сервер поднимется, но будет молча отдавать 404 на всё — самая
  // вероятная причина этого в том, что exe вынули из папки dist и положили одиноко.
  if (!existsSync(PUBLIC_DIR)) {
    console.error(`Рядом нет папки public/ — ожидалась в ${PUBLIC_DIR}`);
    console.error("Панель и оверлеи без неё не откроются. Положи exe обратно в папку dist.");
    process.exit(1);
  }

  // Данные лежат в профиле пользователя, а раньше лежали рядом с exe. Первый
  // запуск новой версии забирает их с прошлого места, иначе обновление выглядело
  // бы как потеря настроек и всех донатов за эфиры.
  const moved = await migrateData(BASE_DIR, DATA_DIR);
  if (moved.length) {
    log.ok("server", t("настройки и данные перенесены в {dir}: {what}", { dir: DATA_DIR, what: moved.join(", ") }));
  }

  const config = await loadConfig();
  // Первый запуск: кладём конфиг рядом, чтобы его было где править руками.
  if (!existsSync(CONFIG_PATH)) await saveConfig(config);

  const app = new App(config);
  await app.start();

  watchParent();

  /*
   * Приветствие в консоли: его видит тот, кто запустил сервер руками, — значит
   * оно тоже на языке из настроек. Список адресов собирается из одного массива,
   * чтобы новый оверлей не забыли дописать сюда.
   */
  const overlays = [
    ["розыгрыш", "raffle"],
    ["цель сбора", "goal"],
    ["топ донатеров", "top"],
    ["последние донаты", "recent"],
    ["сейчас играет", "track"],
    ["опрос в чате", "poll"],
    ["счётчик", "counter"],
    ["алерты донатов", "alerts"],
    ["скримеры", "screamer"],
  ];
  const width = Math.max(...overlays.map(([name]) => t(name).length));

  console.log("");
  console.log(`  ${t("Панель управления")}   http://localhost:${config.port}/`);
  console.log(`  ${t("Данные и настройки")}  ${DATA_DIR}`);
  console.log(`  ${t("Источники для OBS (Browser Source):")}`);
  for (const [name, path] of overlays) {
    console.log(`    ${t(name).padEnd(width)}  http://localhost:${config.port}/${path}`);
  }
  console.log("");

  process.on("SIGINT", () => process.exit(0));
}

main().catch((error) => {
  if (error?.code === "EADDRINUSE") {
    log.warn("server", t("порт занят — закрой другую копию или смени port в {path}", { path: CONFIG_PATH }));
  } else {
    console.error("Ошибка запуска:", error);
  }
  process.exit(1);
});
