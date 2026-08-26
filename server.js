// rinkaStreamTools — точка входа.
// Поднимает локальный сервер: панель управления на "/" и оверлеи для OBS
// на /raffle, /goal, /alerts и /screamer.

import { existsSync } from "node:fs";
import { loadConfig, saveConfig } from "./src/config.js";
import { CONFIG_PATH, PUBLIC_DIR } from "./src/paths.js";
import { log } from "./src/log.js";
import { App } from "./src/app.js";

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
      log.info("server", "приложение закрылось — выхожу");
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

  const config = await loadConfig();
  // Первый запуск: кладём конфиг рядом, чтобы его было где править руками.
  if (!existsSync(CONFIG_PATH)) await saveConfig(config);

  const app = new App(config);
  await app.start();

  watchParent();

  console.log("");
  console.log(`  Панель управления   http://localhost:${config.port}/`);
  console.log("  Источники для OBS (Browser Source):");
  console.log(`    розыгрыш          http://localhost:${config.port}/raffle`);
  console.log(`    цель сбора        http://localhost:${config.port}/goal`);
  console.log(`    топ донатеров     http://localhost:${config.port}/top`);
  console.log(`    алерты донатов    http://localhost:${config.port}/alerts`);
  console.log(`    скримеры          http://localhost:${config.port}/screamer`);
  console.log("");

  process.on("SIGINT", () => process.exit(0));
}

main().catch((error) => {
  if (error?.code === "EADDRINUSE") {
    log.warn("server", `порт занят — закрой другую копию или смени port в ${CONFIG_PATH}`);
  } else {
    console.error("Ошибка запуска:", error);
  }
  process.exit(1);
});
