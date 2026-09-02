// Конфиг живёт в одном файле рядом с исполняемым (config.json) и правится из
// веб-панели, а не руками. Поэтому запись идёт «мержем поверх текущего файла»:
// пользователь мог что-то дописать сам, и терять это при сохранении нельзя.

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

export const DEFAULTS = {
  port: 3777,
  // Язык панели, оверлеев и сообщений сервера: "ru" или "en". Живёт в конфиге, а
  // не в браузере, потому что на нём же говорят оверлеи в OBS и лог на сервере.
  language: "ru",
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
  poll: {
    // Опрос в чате: зрители голосуют номером варианта в том же чате, который уже
    // читается ради розыгрыша.
    //
    // Команда перед номером нужна, если в чате и без опроса летают числа. Пусто —
    // голосом считается сообщение из одной цифры и ничего больше.
    command: "",
    // Можно ли передумать, пока голосование открыто.
    allowChange: true,
    // Сколько секунд идёт голосование по умолчанию. 0 — без отсчёта, закрывает
    // стример руками.
    seconds: 60,
    title: "Опрос",
    showPercent: true,
    theme: "default",
  },
  // Цвета ника и суммы — одни на алерты, топ и ленту: это одни и те же две роли,
  // и разъезжаться по оверлеям им незачем. Пусто — цвет берётся из темы.
  colors: {
    name: "",
    amount: "",
  },
  alerts: {
    enabled: true,
    // Громкость звуков алертов: 0 — тихо, 1 — как записано в файле.
    volume: 0.8,
    // Тиры: во что попадает донат по сумме. Каждый включается отдельно для каждой
    // площадки — например мелкие донаты с Donatello показывать, а с DonationAlerts
    // нет, если там свои алерты уже настроены.
    //
    // Пороги задаются прямо в валютах, без курсов: донат сравнивается с порогом той
    // же валюты, в которой пришёл. "default" — для валют, которых в списке нет.
    tiers: [
      {
        id: "small",
        speak: false,
        name: "Мелкий",
        durationMs: 5000,
        // Вид карточки алерта — как темы у остальных оверлеев.
        theme: "default",
        // Гифки и звуки из папки media/ рядом с конфигом. Их может быть
        // несколько: на каждый донат берётся случайный, чтобы за эфир не
        // приелось. Пусто — алерт без картинки и со звуком по умолчанию.
        images: [],
        sounds: [],
        // Вылетает ли на этот тир скример.
        screamer: false,
        sources: { donationAlerts: true, donatello: true },
        minAmounts: { USD: 1, USDT: 1, EUR: 1, UAH: 40, RUB: 100, KZT: 500, BYN: 3, default: 1 },
      },
      {
        id: "medium",
        speak: false,
        name: "Средний",
        durationMs: 7000,
        theme: "default",
        images: [],
        sounds: [],
        screamer: true,
        sources: { donationAlerts: true, donatello: true },
        minAmounts: { USD: 5, USDT: 5, EUR: 5, UAH: 200, RUB: 450, KZT: 2500, BYN: 15, default: 5 },
      },
      {
        id: "big",
        speak: false,
        name: "Крупный",
        durationMs: 9000,
        theme: "default",
        images: [],
        sounds: [],
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
    theme: "default",
  },
  recent: {
    // Последние донаты. На оверлее это бегущая строка «имя — сумма» и ничего
    // больше: полоса идёт под игрой, читать её успевают на ходу. Сообщения
    // зрителей остаются в панели, в эфир они не уходят.
    title: "Последние донаты",
    limit: 5,
    // Скорость бегущей строки, пикселей в секунду.
    speed: 60,
    theme: "default",
  },
  tts: {
    // Озвучка сообщений донатеров. Читаются только те тиры, у которых отмечено
    // «Читать сообщение»: у облачного движка счёт посимвольный, и тратить его на
    // донат в доллар обычно не хочется.
    enabled: false,
    // "windows" — голоса Windows: бесплатно, офлайн, звучит роботом.
    // "elevenlabs" — облако по ключу стримера: звучит живо, но упирается в лимиты
    // и в план (бесплатный у них некоммерческий).
    engine: "windows",
    // Читать ли имя донатера перед сообщением.
    readName: true,
    // Потолок на сообщение: у облака это прямые деньги, у офлайна — минута чтения.
    maxChars: 200,
    windows: {
      // Имя голоса, как его показывает система. Пусто — голос по умолчанию.
      voice: "",
      // Скорость речи, от -10 до 10.
      rate: 0,
    },
    elevenlabs: {
      // Ключ лежит в этом файле открытым текстом — как и ссылки на виджеты площадок.
      apiKey: "",
      voiceId: "",
      modelId: "eleven_flash_v2_5",
    },
  },
  nowplaying: {
    // Что сейчас играет. Источник — медиасессия Windows: та самая, из которой
    // всплывашка громкости знает про Spotify, браузер и AIMP. Настраивать в самом
    // плеере ничего не надо, он уже всё рассказал системе.
    enabled: false,
    // "system" — медиасессия Windows, "file" — текстовый файл, который пишет плеер
    // (foobar2000, AIMP, Snip).
    source: "system",
    filePath: "",
    // Подстрока в id приложения: у стримера в браузере может играть ролик, а в
    // эфир нужен только плеер. Пусто — что система считает текущим.
    appFilter: "",
    // Прятать оверлей, когда музыку поставили на паузу.
    hideWhenPaused: true,
    // Обложку Spotify наружу не отдаёт, поэтому она ищется по исполнителю,
    // названию и альбому в открытых каталогах (iTunes, Deezer) — без ключей и
    // регистрации. Выключается одной галочкой, если наружу ходить не хочется.
    cover: true,
    title: "Сейчас играет",
    // Скорость бегущей строки для длинных названий, пикселей в секунду.
    speed: 40,
    pollIntervalMs: 1500,
    theme: "default",
  },
  screamer: {
    // Выключены на новом конфиге: скример — вещь, которую включают осознанно, а не
    // обнаруживают в эфире. У тех, кто их уже включил, настройка своя и остаётся.
    enabled: false,
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

/**
 * Раньше тема была одна на три оверлея и лежала в goal.theme. Теперь у цели, топа
 * и ленты она своя, и тем, кто уже настроил тему цели, её надо перенести на все
 * три: молча вернуть топ и ленту к default значит сломать собранную сцену OBS у
 * человека, который ничего не просил менять.
 *
 * Разбирается это по исходному файлу, а не по слитому с умолчаниями конфигу: в
 * слитом theme есть всегда, и «не задано» от «задано default» уже не отличить.
 */
function inheritGoalTheme(raw, config) {
  for (const key of ["top", "recent"]) {
    if (raw?.[key]?.theme === undefined && raw?.goal?.theme) {
      // Именно новый объект, а не правка на месте: merge отдаёт нетронутые ветки
      // умолчаний по ссылке, и запись в config.top.theme испортила бы сам DEFAULTS
      // на весь процесс — следующий разбор конфига получил бы чужую тему.
      config[key] = { ...config[key], theme: raw.goal.theme };
    }
  }
  return config;
}

/**
 * Настройки озвучки сначала лежали одной плоской кучей: ключ и голос прямо в tts.
 * Движков стало два, у каждого свои поля — переносим старое в ветку ElevenLabs,
 * чтобы у того, кто уже вписал ключ, он не пропал при обновлении.
 */
function moveTtsToEngine(raw, config) {
  const old = raw?.tts;
  if (!old || old.apiKey === undefined) return config;

  config.tts = {
    ...config.tts,
    // Ключ был вписан — значит пользовались облаком.
    engine: raw.tts.engine === "windows" ? "windows" : "elevenlabs",
    elevenlabs: {
      ...config.tts.elevenlabs,
      apiKey: old.apiKey ?? "",
      voiceId: old.voiceId ?? "",
      modelId: old.modelId || config.tts.elevenlabs.modelId,
    },
  };
  return config;
}

/** Конфиг из разобранного файла: умолчания плюс переносы со старых версий. */
export function applyDefaults(raw) {
  return moveTtsToEngine(raw, inheritGoalTheme(raw, merge(DEFAULTS, raw)));
}

export async function loadConfig() {
  try {
    return applyDefaults(JSON.parse(await readFile(CONFIG_PATH, "utf8")));
  } catch {
    return merge(DEFAULTS, {});
  }
}

export async function saveConfig(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}
