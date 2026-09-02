/*
 * Панель управления. Держит один сокет /ws/control: сервер шлёт полное состояние
 * при каждом изменении, панель — команды и патчи конфига.
 *
 * Состояние всегда приезжает целиком, поэтому поля перерисовываются на каждом
 * сообщении. Единственное исключение — поле, в котором сейчас курсор: затирать
 * недопечатанное сервером нельзя.
 */

const el = (id) => document.getElementById(id);
const send = (message) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
};

let ws = null;
let state = null;
let timerTick = null;

/* --------------------------------------------------------------------- табы */

el("tabs").addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  for (const node of document.querySelectorAll(".tab")) node.classList.toggle("is-active", node === tab);
  for (const page of document.querySelectorAll(".page")) {
    page.classList.toggle("is-active", page.dataset.page === tab.dataset.tab);
  }
});

/* -------------------------------------------------------------------- тосты */

let toastTimer = null;
function toast(text, level = "info") {
  const node = el("toast");
  node.textContent = text;
  node.dataset.level = level;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

/* ------------------------------------------------------------------ конфиг */

// Правки летят на сервер с задержкой: иначе каждое нажатие в текстовом поле
// перезаписывало бы config.json.
let saveTimer = null;
let pendingPatch = {};

function patchConfig(patch, immediate = false) {
  pendingPatch = mergeDeep(pendingPatch, patch);
  clearTimeout(saveTimer);
  const flush = () => {
    send({ type: "config.save", patch: pendingPatch });
    pendingPatch = {};
  };
  if (immediate) flush();
  else saveTimer = setTimeout(flush, 500);
}

function mergeDeep(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeDeep(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Значение в поле, если оно не в фокусе: чужой ввод перебивать нельзя. */
function setValue(node, value) {
  if (document.activeElement === node) return;
  const next = value === null || value === undefined ? "" : String(value);
  if (node.value !== next) node.value = next;
}

function setChecked(node, value) {
  if (document.activeElement === node) return;
  node.checked = Boolean(value);
}

/** Поле ввода → патч конфига. path — как "goal.target". */
function bind(id, path, { type = "text", immediate = false } = {}) {
  const node = el(id);
  const event =
    type === "checkbox" || type === "range" || type === "color" || node.tagName === "SELECT"
      ? "change"
      : "input";

  node.addEventListener(event, () => {
    let value;
    if (type === "checkbox") value = node.checked;
    else if (type === "number") value = node.value === "" ? 0 : Number(node.value);
    else value = node.value;

    const patch = {};
    let cursor = patch;
    const parts = path.split(".");
    for (const part of parts.slice(0, -1)) cursor = cursor[part] = {};
    cursor[parts[parts.length - 1]] = value;
    patchConfig(patch, immediate || type === "checkbox" || node.tagName === "SELECT");
  });

  // range обновляет подпись сразу, не дожидаясь ответа сервера
  if (id === "s-opacity") {
    node.addEventListener("input", () => { el("s-opacity-view").textContent = node.value; });
  }
}

bind("r-command", "raffle.command");
bind("r-theme", "raffle.theme");
bind("r-axelchat", "raffle.axelchatUrl");
bind("r-autodraw", "raffle.autoDrawOnTimer", { type: "checkbox" });

bind("g-title", "goal.title");
bind("g-target", "goal.target", { type: "number" });
bind("g-currency", "goal.currency");
bind("g-offset", "goal.manualOffset", { type: "number" });
bind("g-theme", "goal.theme");

bind("top-title", "top.title");
bind("top-limit", "top.limit", { type: "number" });
bind("top-theme", "top.theme");

bind("recent-title", "recent.title");
bind("recent-limit", "recent.limit", { type: "number" });
bind("recent-speed", "recent.speed", { type: "number" });
bind("recent-theme", "recent.theme");

bind("np-enabled", "nowplaying.enabled", { type: "checkbox" });
bind("np-source", "nowplaying.source");
bind("np-app", "nowplaying.appFilter");
bind("np-file", "nowplaying.filePath");
bind("np-cover", "nowplaying.cover", { type: "checkbox" });
bind("np-pause", "nowplaying.hideWhenPaused", { type: "checkbox" });
bind("np-title", "nowplaying.title");
bind("np-speed", "nowplaying.speed", { type: "number" });
bind("np-theme", "nowplaying.theme");

bind("da-enabled", "donationAlerts.enabled", { type: "checkbox" });
bind("da-url", "donationAlerts.widgetUrl");
bind("da-rate", "donationAlerts.rate", { type: "number" });
bind("dt-enabled", "donatello.enabled", { type: "checkbox" });
bind("dt-url", "donatello.widgetUrl");
bind("dt-rate", "donatello.rate", { type: "number" });

bind("p-command", "poll.command");
bind("p-change", "poll.allowChange", { type: "checkbox" });
bind("p-percent", "poll.showPercent", { type: "checkbox" });
bind("p-title", "poll.title");
bind("p-theme", "poll.theme");
bind("p-seconds", "poll.seconds", { type: "number" });

bind("c-name", "colors.name", { type: "color" });
bind("c-amount", "colors.amount", { type: "color" });

bind("a-enabled", "alerts.enabled", { type: "checkbox" });

bind("tts-enabled", "tts.enabled", { type: "checkbox" });
bind("tts-engine", "tts.engine");
bind("tts-max", "tts.maxChars", { type: "number" });
bind("tts-name", "tts.readName", { type: "checkbox" });
// У каждого движка своя ветка настроек: голос Windows и голос ElevenLabs — разные
// вещи, и общее поле «голос» сбрасывалось бы при каждом переключении.
bind("tts-voice-win", "tts.windows.voice");
bind("tts-rate", "tts.windows.rate", { type: "number" });
bind("tts-key", "tts.elevenlabs.apiKey");
bind("tts-voice", "tts.elevenlabs.voiceId");
bind("tts-model", "tts.elevenlabs.modelId");

el("tts-rate").addEventListener("input", (e) => { el("tts-rate-view").textContent = e.target.value; });

bind("s-enabled", "screamer.enabled", { type: "checkbox" });
bind("s-base", "screamer.baseCurrency");

// Секунды в панели удобнее, а конфиг и оверлеи считают в миллисекундах.
el("g-poll").addEventListener("input", (e) => {
  patchConfig({ goal: { pollIntervalMs: Math.max(10, Number(e.target.value) || 60) * 1000 } });
});
el("s-duration").addEventListener("input", (e) => {
  patchConfig({ screamer: { durationMs: Math.max(1, Number(e.target.value) || 5) * 1000 } });
});
el("a-volume").addEventListener("input", (e) => { el("a-volume-view").textContent = e.target.value; });
el("a-volume").addEventListener("change", (e) => {
  patchConfig({ alerts: { volume: Number(e.target.value) } }, true);
});
el("s-opacity").addEventListener("change", (e) => {
  patchConfig({ screamer: { opacity: Number(e.target.value) } }, true);
});

/* -------------------------------------------------------------- розыгрыш */

el("r-draw").addEventListener("click", () => send({ type: "raffle.draw" }));
el("r-restart").addEventListener("click", () => {
  if (confirm("Очистить список участников и историю выпавших?")) send({ type: "raffle.restart" });
});
el("r-add").addEventListener("click", addParticipant);
el("r-add-name").addEventListener("keydown", (e) => { if (e.key === "Enter") addParticipant(); });

function addParticipant() {
  const input = el("r-add-name");
  const name = input.value.trim();
  if (!name) return;
  send({ type: "raffle.add", name });
  input.value = "";
}

el("r-people").addEventListener("click", (event) => {
  const button = event.target.closest(".drop");
  if (button) send({ type: "raffle.remove", key: button.dataset.key });
});

el("r-timer-start").addEventListener("click", startTimer);
el("r-timer-value").addEventListener("keydown", (e) => { if (e.key === "Enter") startTimer(); });
el("r-timer-pause").addEventListener("click", () => send({ type: "raffle.timer", action: "pause" }));
el("r-timer-resume").addEventListener("click", () => send({ type: "raffle.timer", action: "resume" }));
el("r-timer-stop").addEventListener("click", () => send({ type: "raffle.timer", action: "stop" }));

function startTimer() {
  const seconds = parseDuration(el("r-timer-value").value);
  if (!seconds) {
    toast("Не понял время. Примеры: 90, 5m, 2m30s, 1:30", "warn");
    return;
  }
  send({ type: "raffle.timer", action: "start", seconds });
}

// Разбор длительности в секунды: "90", "5m", "30s", "2m30s", "1:30", "1:02:03".
function parseDuration(input) {
  const str = String(input || "").trim().toLowerCase();
  if (!str) return null;

  if (str.includes(":")) {
    const parts = str.split(":");
    if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
    const total = parts.reduce((acc, part) => acc * 60 + Number(part), 0);
    return total > 0 ? total : null;
  }

  if (/^\d+$/.test(str)) {
    const number = Number(str);
    return number > 0 ? number : null;
  }

  const re = /(\d+)\s*([hms])/g;
  let total = 0, matched = false, match;
  while ((match = re.exec(str)) !== null) {
    matched = true;
    const value = Number(match[1]);
    total += match[2] === "h" ? value * 3600 : match[2] === "m" ? value * 60 : value;
  }
  return matched && total > 0 ? total : null;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/* ------------------------------------------------------------------ цель */

el("g-refresh").addEventListener("click", () => send({ type: "goal.refresh" }));

el("top-reset").addEventListener("click", () => {
  if (confirm("Очистить таблицу донатеров? Суммы за эфир пропадут.")) {
    send({ type: "top.reset" });
  }
});

el("recent-reset").addEventListener("click", () => {
  if (confirm("Очистить ленту последних донатов?")) send({ type: "recent.reset" });
});

/* --------------------------------------------- правка топа и ленты руками */

el("top-list").addEventListener("click", (event) => {
  const button = event.target.closest(".drop");
  if (!button) return;
  if (confirm(`Убрать «${button.dataset.name}» из таблицы донатеров?`)) {
    send({ type: "top.remove", name: button.dataset.name });
  }
});

el("recent-list").addEventListener("click", (event) => {
  const button = event.target.closest(".drop");
  if (button) send({ type: "recent.remove", id: button.dataset.id });
});

el("top-add").addEventListener("click", () => {
  const name = el("top-add-name").value.trim();
  const amount = Number(el("top-add-amount").value);
  if (!name || !(amount > 0)) {
    toast("Нужны имя и сумма больше нуля", "warn");
    return;
  }
  send({ type: "top.add", name, amount });
  el("top-add-name").value = "";
  el("top-add-amount").value = "";
});

el("recent-add").addEventListener("click", () => {
  const amount = Number(el("recent-add-amount").value);
  if (!(amount > 0)) {
    toast("Нужна сумма больше нуля", "warn");
    return;
  }
  send({
    type: "recent.add",
    name: el("recent-add-name").value.trim(),
    amount,
    currency: el("recent-add-currency").value.trim(),
    message: el("recent-add-message").value.trim(),
  });
  for (const id of ["recent-add-name", "recent-add-amount", "recent-add-message"]) el(id).value = "";
});

/* ---------------------------------------------------------------- опрос */

el("p-start").addEventListener("click", () => {
  const options = el("p-options").value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (options.length < 2) {
    toast("Нужно хотя бы два варианта, по одному в строке", "warn");
    return;
  }

  send({
    type: "poll.start",
    question: el("p-question").value.trim(),
    options,
    seconds: Number(el("p-seconds").value) || 0,
  });
});

el("p-stop").addEventListener("click", () => send({ type: "poll.stop" }));
el("p-clear").addEventListener("click", () => send({ type: "poll.clear" }));

/* ---------------------------------------------------------------- цвета */

// Сброс — это пустая строка в конфиге: «нет своего цвета» и «чёрный» должны
// различаться, а поле выбора цвета пустым не бывает.
el("c-name-reset").addEventListener("click", () => patchConfig({ colors: { name: "" } }, true));
el("c-amount-reset").addEventListener("click", () => patchConfig({ colors: { amount: "" } }, true));

/* --------------------------------------------------------------- музыка */

el("np-test").addEventListener("click", () => {
  send({ type: "test.track" });
  toast("Демо-трек на оверлее");
});

/* -------------------------------------------------------------- озвучка */

el("tts-refresh").addEventListener("click", () => {
  send({ type: "tts.refresh" });
  toast("Спрашиваю ElevenLabs…");
});

/* ------------------------------------------------------------- скримеры */

/* ------------------------------------------------------- файлы для алертов */

/*
 * Файлы едут на сервер телом запроса, имя — в адресе: панель грузит по одному,
 * и multipart тут был бы разбором формы ради ничего. Список в панели обновит сам
 * сервер — он рассылает состояние, когда папка меняется.
 */
for (const [id, what] of [["m-image", "гифка"], ["m-sound", "звук"]]) {
  el(id).addEventListener("change", async (event) => {
    const input = event.target;
    const files = [...input.files];
    // Поле сбрасываем сразу: иначе тот же файл вторым разом не выберется —
    // change не сработает на неизменившемся значении.
    input.value = "";

    for (const file of files) {
      try {
        const response = await fetch("/media?name=" + encodeURIComponent(file.name), {
          method: "POST",
          body: file,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "не загрузилось");
        toast(`Добавлено: ${result.name}`, "ok");
      } catch (error) {
        toast(`${what} «${file.name}»: ${error.message}`, "warn");
      }
    }
  });
}

el("m-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".drop");
  if (!button) return;
  const name = button.dataset.name;
  if (!confirm(`Убрать «${name}» из папки media?`)) return;

  try {
    const response = await fetch("/media?name=" + encodeURIComponent(name), { method: "DELETE" });
    if (!response.ok) throw new Error("не удалилось");
    toast("Файл убран", "ok");
  } catch (error) {
    toast(error.message, "warn");
  }
});

/* ----------------------------------------------------------------- тиры */

/*
 * Правки тиров уходят целым массивом: сервер заменяет его как есть, иначе удалить
 * валюту или тир было бы нечем.
 *
 * Из-за этого нельзя клонировать тиры из state на каждую правку: настройка тиров —
 * это серия кликов подряд, а state обновляется только когда сервер пришлёт ответ.
 * Два клика внутри одного ответа клонировали бы одно и то же, и второй затирал бы
 * первый. Поэтому правки копятся в своей копии, а state для них — лишь стартовое
 * значение; копия отпускается, когда сервер вернёт ровно её.
 */
let editedTiers = null;

function patchTiers(mutate, immediate = true) {
  const tiers = structuredClone(editedTiers ?? state.config.alerts.tiers);
  mutate(tiers);
  editedTiers = tiers;
  patchConfig({ alerts: { tiers } }, immediate);
}

/** Тиры, которые надо показывать: своя копия, пока сервер не подтвердит её. */
function currentTiers(fromServer) {
  if (editedTiers === null) return fromServer;
  if (JSON.stringify(editedTiers) === JSON.stringify(fromServer)) {
    editedTiers = null;
    return fromServer;
  }
  return editedTiers;
}

el("a-tiers").addEventListener("input", (event) => {
  const input = event.target;
  const index = Number(input.closest("[data-index]")?.dataset.index);
  if (!Number.isInteger(index)) return;

  if (input.dataset.code) {
    patchTiers((tiers) => { tiers[index].minAmounts[input.dataset.code] = Number(input.value) || 0; }, false);
    return;
  }
  if (input.dataset.field === "name") {
    patchTiers((tiers) => { tiers[index].name = input.value; }, false);
    return;
  }
  if (input.dataset.field === "duration") {
    patchTiers((tiers) => { tiers[index].durationMs = Math.max(1, Number(input.value) || 5) * 1000; }, false);
  }
});

el("a-tiers").addEventListener("change", (event) => {
  const input = event.target;
  const index = Number(input.closest("[data-index]")?.dataset.index);
  if (!Number.isInteger(index)) return;

  if (input.dataset.field === "theme") {
    patchTiers((tiers) => { tiers[index].theme = input.value; });
    return;
  }

  // Выпадающий список медиа работает как кнопка «добавить»: выбранное уезжает в
  // список тира, а сам список возвращается к подписи.
  if (input.dataset.add) {
    const name = input.value;
    input.value = "";
    if (!name) return;
    patchTiers((tiers) => {
      const key = input.dataset.add;
      const chosen = tiers[index][key] ?? [];
      if (!chosen.includes(name)) tiers[index][key] = [...chosen, name];
    });
    return;
  }

  if (input.type !== "checkbox") return;

  const field = input.dataset.field || "";
  if (field === "screamer") {
    patchTiers((tiers) => { tiers[index].screamer = input.checked; });
  } else if (field === "speak") {
    patchTiers((tiers) => { tiers[index].speak = input.checked; });
  } else if (field.startsWith("src:")) {
    const source = field.slice(4);
    patchTiers((tiers) => {
      tiers[index].sources = { ...tiers[index].sources, [source]: input.checked };
    });
  }
});

el("a-tiers").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.closest("[data-index]")?.dataset.index);
  if (!Number.isInteger(index)) return;

  if (button.classList.contains("chip__drop")) {
    patchTiers((tiers) => {
      const key = button.dataset.kind;
      tiers[index][key] = (tiers[index][key] ?? []).filter((name) => name !== button.dataset.name);
    });
    return;
  }

  if (button.classList.contains("drop")) {
    patchTiers((tiers) => { delete tiers[index].minAmounts[button.dataset.code]; });
    return;
  }

  if (button.classList.contains("add")) {
    const box = button.closest(".tier__add");
    const code = box.querySelector(".new-code").value.trim().toUpperCase();
    const amount = Number(box.querySelector(".new-amount").value);
    if (!code || !Number.isFinite(amount)) {
      toast("Нужны код валюты и сумма", "warn");
      return;
    }
    patchTiers((tiers) => { tiers[index].minAmounts[code] = amount; });
  }
});

/* ------------------------------------------------------------- проверка */

el("t-send").addEventListener("click", () => {
  send({
    type: "test.donation",
    amount: Number(el("t-amount").value) || 0,
    currency: el("t-currency").value.trim() || state?.config.goal.currency,
    name: el("t-name").value.trim(),
    message: el("t-message").value.trim(),
    variant: el("t-variant").value,
  });
  toast("Тестовый донат отправлен");
});

/* -------------------------------------------------------------- отрисовка */

const STATUS_LABELS = {
  axelchat: "AxelChat",
  donationAlerts: "DonationAlerts",
  donatello: "Donatello",
  nowplaying: "Трек",
};

function renderStatuses(status) {
  el("statuses").innerHTML = Object.entries(STATUS_LABELS)
    .map(([key, label]) => `<span class="status" data-state="${status[key] || "off"}">${label}</span>`)
    .join("");
}

function renderRaffle(raffle) {
  el("r-count").textContent = raffle.count;
  el("r-remaining").textContent = raffle.remaining;

  const hasWinner = Boolean(raffle.winner?.name);
  el("r-winner-box").classList.toggle("show", hasWinner);
  el("r-winner").textContent = hasWinner ? raffle.winner.name : "—";

  setValue(el("r-command"), raffle.command);

  el("r-people").innerHTML = raffle.participants
    .map(
      (person) => `<li class="${person.drawn ? "is-drawn" : ""}">
        <span class="who">${escapeHtml(person.name)}</span>
        <span class="svc">${escapeHtml(person.serviceId)}</span>
        <button class="drop" data-key="${escapeHtml(person.key)}" title="убрать">×</button>
      </li>`
    )
    .join("");

  applyTimer(raffle.timerEndsAt, raffle.timerPausedRemaining);
}

function applyTimer(endsAt, pausedRemaining) {
  clearInterval(timerTick);
  timerTick = null;
  const node = el("r-timer");

  if (typeof pausedRemaining === "number" && pausedRemaining > 0) {
    node.classList.remove("off");
    node.textContent = `${fmtTime(pausedRemaining)} — пауза`;
    return;
  }
  if (typeof endsAt !== "number" || endsAt <= 0) {
    node.classList.add("off");
    node.textContent = "выключен";
    return;
  }

  node.classList.remove("off");
  const tick = () => { node.textContent = fmtTime((endsAt - Date.now()) / 1000); };
  tick();
  timerTick = setInterval(tick, 250);
}

function renderGoal(goal, config) {
  el("g-current").textContent = fmtMoney(goal.current);
  el("g-target-view").textContent = fmtMoney(goal.target);
  el("g-currency-view").textContent = goal.currency;
  el("g-fill").style.width = `${goal.percentage}%`;

  const rows = Object.entries(goal.sources).map(([key, info]) => {
    const label = STATUS_LABELS[key] || key;
    if (!info.enabled) return `<div><span>${label}</span><b>выключено</b></div>`;
    const own = info.currency && info.currency !== goal.currency
      ? ` (${fmtMoney(info.amount)} ${info.currency})`
      : "";
    return `<div><span>${label}</span><b>${fmtMoney(info.converted)} ${goal.currency}${own}</b></div>`;
  });
  rows.push(`<div><span>Вручную</span><b>${fmtMoney(goal.manualOffset)} ${goal.currency}</b></div>`);
  el("g-breakdown").innerHTML = rows.join("");

  setValue(el("g-title"), config.goal.title);
  setValue(el("g-target"), config.goal.target);
  setValue(el("g-currency"), config.goal.currency);
  setValue(el("g-offset"), config.goal.manualOffset);
  setValue(el("g-poll"), Math.round(config.goal.pollIntervalMs / 1000));
  setValue(el("g-theme"), config.goal.theme);
}

function renderConfig(config, media) {
  setValue(el("r-theme"), config.raffle.theme);
  setValue(el("r-axelchat"), config.raffle.axelchatUrl);
  setChecked(el("r-autodraw"), config.raffle.autoDrawOnTimer);

  setChecked(el("da-enabled"), config.donationAlerts.enabled);
  setValue(el("da-url"), config.donationAlerts.widgetUrl);
  setValue(el("da-rate"), config.donationAlerts.rate);
  setChecked(el("dt-enabled"), config.donatello.enabled);
  setValue(el("dt-url"), config.donatello.widgetUrl);
  setValue(el("dt-rate"), config.donatello.rate);

  setChecked(el("a-enabled"), config.alerts.enabled);

  setChecked(el("s-enabled"), config.screamer.enabled);
  setValue(el("s-duration"), config.screamer.durationMs / 1000);
  setValue(el("s-base"), config.screamer.baseCurrency);
  setValue(el("s-opacity"), config.screamer.opacity);
  el("s-opacity-view").textContent = config.screamer.opacity;

  if (!el("t-currency").value) el("t-currency").value = config.goal.currency;

  setValue(el("a-volume"), config.alerts.volume);
  el("a-volume-view").textContent = config.alerts.volume;

  renderTiers(currentTiers(config.alerts.tiers), media);
}

const SOURCE_FIELDS = [
  ["donationAlerts", "DonationAlerts"],
  ["donatello", "Donatello"],
];

const MEDIA_KINDS = [
  ["images", "Гифки"],
  ["sounds", "Звуки"],
];

function renderTiers(tiers, media) {
  const box = el("a-tiers");
  const library = {
    images: (media?.images ?? []).map((file) => file.name),
    sounds: (media?.sounds ?? []).map((file) => file.name),
  };

  // Разметку пересобираем только когда изменился состав тиров, валют или медиа
  // в них: иначе поле, в котором печатают порог, теряло бы курсор на каждом
  // ответе сервера. Список файлов сюда же — из него собраны выпадающие списки.
  const shape = tiers
    .map((tier) => [
      tier.id,
      Object.keys(tier.minAmounts).join(","),
      (tier.images ?? []).join(","),
      (tier.sounds ?? []).join(","),
    ].join(":"))
    .concat(library.images.join(","), library.sounds.join(","))
    .join("|");

  if (box.dataset.shape !== shape) {
    box.dataset.shape = shape;
    box.innerHTML = tiers.map((tier, index) => tierHtml(tier, index, library)).join("");
  }

  tiers.forEach((tier, index) => {
    const node = box.querySelector(`[data-index="${index}"]`);
    if (!node) return;
    setValue(node.querySelector('[data-field="name"]'), tier.name);
    setValue(node.querySelector('[data-field="duration"]'), tier.durationMs / 1000);
    setChecked(node.querySelector('[data-field="screamer"]'), tier.screamer);
    setChecked(node.querySelector('[data-field="speak"]'), tier.speak);
    setValue(node.querySelector('[data-field="theme"]'), tier.theme || "default");
    for (const [key] of SOURCE_FIELDS) {
      setChecked(node.querySelector(`[data-field="src:${key}"]`), tier.sources?.[key] !== false);
    }
    for (const input of node.querySelectorAll("input[data-code]")) {
      setValue(input, tier.minAmounts[input.dataset.code]);
    }
  });
}

const TIER_THEMES = [
  ["default", "default — тёмная панель"],
  ["slim", "slim — только текст"],
  ["neon", "neon — циан по обсидиану"],
  ["hud", "hud — капсула"],
];

/**
 * Медиа тира: выбранные файлы фишками и выпадающий список, работающий как кнопка
 * «добавить». Множественный select был бы короче, но им неудобно снимать один
 * файл из пяти, а именно это и делают в эфире.
 */
function mediaPickerHtml(tier, kind, label, library) {
  const chosen = tier[kind] ?? [];
  const chips = chosen.length
    ? chosen
        .map(
          (name) => `<span class="chip">${escapeHtml(name)}<button class="chip__drop"
            data-kind="${kind}" data-name="${escapeHtml(name)}" title="убрать">×</button></span>`
        )
        .join("")
    : `<span class="chip chip--empty">пусто</span>`;

  const free = library[kind].filter((name) => !chosen.includes(name));
  const options = free.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  return `<div class="picker">
    <span class="picker__label">${label}</span>
    <div class="chips">${chips}</div>
    <select data-add="${kind}" ${library[kind].length ? "" : "disabled"}>
      <option value="">${library[kind].length ? (free.length ? "добавить…" : "все уже выбраны") : "файлов нет"}</option>
      ${options}
    </select>
  </div>`;
}

function tierHtml(tier, index, library) {
  const toggles = SOURCE_FIELDS.map(
    ([key, label]) => `<label class="switch switch--sm">
      <input type="checkbox" data-field="src:${key}" />
      <span>${label}</span>
    </label>`
  ).join("");

  const thresholds = Object.keys(tier.minAmounts).map(
    (code) => `<div class="threshold">
      <span class="code">${escapeHtml(code)}</span>
      <input type="number" step="0.01" min="0" data-code="${escapeHtml(code)}" />
      <button class="btn btn--ghost drop" data-code="${escapeHtml(code)}">убрать</button>
    </div>`
  ).join("");

  return `<div class="tier" data-index="${index}">
    <div class="tier__head">
      <input type="text" class="tier__name" data-field="name" />
      <label class="tier__dur">
        <span>сек</span>
        <input type="number" step="0.5" min="1" data-field="duration" />
      </label>
    </div>
    <div class="tier__toggles">
      ${toggles}
      <label class="switch switch--sm switch--scream">
        <input type="checkbox" data-field="screamer" />
        <span>Скример</span>
      </label>
      <label class="switch switch--sm">
        <input type="checkbox" data-field="speak" />
        <span>Читать сообщение</span>
      </label>
    </div>
    <label class="tier__theme">
      <span>Тема</span>
      <select data-field="theme">
        ${TIER_THEMES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
      </select>
    </label>
    ${MEDIA_KINDS.map(([kind, label]) => mediaPickerHtml(tier, kind, label, library)).join("")}
    <div class="tier__thresholds">${thresholds}</div>
    <div class="actions tier__add">
      <input type="text" class="inline-input inline-input--short new-code" placeholder="код" />
      <input type="number" class="inline-input inline-input--short new-amount" placeholder="сумма" />
      <button class="btn btn--ghost add">Добавить валюту</button>
    </div>
  </div>`;
}

function renderTop(top, config) {
  setValue(el("top-title"), config.top.title);
  setValue(el("top-limit"), config.top.limit);
  setValue(el("top-theme"), config.top.theme);

  // В панели таблица целиком: править надо и тех, кто в кадр не попал.
  const all = top.all ?? top.donors;
  el("top-list").innerHTML = all.length
    ? all
        .map(
          (donor, index) => `<li${index < top.limit ? "" : ' class="is-hidden-row"'}>
            <span class="who">${escapeHtml(donor.name)}</span>
            <span class="svc">${donor.count}&nbsp;×</span>
            <b>${fmtMoney(donor.total)} ${escapeHtml(top.currency)}</b>
            <button class="drop" data-name="${escapeHtml(donor.name)}" title="убрать">×</button>
          </li>`
        )
        .join("")
    : "";

  const parts = [];
  if (!top.totalDonors) parts.push("Пока никого — донаты появятся здесь по мере эфира.");
  if (top.totalDonors > top.donors.length) {
    parts.push(`На оверлее видно ${top.donors.length} из ${top.totalDonors}; здесь список целиком.`);
  }
  if (top.anonymous.count > 0) {
    parts.push(
      `Анонимных донатов: ${top.anonymous.count} на ${fmtMoney(top.anonymous.total)} ${top.currency}.`
    );
  }
  el("top-note").textContent = parts.join(" ");
}

function renderRecent(recent, config) {
  setValue(el("recent-title"), config.recent.title);
  setValue(el("recent-limit"), config.recent.limit);
  setValue(el("recent-speed"), config.recent.speed);
  setValue(el("recent-theme"), config.recent.theme);

  // В панели лента полная и с сообщениями — в отличие от бегущей строки, где
  // только имя и сумма. Время точное, а не «5 минут назад»: панель открыта рядом
  // с OBS, и по ней сверяют, дошёл ли конкретный донат.
  el("recent-list").innerHTML = recent.donations
    .map(
      (donation) => `<li>
        <span class="who">${escapeHtml(donation.name || "Аноним")}</span>
        <b>${fmtMoney(donation.amount)} ${escapeHtml(donation.currency)}</b>
        <span class="at">${new Date(donation.at).toLocaleTimeString("ru-RU")}</span>
        ${donation.message ? `<span class="msg">${escapeHtml(donation.message)}</span>` : ""}
        <button class="drop" data-id="${escapeHtml(donation.id)}" title="убрать">×</button>
      </li>`
    )
    .join("");

  el("recent-note").textContent = recent.donations.length
    ? ""
    : "Пока пусто — донаты появятся здесь по мере эфира.";
}

/**
 * Что играет — в панели показывается как есть, вместе с паузой: прячет её только
 * оверлей, а стримеру надо видеть, что музыка вообще доходит.
 */
function renderNowPlaying(nowplaying, config) {
  setChecked(el("np-enabled"), config.nowplaying.enabled);
  setValue(el("np-source"), config.nowplaying.source);
  setValue(el("np-app"), config.nowplaying.appFilter);
  setValue(el("np-file"), config.nowplaying.filePath);
  setChecked(el("np-cover"), config.nowplaying.cover);
  setChecked(el("np-pause"), config.nowplaying.hideWhenPaused);
  setValue(el("np-title"), config.nowplaying.title);
  setValue(el("np-speed"), config.nowplaying.speed);
  setValue(el("np-theme"), config.nowplaying.theme);

  // Поля чужого источника только мешают: путь к файлу медиасессии не нужен, а
  // фильтр приложения файлу не к чему применять.
  const fromFile = config.nowplaying.source === "file";
  el("np-app-field").hidden = fromFile;
  el("np-apps").hidden = fromFile;
  el("np-file-field").hidden = !fromFile;
  el("np-file-note").hidden = !fromFile;

  const track = nowplaying?.track || null;
  const name = track ? [track.artist, track.title].filter(Boolean).join(" — ") : "";
  el("np-now-box").classList.toggle("show", Boolean(name));
  el("np-now").textContent = name || "—";
  el("np-now-label").textContent = track?.status === "paused" ? "На паузе" : "Играет";

  // Id приложений — то, что подставляют в фильтр: угадать их с первого раза
  // нельзя, у браузеров они выглядят как случайный набор букв.
  const apps = nowplaying?.apps || [];
  el("np-apps").textContent = apps.length
    ? "Сейчас видно: " + apps.join(", ")
    : "Пока не видно ни одного плеера — включи музыку, и приложения появятся здесь.";
}

/** Медиатека: что лежит в папке media, с размерами и кнопкой убрать. */
function renderMedia(media) {
  const groups = MEDIA_KINDS.map(([kind, label]) => {
    const files = media?.[kind] ?? [];
    const rows = files.length
      ? files
          .map(
            (file) => `<li>
              <span class="who">${escapeHtml(file.name)}</span>
              <span class="svc">${fmtSize(file.size)}</span>
              <button class="drop" data-name="${escapeHtml(file.name)}" title="убрать">×</button>
            </li>`
          )
          .join("")
      : `<li class="media__empty">пока пусто</li>`;
    return `<div class="media__group"><h3>${label}</h3><ul class="feed">${rows}</ul></div>`;
  });

  el("m-list").innerHTML = groups.join("");
}

function fmtSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Озвучка. Ключ обратно с сервера не приходит вовсе — поле остаётся тем, что
 * ввели, а панель показывает лишь, что ключ на сервере есть.
 */
function renderTts(tts, config) {
  setChecked(el("tts-enabled"), config.tts.enabled);
  setValue(el("tts-engine"), config.tts.engine);
  setValue(el("tts-max"), config.tts.maxChars);
  setChecked(el("tts-name"), config.tts.readName);

  // Настройки чужого движка только мешают: ключа у голоса Windows нет, а скорости
  // речи — у облака.
  const windows = config.tts.engine === "windows";
  el("tts-windows").hidden = !windows;
  el("tts-eleven").hidden = windows;

  const voices = tts?.voices ?? [];
  renderWindowsVoices(voices, config, windows);
  renderElevenVoices(voices, config);

  el("tts-quota").textContent = quotaText(tts);
}

function renderWindowsVoices(voices, config, active) {
  setValue(el("tts-rate"), config.tts.windows.rate);
  el("tts-rate-view").textContent = config.tts.windows.rate;

  const select = el("tts-voice-win");
  const shape = voices.map((voice) => voice.id).join(",");
  if (select.dataset.shape !== shape) {
    select.dataset.shape = shape;
    select.innerHTML =
      `<option value="">голос по умолчанию</option>` +
      voices
        .map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`)
        .join("");
  }
  setValue(select, config.tts.windows.voice);

  if (!active) return;

  /*
   * Голос читает только свой язык: английским голосом русское сообщение
   * произносится молча. Это ловушка, в которую попадаешь уже в эфире, поэтому
   * панель предупреждает заранее.
   */
  const hasRussian = voices.some((voice) => String(voice.culture || "").toLowerCase().startsWith("ru"));
  el("tts-win-note").textContent = !voices.length
    ? "Нажми «Обновить голоса» — список придёт из Windows."
    : hasRussian
      ? "Русский голос найден — сообщения будут читаться."
      : "Русских голосов в списке нет: такой голос прочитает русское сообщение молча." +
        " Поставить: Параметры → Время и язык → Речь → Добавить голоса → Русский." +
        " Появиться в этом списке должен голос с пометкой ru-RU.";
}

function renderElevenVoices(voices, config) {
  const list = el("tts-voice-list");
  const shape = voices.map((voice) => voice.id).join(",");
  if (list.dataset.shape !== shape) {
    list.dataset.shape = shape;
    list.innerHTML = voices
      .map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`)
      .join("");
  }
  setValue(el("tts-voice"), config.tts.elevenlabs.voiceId);
}

function quotaText(tts) {
  if (!tts?.hasKey) return "Ключ не задан — облачной озвучки не будет.";
  // Поле ключа после перезагрузки панели пустое: обратно он не приходит вовсе.
  // Без этой строчки выглядело бы так, будто ключ потерялся.
  if (!tts.quota) return "Ключ сохранён на сервере (в поле он не показывается). Остаток лимита пока неизвестен — нажми «Обновить голоса».";

  const { used, limit, resetsAt, plan } = tts.quota;
  const left = Math.max(0, limit - used);
  const when = resetsAt ? new Date(resetsAt).toLocaleDateString("ru-RU") : null;
  return [
    `План ${plan || "?"}: потрачено ${used} из ${limit} символов, осталось ${left}.`,
    when ? `Лимит обновится ${when}.` : "",
    limit ? `Это примерно ${Math.floor(left / 120)} сообщений по 120 символов.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * Цвета ника и суммы. В поле выбора всегда стоит цвет — пустым оно не бывает, —
 * поэтому «как в теме» показывается подписью, а не самим полем.
 */
const THEME_COLORS = { name: "#ffd54a", amount: "#7cfc7c" };

function renderColors(config) {
  setValue(el("c-name"), config.colors.name || THEME_COLORS.name);
  setValue(el("c-amount"), config.colors.amount || THEME_COLORS.amount);

  const what = (key, label) => `${label} — ${config.colors[key] ? "свой цвет" : "как в теме"}`;
  el("c-note").textContent = `Сейчас: ${what("name", "ник")}, ${what("amount", "сумма")}.`;
}

/**
 * Ход голосования. Вопрос и варианты в полях не трогаем: стример может набирать
 * следующий опрос, пока идёт текущий.
 */
function renderPoll(poll, config) {
  setValue(el("p-command"), config.poll.command);
  setValue(el("p-title"), config.poll.title);
  setValue(el("p-theme"), config.poll.theme);
  setValue(el("p-seconds"), config.poll.seconds);
  setChecked(el("p-change"), config.poll.allowChange);
  setChecked(el("p-percent"), config.poll.showPercent);

  const running = poll.visible && poll.open;
  el("p-state-box").classList.toggle("show", poll.visible);
  el("p-state-label").textContent = running ? "Идёт голосование" : "Голосование закрыто";
  el("p-state").textContent = poll.question || (poll.visible ? "без вопроса" : "—");

  el("p-results").innerHTML = poll.options
    .map(
      (option, index) => `<li>
        <span class="place">${index + 1}.</span>
        <span class="who">${escapeHtml(option.text)}</span>
        <b>${option.votes}${config.poll.showPercent ? ` · ${option.percent}%` : ""}</b>
      </li>`
    )
    .join("");

  el("p-note").textContent = !poll.visible
    ? "Опроса на экране нет. Набери вопрос с вариантами и жми «Запустить»."
    : running
      ? `Голосов: ${poll.total}. ${poll.seconds ? `Осталось ${poll.seconds} с.` : "Отсчёта нет — закрывать вручную."}`
      : `Итог: ${poll.total} голосов.`;
}

function renderUrls(port) {
  const base = `http://localhost:${port}`;
  const items = [
    ["Розыгрыш", "/raffle"],
    ["Цель сбора", "/goal"],
    ["Топ донатеров", "/top"],
    ["Последние донаты", "/recent"],
    ["Сейчас играет", "/track"],
    ["Опрос в чате", "/poll"],
    ["Алерты донатов", "/alerts"],
    ["Скримеры", "/screamer"],
  ];
  el("obs-urls").innerHTML = items
    .map(
      ([what, path]) => `<li>
        <span class="what">${what}</span>
        <span class="url">${base}${path}</span>
        <button class="btn btn--ghost copy" data-url="${base}${path}">Копировать</button>
        <a class="btn btn--ghost" href="${path}" target="_blank" rel="noopener">Открыть</a>
      </li>`
    )
    .join("");
}

el("data-open").addEventListener("click", () => send({ type: "data.open" }));

el("obs-urls").addEventListener("click", (event) => {
  const button = event.target.closest(".copy");
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.url).then(
    () => toast("Адрес скопирован", "ok"),
    () => toast("Буфер обмена недоступен — скопируй вручную", "warn")
  );
});

function renderLog(lines) {
  const node = el("log");
  const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
  node.innerHTML = lines.map(logRow).join("");
  if (atBottom) node.scrollTop = node.scrollHeight;
}

function appendLog(entry) {
  const node = el("log");
  const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
  node.insertAdjacentHTML("beforeend", logRow(entry));
  while (node.children.length > 200) node.removeChild(node.firstChild);
  if (atBottom) node.scrollTop = node.scrollHeight;
}

function logRow(entry) {
  const at = new Date(entry.at).toLocaleTimeString("ru-RU");
  return `<div class="${entry.level}">
    <span class="at">${at}</span>
    <span class="scope">${escapeHtml(entry.scope)}</span>
    <span class="text">${escapeHtml(entry.text)}</span>
  </div>`;
}

function fmtMoney(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
  );
}

function render(next) {
  state = next;
  renderStatuses(next.status);
  renderPoll(next.poll, next.config);
  renderColors(next.config);
  renderMedia(next.media);
  renderTts(next.tts, next.config);
  renderConfig(next.config, next.media);
  renderRaffle(next.raffle);
  renderGoal(next.goal, next.config);
  renderTop(next.top, next.config);
  renderRecent(next.recent, next.config);
  renderNowPlaying(next.nowplaying, next.config);
  renderUrls(next.config.port);
  el("data-dir").textContent = next.dataDir || "";
  if (next.log) renderLog(next.log);
}

/* ------------------------------------------------------------------ сокет */

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/control`);

  ws.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "state") render(message);
    else if (message.type === "log") appendLog(message.entry);
    else if (message.type === "toast") toast(message.text, message.level);
  };

  ws.onclose = () => {
    document.title = "rinkaStreamTools — нет связи";
    setTimeout(connect, 1500);
  };
  ws.onopen = () => { document.title = "rinkaStreamTools"; };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

connect();
