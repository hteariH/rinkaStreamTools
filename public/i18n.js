/*
 * Перевод интерфейса: панель и оверлеи.
 *
 * Ключ словаря — сама русская строка, а не выдуманный код. Так разметка и код
 * остаются читаемыми (в панели написано то, что видно на экране), а пропущенный
 * перевод не ломает страницу: строка просто останется русской, и это сразу
 * заметно. Выдуманные ключи вроде panel.alerts.title дали бы обратное — пустое
 * место на экране и поиск по словарю ради того, чтобы понять, что там за надпись.
 *
 * Русский язык — исходный, поэтому словарь один: русский → английский.
 */

const EN = {
  // ------------------------------------------------------------ общее
  "панель управления": "control panel",
  "Розыгрыш": "Raffle",
  "Донаты": "Donations",
  "Опрос": "Poll",
  "Музыка": "Music",
  "Источники для OBS": "OBS sources",
  "Лог": "Log",
  "нет связи": "offline",
  "Язык": "Language",

  // ---------------------------------------------------------- розыгрыш
  "участников": "entrants",
  "ещё могут выпасть": "still eligible",
  "Победитель": "Winner",
  "Разыграть": "Draw",
  "Сбросить": "Reset",
  "Команда в чате": "Chat command",
  "Тема оверлея": "Overlay theme",
  "default — тёмная панель, золото": "default — dark panel, gold",
  "grimoire — обугленный гримуар": "grimoire — charred grimoire",
  "rune — морозная руна": "rune — frost rune",
  "blood — кровавый пакт": "blood — blood pact",
  "glitch — system failure": "glitch — system failure",
  "AxelChat (WebSocket)": "AxelChat (WebSocket)",
  "Таймер до конца": "Countdown",
  "выключен": "off",
  "Пуск": "Start",
  "Пауза": "Pause",
  "Продолжить": "Resume",
  "Убрать": "Clear",
  "Сразу опубликовать победителя": "Draw the winner automatically",
  "Как только отсчёт дойдёт до нуля, победитель разыграется сам и появится на оверлее — не надо ловить момент и жать «Разыграть» в эфире.":
    "When the countdown hits zero the winner is drawn and shown on the overlay — no need to catch the moment and hit Draw live on air.",
  "Участники": "Entrants",
  "Добавить": "Add",
  "добавить вручную": "add manually",
  "!хил": "!heal",

  // -------------------------------------------------------------- цель
  "Общая цель": "Donation goal",
  "Обновить суммы": "Refresh totals",
  "Подпись на оверлее": "Overlay caption",
  "Цель": "Target",
  "Валюта": "Currency",
  "Добавка вручную": "Manual offset",
  "Опрос, сек": "Polling, sec",
  "Тема оверлея цели": "Goal overlay theme",
  "default — панель и золотая полоса": "default — panel with a gold bar",
  "slim — тонкая полоска без панели": "slim — thin bar, no panel",
  "neon — циан по обсидиану": "neon — cyan on obsidian",
  "hud — циановая капсула, подпись внутри полосы": "hud — cyan capsule, caption inside the bar",
  "например: На RTX 5070": "for example: New GPU fund",
  "выключено": "off",
  "Вручную": "Manual",

  // --------------------------------------------------------- площадки
  "Площадки": "Donation platforms",
  "Ссылка на виджет цели": "Goal widget link",
  "Множитель к валюте цели": "Rate to the goal currency",
  "Ссылка на виджет": "Widget link",
  "Обе площадки читаются через страницу виджета — ту же ссылку, что вставляется в OBS. Логин и пароль не нужны и нигде не хранятся.":
    "Both platforms are read through their widget page — the same link you paste into OBS. No login or password is needed, and none is stored anywhere.",

  // -------------------------------------------------------------- топ
  "Топ донатеров": "Top donors",
  "Сколько мест": "How many places",
  "slim — только текст, без панели": "slim — text only, no panel",
  "hud — циановая капсула": "hud — cyan capsule",
  "hud — капсула": "hud — capsule",
  "Очистить таблицу": "Clear the table",
  "имя донатера": "donor name",
  "сумма": "amount",
  "Крестик убирает донатера из таблицы — например с ником, которому не место в кадре. Добавленная вручную сумма считается уже в валюте цели: множители площадок к ней не применяются, площадки тут не участвовали. Саму цель это не двигает — для неё есть «добавка вручную» выше.":
    "The cross removes a donor from the table — say, one whose nickname has no place on screen. A manually added amount is already in the goal currency: platform rates are not applied, since no platform was involved. It does not move the goal itself — the manual offset above does that.",
  "Донаты с обеих площадок складываются по имени: один и тот же ник на DonationAlerts и на Donatello считается одним человеком. Общего id у зрителя между площадками нет, так что имя — единственное, за что можно зацепиться; два разных человека с одинаковым ником сложатся в одного. Суммы приводятся к валюте цели теми же множителями, что и сама цель. Анонимные донаты в список не идут — приписывать их некому.":
    "Donations from both platforms are merged by name: the same nickname on DonationAlerts and on Donatello counts as one person. Viewers have no shared id across platforms, so the name is the only thing to go by; two different people with the same nickname will merge into one. Amounts are converted to the goal currency with the same rates as the goal. Anonymous donations are left out — there is nobody to credit.",

  // ------------------------------------------------------------ лента
  "Последние донаты": "Recent donations",
  "Добавить в ленту": "Add to the feed",
  "Донатов в строке": "Donations in the ticker",
  "Скорость строки, пикс/сек": "Ticker speed, px/sec",
  "Очистить ленту": "Clear the feed",
  "имя (пусто — аноним)": "name (empty — anonymous)",
  "валюта": "currency",
  "сообщение, если было": "message, if any",
  "Аноним": "Anonymous",
  "Крестик убирает донат из ленты. Лента и топ — разные списки: добавленное сюда не попадёт в таблицу донатеров, и наоборот.":
    "The cross removes a donation from the feed. The feed and the top are separate lists: what you add here will not appear in the donor table, and the other way round.",
  "На оверлее это": "On the overlay it is a",
  "бегущая строка": "scrolling ticker",
  ": только «имя — сумма», ничего больше. Сообщения зрителей видно здесь, в эфир они не уходят вовсе — на едущей полосе их всё равно не прочитать. «Донатов в строке» — сколько последних едет по кругу; здесь список всегда полный, до полусотни.":
    ": name and amount, nothing else. Viewer messages are visible here and never go on air — nobody could read them off a moving line anyway. The ticker shows the latest few on a loop; this list is always complete, up to fifty.",
  "Тут не сумма за всё время, а сами донаты — по одному, свежие сверху. Суммы показываются в той валюте, в которой пришли: множители площадок нужны, чтобы складывать, а здесь складывать нечего. Анонимные донаты в ленте остаются — событие было, даже если приписать его некому.":
    "This is not an all-time total but the donations themselves, one by one, newest first. Amounts stay in the currency they arrived in: rates exist for adding things up, and there is nothing to add up here. Anonymous donations stay in the feed — the event happened even if there is nobody to credit.",

  // ----------------------------------------------------------- цвета
  "Цвета": "Colors",
  "Цвет ника": "Nickname color",
  "Цвет суммы": "Amount color",
  "как в теме": "theme default",
  "Ник и сумма — одни и те же две роли на алертах, в топе и в ленте, поэтому цвет у них общий. Пока цвет не задан, его берёт на себя тема оверлея.":
    "The nickname and the amount are the same two roles on alerts, in the top and in the feed, so the color is shared. Until you set one, the overlay theme decides.",
  "Свечение и рамки остаются от темы: цвет меняет только сам текст. Проверить вживую — кнопкой «Прогнать донат» ниже.":
    "Glow and borders still come from the theme: the color changes the text only. Try it live with the test donation button below.",

  // ----------------------------------------------------- медиа алертов
  "Файлы для алертов": "Alert files",
  "Добавить гифку": "Add a GIF",
  "Добавить звук": "Add a sound",
  "Гифки": "GIFs",
  "Звуки": "Sounds",
  "пусто": "empty",
  "добавить…": "add…",
  "все уже выбраны": "all of them are picked",
  "файлов нет": "no files",
  "Гифки и звуки, из которых собираются алерты. Файлы лежат в папке":
    "GIFs and sounds the alerts are built from. The files live in the folder",
  "рядом с конфигом — их видно из проводника, и обновление программы их не затирает. Что показывать и что играть на каждом тире, выбирается ниже, у самих тиров.":
    "next to the config — you can see them in Explorer, and updating the program does not overwrite them. What each tier shows and plays is picked below, on the tiers themselves.",

  // ----------------------------------------------------------- алерты
  "Алерты донатов": "Donation alerts",
  "Показывать алерты": "Show alerts",
  "Громкость звуков:": "Sound volume:",
  "Скример": "Screamer",
  "Читать сообщение": "Read the message",
  "Тема": "Theme",
  "сек": "sec",
  "код": "code",
  "убрать": "remove",
  "Добавить валюту": "Add a currency",
  "Донат попадает в самый крупный тир, чей порог он перекрывает. Тир, выключенный для площадки, в расчёт не идёт вовсе — донат с неё уйдёт в тир пониже, который для этой площадки включён, или не покажется совсем. Пороги сравниваются с суммой в той же валюте — курсы не применяются;":
    "A donation lands in the largest tier whose threshold it clears. A tier switched off for a platform is skipped entirely — a donation from it drops to a lower tier that is enabled, or is not shown at all. Thresholds are compared in the same currency; no exchange rates are applied;",
  "— для валют, которых нет в списке.": "— for currencies not in the list.",

  // ---------------------------------------------------------- озвучка
  "Озвучка сообщений": "Message voice-over",
  "Читать сообщения вслух": "Read messages aloud",
  "Чем читать": "Voice engine",
  "голос Windows — бесплатно, офлайн, звучит роботом": "Windows voice — free, offline, robotic",
  "ElevenLabs — живой голос, по твоему ключу": "ElevenLabs — lifelike voice, with your own key",
  "Обновить голоса": "Refresh voices",
  "Голос": "Voice",
  "голос по умолчанию": "default voice",
  "Скорость речи:": "Speech rate:",
  "Ключ API": "API key",
  "Модель": "Model",
  "Flash v2.5 — вдвое дешевле, быстрее": "Flash v2.5 — half the cost, faster",
  "Multilingual v2 — качественнее": "Multilingual v2 — better quality",
  "Длина сообщения, символов": "Message length, characters",
  "Имя донатера": "Donor name",
  "читать перед сообщением": "read before the message",
  "ключ из личного кабинета ElevenLabs": "key from your ElevenLabs dashboard",
  "id голоса — или выбери из списка аккаунта": "voice id — or pick one from your account",
  "Какие тиры читать — отмечается у самих тиров («Читать сообщение»). Здесь только чем читать.":
    "Which tiers to read is set on the tiers themselves (Read the message). This is only about what does the reading.",
  "У ключа должны быть права на голоса, синтез и профиль — иначе ElevenLabs откажет, и это не то же самое, что неверный ключ. Бесплатный план у них некоммерческий, требует упоминания":
    "The key needs permissions for voices, synthesis and the profile — otherwise ElevenLabs refuses, and that is not the same as a wrong key. Their free plan is non-commercial, requires crediting",
  "в заголовке опубликованного и не даёт брать голоса из библиотеки через API: для стрима с донатами нужен платный, от $6 в месяц. Ключ лежит в":
    "in the title of anything you publish, and does not allow library voices through the API: a stream that takes donations needs a paid plan, from $6 a month. The key is stored in",
  "открытым текстом, как и ссылки на виджеты площадок.":
    "in plain text, just like the donation widget links.",
  "Ссылки из сообщения выкидываются, длина режется: у облака это прямые деньги, у офлайнового голоса — минута чтения вслух.":
    "Links are stripped from the message and the length is capped: with the cloud engine that is real money, with the offline voice it is a minute of reading aloud.",

  // --------------------------------------------------------- скримеры
  "Скримеры": "Screamers",
  "Включить скримеры": "Enable screamers",
  "Длительность, сек": "Duration, sec",
  "Базовая валюта": "Base currency",
  "Перекрытие игры:": "Game coverage:",
  "Какие тиры вызывают скример — отмечается у самих тиров слева. Здесь только то, как он выглядит.":
    "Which tiers trigger a screamer is set on the tiers on the left. This is only about how it looks.",
  "Базовая валюта нужна для донатов в валюте, порога для которой в тирах нет: DonationAlerts присылает пересчитанную сумму, с ней и сверяемся.":
    "The base currency is for donations in a currency with no threshold in the tiers: DonationAlerts sends a converted amount, and that is what gets compared.",

  // --------------------------------------------------------- проверка
  "Проверка": "Test",
  "Сумма": "Amount",
  "Имя": "Name",
  "Сообщение": "Message",
  "Вариация скримера": "Screamer variation",
  "по тиру — как на эфире": "by tier — exactly as on air",
  "сердечко — проверка, которая не пугает": "heart — a check that does not scare anyone",
  "lunge — бросок на камеру": "lunge — lunge at the camera",
  "flash — подсечка": "flash — quick cut",
  "strobe — строб": "strobe — strobe",
  "flashlight — фонарь": "flashlight — flashlight",
  "blood — кровь на объективе": "blood — blood on the lens",
  "vhs — помехи": "vhs — tape noise",
  "creep — подкрадывается": "creep — creeping closer",
  "Прогнать донат": "Run a test donation",
  "Тестовый зритель": "Test viewer",
  "проверка связи": "checking the setup",
  "сердечко": "heart",
  "С вариацией «по тиру» донат идёт по всей цепочке: алерт и скример увидишь так же, как на эфире. Выбранная вручную вариация показывается сама по себе, мимо тиров и порогов — в том числе":
    "With the tier variation the donation goes through the whole chain: you see the alert and the screamer exactly as on air. A hand-picked variation is shown on its own, past tiers and thresholds — including the",
  ", которым проверяют, что оверлей жив и стоит где надо, не вздрагивая при этом. Общая сумма от теста не растёт.":
    ", which tells you the overlay is alive and in the right place without making you flinch. A test does not change the total.",

  // ------------------------------------------------------------ опрос
  "Опрос в чате": "Chat poll",
  "Вопрос": "Question",
  "Варианты — по одному в строке, не больше девяти": "Options — one per line, nine at most",
  "Сколько секунд, 0 — без отсчёта": "Seconds, 0 — no countdown",
  "Команда перед номером": "Command before the number",
  "Запустить": "Start",
  "Закрыть": "Close",
  "Убрать с экрана": "Hide from the overlay",
  "Как идёт голосование": "How the vote is going",
  "Идёт голосование": "Voting is open",
  "Голосование закрыто": "Voting is closed",
  "голосование закрыто": "voting is closed",
  "Разрешить менять голос": "Allow changing the vote",
  "Показывать проценты": "Show percentages",
  "без вопроса": "no question",
  "пусто — голосуют цифрой": "empty — a bare digit is a vote",
  "Во что играем после перерыва?": "What do we play after the break?",
  "Doom&#10;Factorio&#10;Ещё один разговорный": "Doom&#10;Factorio&#10;Another just-chatting hour",
  "Зрители голосуют номером варианта в том же чате, который уже читается для розыгрыша. Один зритель — один голос.":
    "Viewers vote with the option number in the same chat that is already read for the raffle. One viewer, one vote.",
  "«Закрыть» останавливает приём голосов, но итоги остаются на оверлее — их обычно обсуждают уже после отсчёта. «Убрать с экрана» прячет опрос совсем.":
    "Close stops accepting votes but leaves the result on the overlay — it usually gets discussed after the countdown. Hide removes the poll entirely.",
  "Пока голосование открыто, зритель может переголосовать: промахнулся мимо цифры — исправится. Выключено — засчитывается первый голос.":
    "While voting is open a viewer can change their mind: miss the digit, fix it. Switched off, the first vote is the one that counts.",
  "Голосов пока нет — напиши номер варианта в чат": "No votes yet — type an option number in chat",
  "Голосов: {n}": "Votes: {n}",
  "{n} с": "{n} s",
  "нет связи с сервером…": "no connection to the server…",
  "Подключение...": "Connecting...",
  "Пиши": "Type",
  "в чат": "in chat",
  "🎉 Победитель": "🎉 Winner",
  "✦ Избранник ✦": "✦ The Chosen ✦",
  "◆ Избран ◆": "◆ Chosen ◆",
  "✦ Жертва избрана ✦": "✦ The Offering Is Chosen ✦",
  "▸ SUBJECT SELECTED ◂": "▸ SUBJECT SELECTED ◂",
  "Подключено": "Connected",
  "Переподключение...": "Reconnecting...",
  "Демонстрация": "Demo",

  // ---------------------------------------------------- сейчас играет
  "Сейчас играет": "Now playing",
  "Показывать трек на оверлее": "Show the track on the overlay",
  "Играет": "Playing",
  "На паузе": "Paused",
  "Откуда брать трек": "Where the track comes from",
  "медиасессия Windows — Spotify, браузер, AIMP": "Windows media session — Spotify, browser, AIMP",
  "текстовый файл, который пишет плеер": "a text file written by the player",
  "Фильтр приложения": "App filter",
  "Файл с треком": "Track file",
  "Показать демо-трек": "Show a demo track",
  "Как выглядит": "Appearance",
  "Показывать обложку": "Show cover art",
  "Прятать на паузе": "Hide when paused",
  "например Spotify — пусто значит любое": "for example Spotify — empty means any",
  "Медиасессия — то же самое, откуда всплывашка громкости знает, что у тебя играет: плеер уже рассказал системе название, и настраивать в нём ничего не надо. Файл нужен, только если плеер в медиасессию не отдаётся — foobar2000, AIMP и Snip умеют писать текущий трек в файл сами.":
    "The media session is the same source the volume popup uses to know what is playing: the player has already told the system the title, and there is nothing to set up in it. The file is only needed if your player does not report to the media session — foobar2000, AIMP and Snip can write the current track to a file themselves.",
  "Формат — какой пишет плеер: одна строка «Исполнитель — Название» или две, где первая название, а вторая исполнитель. Пустой файл значит тишину.":
    "The format is whatever the player writes: one line of Artist — Title, or two lines where the first is the title and the second the artist. An empty file means silence.",
  "Демо-трек нужен, чтобы поставить оверлей на место в OBS, не дожидаясь смены песни. Он висит, пока не сменится настоящий трек.":
    "The demo track is for placing the overlay in OBS without waiting for the song to change. It stays until a real track replaces it.",
  "Свою обложку Spotify наружу не отдаёт, поэтому она ищется по исполнителю, названию и альбому в открытых каталогах (iTunes, затем Deezer) — без ключей и регистрации. Обычно это та же картинка, что в плеере, но у концертников и ремиксов каталог иногда отдаёт другое издание. Наружу уходит только название трека: ни донатов, ни зрителей в этих запросах нет. Не нашлась — оверлей покажет трек без картинки.":
    "Spotify does not hand out its own cover art, so it is looked up by artist, title and album in open catalogs (iTunes, then Deezer) — no keys, no sign-up. Usually it is the same image you see in the player, though for live albums and remixes the catalog sometimes returns a different edition. Only the track name leaves your machine: no donations and no viewers are in those requests. Nothing found — the overlay shows the track without a picture.",
  "Скорость нужна длинным названиям: если название не влезает в источник, оно едет строкой, а короткое просто стоит на месте.":
    "The speed matters for long titles: a title that does not fit the source scrolls, a short one just sits still.",

  // ------------------------------------------------------------- OBS
  "Browser Source в OBS": "Browser Source in OBS",
  "Добавь в OBS источник": "Add a",
  "и вставь адрес. Фон у всех оверлеев прозрачный. Скример и алерты лучше растянуть на весь холст, розыгрыш и цель — поставить в угол.":
    "source in OBS and paste the address. Every overlay has a transparent background. Screamers and alerts are best stretched over the whole canvas; the raffle and the goal go in a corner.",
  "Копировать": "Copy",
  "Открыть": "Open",
  "Цель сбора": "Donation goal",
  "Данные и обновление": "Data and updates",
  "Открыть папку": "Open the folder",
  "Настройки, таблица донатеров, лента и гифки лежат": "Settings, the donor table, the feed and the GIFs live",
  "не в папке программы": "outside the program folder",
  ", а в профиле пользователя. Поэтому обновление ничего не теряет: распаковал новый архив куда угодно, запустил — всё на месте.":
    ", in your user profile. That way an update loses nothing: unpack the new archive anywhere, start it, and everything is still there.",
  "Чтобы носить программу с собой (например на флешке), положи рядом с": "To carry the program around (on a flash drive, say), put an empty",
  "пустую папку": "folder next to",
  "— тогда всё будет храниться в ней, а не в профиле.": "— everything will then be stored there instead of the profile.",
  "Скримеры на своём экране": "Screamers on your own screen",
  "Browser Source в OBS видят только зрители — сам стример остаётся единственным, кто скример не увидит. Поэтому в приложении есть второе, прозрачное окно поверх игры: клики проходят насквозь, включается и выключается галочкой в трее. Игра при этом должна идти в оконном или безрамочном режиме: эксклюзивный полноэкранный перекрывает вообще всё, это ограничение Windows.":
    "A Browser Source in OBS is seen by viewers only — the streamer ends up being the one person who never sees the screamer. So the app has a second, transparent window over the game: clicks pass through it, and it is toggled from the tray. The game has to run windowed or borderless: exclusive fullscreen covers everything, and that is a Windows limitation.",

  // ----------------------------------------------- строки из скриптов
  "Пока пусто": "Nothing yet",
  "Пока никого — донаты появятся здесь по мере эфира.": "Nobody yet — donors will show up as the stream goes on.",
  "Пока пусто — донаты появятся здесь по мере эфира.": "Nothing yet — donations will show up as the stream goes on.",
  "Адрес скопирован": "Address copied",
  "Буфер обмена недоступен — скопируй вручную": "The clipboard is unavailable — copy it by hand",
  "Тестовый донат отправлен": "Test donation sent",
  "Демо-трек на оверлее": "Demo track is on the overlay",
  "Спрашиваю ElevenLabs…": "Asking ElevenLabs…",
  "Нужны имя и сумма больше нуля": "A name and an amount above zero are required",
  "Нужна сумма больше нуля": "An amount above zero is required",
  "Нужны код валюты и сумма": "A currency code and an amount are required",
  "Добавлено: {name}": "Added: {name}",
  "Убрать «{name}» из папки media?": "Remove {name} from the media folder?",
  "Убрать «{name}» из таблицы донатеров?": "Remove {name} from the donor table?",
  "пауза": "paused",
  "Нужно хотя бы два варианта, по одному в строке": "At least two options are needed, one per line",
  "Файл убран": "File removed",
  "не загрузилось": "upload failed",
  "не удалилось": "delete failed",
  "гифка": "GIF",
  "звук": "sound",
  "Не понял время. Примеры: 90, 5m, 2m30s, 1:30": "Could not read the time. Examples: 90, 5m, 2m30s, 1:30",
  "Очистить список участников и историю выпавших?": "Clear the entrant list and the history of past winners?",
  "Очистить таблицу донатеров? Суммы за эфир пропадут.": "Clear the donor table? The totals for this stream will be gone.",
  "Очистить ленту последних донатов?": "Clear the recent donations feed?",
  "Ключ не задан — облачной озвучки не будет.": "No key — cloud voice-over will not work.",
  "Ключ сохранён на сервере (в поле он не показывается). Остаток лимита пока неизвестен — нажми «Обновить голоса».":
    "The key is saved on the server (the field never shows it). The remaining quota is unknown — press Refresh voices.",
  "Нажми «Обновить голоса» — список придёт из Windows.": "Press Refresh voices — the list comes from Windows.",
  "Русский голос найден — сообщения будут читаться.": "A matching voice was found — messages will be read.",
  "Опроса на экране нет. Набери вопрос с вариантами и жми «Запустить».":
    "No poll on screen. Type a question with options and press Start.",
  "Отсчёта нет — закрывать вручную.": "No countdown — close it by hand.",
  "Пока не видно ни одного плеера — включи музыку, и приложения появятся здесь.":
    "No player is visible yet — start some music and the apps will show up here.",
  "Сейчас видно: {apps}": "Visible now: {apps}",
  "Трек": "Track",
  "Б": "B",
  "КБ": "KB",
  "МБ": "MB",
  "ник": "nickname",
  "свой цвет": "custom color",
  "Сейчас: {name}, {amount}.": "Now: {name}, {amount}.",
  "На оверлее видно {shown} из {all}; здесь список целиком.":
    "The overlay shows {shown} of {all}; this list is complete.",
  "Анонимных донатов: {count} на {sum} {currency}.":
    "Anonymous donations: {count} totalling {sum} {currency}.",
  "План {plan}: потрачено {used} из {limit} символов, осталось {left}.":
    "Plan {plan}: {used} of {limit} characters used, {left} left.",
  "Лимит обновится {date}.": "The quota resets on {date}.",
  "Это примерно {count} сообщений по 120 символов.": "That is roughly {count} messages of 120 characters.",
  "Голосов: {total}. {left}": "Votes: {total}. {left}",
  "Осталось {seconds} с.": "{seconds} s left.",
  "Итог: {total} голосов.": "Final: {total} votes.",
  "Русских голосов в списке нет: такой голос прочитает русское сообщение молча. Поставить: Параметры → Время и язык → Речь → Добавить голоса → Русский. Появиться в этом списке должен голос с пометкой ru-RU.":
    "No voice for your language is installed: a voice of another language reads the message silently. Install one in Windows: Settings → Time & language → Speech → Manage voices → Add voices. The new voice has to show up in this list.",
};

// Что показать вместо {название} в строках с подстановкой.
function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key) => (key in params ? String(params[key]) : whole));
}

// Исходный русский текст узлов — чтобы вернуть его при переключении обратно.
const originals = new WeakMap();

const i18n = {
  lang: "ru",

  /** Перевод строки. Нет в словаре — остаётся русской, и это сразу видно. */
  t(text, params) {
    const key = String(text ?? "");
    const translated = this.lang === "en" ? EN[key] ?? key : key;
    return fill(translated, params);
  },

  /** Сменить язык и перерисовать разметку. */
  setLang(next) {
    const lang = next === "en" ? "en" : "ru";
    if (lang === this.lang) return false;
    this.lang = lang;
    this.translateDom(document);
    document.documentElement.lang = lang;
    return true;
  },

  /**
   * Пройти по разметке и перевести надписи, подсказки полей и подписи кнопок.
   *
   * Работает в обе стороны: исходный русский текст узла запоминается при первом
   * переводе, и возврат на русский берётся оттуда, а не обратным поиском по
   * словарю — обратный поиск сломался бы на одинаковых переводах.
   */
  translateDom(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentNode?.nodeName;
        if (parent === "SCRIPT" || parent === "STYLE") return NodeFilter.FILTER_REJECT;
        // translate="no" — стандартная пометка «это не переводить»: названия
        // самих языков пишутся на них же.
        if (node.parentElement?.closest('[translate="no"]')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);

    for (const node of nodes) {
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      const source = originals.get(node);
      // Пробелы вокруг сохраняем: в разметке они держат отступы между словами.
      const spaceBefore = source.match(/^\s*/)[0];
      const spaceAfter = source.match(/\s*$/)[0];
      node.nodeValue = spaceBefore + this.t(source.trim()) + spaceAfter;
    }

    for (const element of root.querySelectorAll("[placeholder], [title]")) {
      for (const attribute of ["placeholder", "title"]) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const stored = `i18n${attribute}`;
        if (!element.dataset[stored]) element.dataset[stored] = value;
        element.setAttribute(attribute, this.t(element.dataset[stored]));
      }
    }
  },
};

window.i18n = i18n;
window.t = (text, params) => i18n.t(text, params);
