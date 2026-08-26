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
    // Разыграть победителя самому, как только истечёт обратный отсчёт, — чтобы
    // не ловить момент и не жать «Разыграть» в прямом эфире.
    autoDrawOnTimer: false,
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
    // Тиры: во что попадает донат по сумме. Каждый включается отдельно для каждой
    // площадки — например мелкие донаты с Donatello показывать, а с DonationAlerts
    // нет, если там свои алерты уже настроены.
    //
    // Пороги задаются прямо в валютах, без курсов: донат сравнивается с порогом той
    // же валюты, в которой пришёл. "default" — для валют, которых в списке нет.
    tiers: [
      {
        id: "small",
        name: "Мелкий",
        durationMs: 5000,
        // Вылетает ли на этот тир скример.
        screamer: false,
        sources: { donationAlerts: true, donatello: true },
        minAmounts: { USD: 1, USDT: 1, EUR: 1, UAH: 40, RUB: 100, KZT: 500, BYN: 3, default: 1 },
      },
      {
        id: "medium",
        name: "Средний",
        durationMs: 7000,
        screamer: true,
        sources: { donationAlerts: true, donatello: true },
        minAmounts: { USD: 5, USDT: 5, EUR: 5, UAH: 200, RUB: 450, KZT: 2500, BYN: 15, default: 5 },
      },
      {
        id: "big",
        name: "Крупный",
        durationMs: 9000,
        screamer: true,
        sources: { donationAlerts: true, donatello: true },
        minAmounts: { USD: 20, USDT: 20, EUR: 20, UAH: 800, RUB: 1800, KZT: 10000, BYN: 60, default: 20 },
      },
    ],
  },
  top: {
    // Топ донатеров: складывается по имени, поэтому один и тот же ник на обеих
    // площадках — это один человек.
    title: "Топ донатеров",
    limit: 5,
  },
  screamer: {
    enabled: true,
    // Насколько скример перекрывает игру.
    opacity: 0.75,
    durationMs: 5000,
    // Валюта, в которую DonationAlerts пересчитывает донат сам. Нужна только для
    // валют, порогов для которых в тирах нет.
    baseCurrency: "USD",
  },
};

// Мерж по вложенным объектам. Массивы (тиры алертов) заменяются целиком: иначе
// удалить тир или валюту из панели было бы невозможно.
function merge(defaults, patch) {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && defaults[key] && typeof defaults[key] === "object") {
      out[key] = merge(defaults[key], value);
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
