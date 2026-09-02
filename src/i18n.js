// Перевод сообщений сервера: тостов панели и строк лога.
//
// Ключ — русская строка, как и в панели: код остаётся читаемым, а пропущенный
// перевод не превращается в пустоту на экране, просто останется русским.
// Подстановки помечены фигурными скобками — «донат {amount} {currency} от {name}».
//
// Язык берётся из конфига: на нём же говорят панель и оверлеи в OBS.

const EN = {
  // ------------------------------------------------------------- запуск
  "панель управления: http://localhost:{port}/": "control panel: http://localhost:{port}/",
  "порт занят — закрой другую копию или смени port в {path}":
    "port is busy — close the other copy or change the port in {path}",
  "приложение закрылось — выхожу": "the app is gone — shutting down",
  "настройки и данные перенесены в {dir}: {what}": "settings and data moved to {dir}: {what}",
  "порт сменится после перезапуска": "the port will change after a restart",
  "Панель управления": "Control panel",
  "Данные и настройки": "Data and settings",
  "Источники для OBS (Browser Source):": "Sources for OBS (Browser Source):",
  "розыгрыш": "raffle",
  "цель сбора": "donation goal",
  "топ донатеров": "top donors",
  "последние донаты": "recent donations",
  "сейчас играет": "now playing",
  "опрос в чате": "chat poll",
  "алерты донатов": "donation alerts",
  "скримеры": "screamers",

  // ---------------------------------------------------------- источники
  "подключено: {url}": "connected: {url}",
  "нет связи, переподключаюсь…": "no connection, reconnecting…",
  "подключено": "connected",
  "нет связи": "no connection",
  "выключено": "off",
  "сумма не обновилась: {error}": "the total was not refreshed: {error}",
  "неизвестная тема «{theme}», использую default": "unknown theme {theme}, falling back to default",

  // ---------------------------------------------------------- розыгрыш
  "+ {name} [{service}] (всего: {count})": "+ {name} [{service}] (total: {count})",
  "+ {name} (вручную)": "+ {name} (added by hand)",
  "победитель: {name}": "winner: {name}",
  "отсчёт кончился, победитель: {name}": "countdown over, winner: {name}",
  "отсчёт кончился, но разыгрывать некого": "countdown over, but there is nobody to draw",
  "список очищен": "the list is cleared",
  "таймер на {seconds} с": "timer set to {seconds} s",
  "Все участники уже выигрывали": "Everyone on the list has already won",
  "Список пуст": "The list is empty",
  "Пустое имя или такой участник уже есть": "Empty name, or that entrant is already on the list",
  "Некорректное время": "That is not a valid time",

  // ------------------------------------------------------------ донаты
  "донат {amount} {currency} от {name}": "donation of {amount} {currency} from {name}",
  "анонима": "anonymous",
  "тир не подошёл — ни алерта, ни скримера": "no tier matched — no alert and no screamer",
  "тир «{tier}» ({amount} {currency} ≥ {threshold})": "tier {tier} ({amount} {currency} >= {threshold})",
  "таблица донатеров очищена": "the donor table is cleared",
  "лента последних донатов очищена": "the recent donations feed is cleared",
  "убран донатер: {name}": "donor removed: {name}",
  "+ {name}: {total} (вручную)": "+ {name}: {total} (added by hand)",
  "донат убран из ленты": "a donation was removed from the feed",
  "+ {name}: {amount} {currency} (вручную)": "+ {name}: {amount} {currency} (added by hand)",
  "Суммы обновлены": "Totals refreshed",
  "Настройки сохранены": "Settings saved",
  "Не сохранилось: {error}": "Not saved: {error}",
  "Такого донатера в таблице нет": "There is no such donor in the table",
  "Такого доната в ленте нет": "There is no such donation in the feed",
  "Нужны имя и сумма больше нуля": "A name and an amount above zero are required",
  "Нужна сумма больше нуля": "An amount above zero is required",
  "Добавлено: {name}": "Added: {name}",
  "Добавлено в ленту": "Added to the feed",
  "Неизвестная команда: {type}": "Unknown command: {type}",

  // ---------------------------------------------------------- скримеры
  "проверка: вариация «{variant}»": "test: the {variant} variation",
  "Скримеры выключены — включи их выше": "Screamers are off — switch them on above",

  // ------------------------------------------------------------- опрос
  "голосование: {question}": "poll: {question}",
  "без вопроса": "no question",
  "голосование закрыто, голосов: {total}": "poll closed, votes: {total}",
  "опрос убран с оверлея": "the poll is off the overlay",
  "Нужны вопрос и хотя бы два варианта": "A question and at least two options are required",
  "Голосование и так не идёт": "No poll is running anyway",

  // ------------------------------------------------------ сейчас играет
  "тишина": "silence",
  "медиасессия есть только в Windows — выбери источник «файл»":
    "the media session exists only on Windows — pick the file source",
  "опрос прервался, перезапускаю…": "the poll process stopped, restarting…",
  "опрос не запустился: {error}": "the poll process did not start: {error}",
  "не запустился PowerShell: {error}": "PowerShell did not start: {error}",
  "файл не читается: {error}": "the file cannot be read: {error}",
  "медиасессия недоступна": "the media session is unavailable",
  "обложка не нашлась: {error}": "no cover art found: {error}",
  "проверка: демо-трек на оверлее": "test: a demo track is on the overlay",

  // ---------------------------------------------------------- озвучка
  "озвучено {count} симв.": "voiced {count} chars",
  "не озвучилось: {error}": "not voiced: {error}",
  "Голосов: {count}": "Voices: {count}",
  "Голоса не пришли: {error}": "Voices did not arrive: {error}",
  "остаток лимита недоступен: {error}": "the remaining quota is unavailable: {error}",
  "голоса Windows есть только в Windows": "Windows voices exist only on Windows",
  "озвучка не уложилась во время": "the voice-over ran out of time",
  "голос {voice} не прочитал текст — похоже, нужен голос того же языка":
    "the {voice} voice did not read the text — it probably needs a voice of the same language",
  "по умолчанию": "default",

  "в ответе нет donatedAmount": "the response has no donatedAmount",
  "не разобрал сумму «{raw}»": "could not parse the amount {raw}",
  "/info ответил {status}": "/info replied {status}",
  "страница виджета ответила {status}": "the widget page replied {status}",
  "на странице виджета нет {what}": "the widget page has no {what}",
  "в ответе нет raised_amount": "the response has no raised_amount",
  "в ссылке на виджет нет id цели (/widget/goal/<id>)": "the widget link has no goal id (/widget/goal/<id>)",
  "api цели ответило {status}": "the goal API replied {status}",
  "subscribe вернул {body}": "subscribe returned {body}",
  "токен centrifugo не похож на JWT": "the centrifugo token does not look like a JWT",

  // ------------------------------------------------------------- медиа
  "не тот тип файла": "wrong file type",
  "файл слишком большой": "the file is too large",
  "так нельзя": "not allowed",
  "Папка открыта": "Folder opened",
};

let lang = "ru";

/** Язык сообщений сервера. Меняется вместе с настройкой в панели. */
export function setLang(next) {
  lang = next === "en" ? "en" : "ru";
}

export function currentLang() {
  return lang;
}

/** Перевод с подстановкой: t("донат {amount} от {name}", { amount, name }). */
export function t(text, params) {
  const key = String(text ?? "");
  const translated = lang === "en" ? EN[key] ?? key : key;
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}
