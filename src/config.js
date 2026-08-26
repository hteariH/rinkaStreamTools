// Конфиг живёт в одном файле рядом с исполняемым (config.json) и правится из
// веб-панели, а не руками. Поэтому запись идёт «мержем поверх текущего файла»:
// пользователь мог что-то дописать сам, и терять это при сохранении нельзя.

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

export const DEFAULTS = {
  port: 3777,
  raffle: {
    axelchatUrl: "ws://127.0.0.1:8356",
    command: "!хил",
    theme: "default",
  },
  donationAlerts: {
    enabled: false,
    // Ссылка на виджет цели из личного кабинета DonationAlerts:
    // https://www.donationalerts.com/widget/goal/<id>?token=<token>
    widgetUrl: "",
    // Множитель, если валюта источника отличается от валюты цели. 1 — как есть.
    rate: 1,
  },
  donatello: {
    enabled: false,
    // https://donatello.to/widget/<widgetId>/token/<token>
    widgetUrl: "",
    rate: 1,
  },
  goal: {
    target: 700,
    currency: "USD",
    title: "",
    // Ручная добавка к сумме: наличные, крипта, донаты мимо площадок.
    manualOffset: 0,
    pollIntervalMs: 60000,
    theme: "default",
  },
  alerts: {
    enabled: true,
    durationMs: 7000,
    minAmount: 0,
  },
  screamer: {
    enabled: true,
    durationMs: 5000,
    opacity: 0.75,
    // Валюта, в которую DonationAlerts пересчитывает донат сам. Нужна только для
    // валют, порога для которых ниже нет.
    baseCurrency: "USD",
    // Пороги задаются прямо в валютах, без курсов: донат сравнивается с порогом
    // той же валюты, в которой пришёл. "default" — для всего остального.
    minAmounts: {
      USD: 3,
      USDT: 3,
      EUR: 3,
      UAH: 100,
      RUB: 250,
      KZT: 1300,
      BYN: 8,
      default: 4,
    },
  },
};

// Мерж на два уровня: верхний ключ (raffle, goal, …) и его поля. Глубже вложенности
// в конфиге нет, кроме screamer.minAmounts — его заменяем целиком, потому что
// удаление валюты из панели иначе было бы невозможно.
function merge(defaults, patch) {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && defaults[key] && typeof defaults[key] === "object") {
      out[key] = key === "minAmounts" ? { ...value } : merge(defaults[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return merge(DEFAULTS, JSON.parse(raw));
  } catch {
    return merge(DEFAULTS, {});
  }
}

export async function saveConfig(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}
