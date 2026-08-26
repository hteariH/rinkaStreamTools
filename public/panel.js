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
  const event = type === "checkbox" || node.tagName === "SELECT" || type === "range" ? "change" : "input";

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

bind("da-enabled", "donationAlerts.enabled", { type: "checkbox" });
bind("da-url", "donationAlerts.widgetUrl");
bind("da-rate", "donationAlerts.rate", { type: "number" });
bind("dt-enabled", "donatello.enabled", { type: "checkbox" });
bind("dt-url", "donatello.widgetUrl");
bind("dt-rate", "donatello.rate", { type: "number" });

bind("a-enabled", "alerts.enabled", { type: "checkbox" });
bind("s-enabled", "screamer.enabled", { type: "checkbox" });
bind("s-base", "screamer.baseCurrency");

// Секунды в панели удобнее, а конфиг и оверлеи считают в миллисекундах.
el("g-poll").addEventListener("input", (e) => {
  patchConfig({ goal: { pollIntervalMs: Math.max(10, Number(e.target.value) || 60) * 1000 } });
});
el("s-duration").addEventListener("input", (e) => {
  patchConfig({ screamer: { durationMs: Math.max(1, Number(e.target.value) || 5) * 1000 } });
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

/* ------------------------------------------------------------- скримеры */

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
  if (!Number.isInteger(index) || input.type !== "checkbox") return;

  const field = input.dataset.field || "";
  if (field === "screamer") {
    patchTiers((tiers) => { tiers[index].screamer = input.checked; });
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

function renderConfig(config) {
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

  renderTiers(currentTiers(config.alerts.tiers));
}

const SOURCE_FIELDS = [
  ["donationAlerts", "DonationAlerts"],
  ["donatello", "Donatello"],
];

function renderTiers(tiers) {
  const box = el("a-tiers");
  // Разметку пересобираем только когда изменился состав тиров или валют в них:
  // иначе поле, в котором печатают порог, теряло бы курсор на каждом ответе сервера.
  const shape = tiers.map((tier) => `${tier.id}:${Object.keys(tier.minAmounts).join(",")}`).join("|");

  if (box.dataset.shape !== shape) {
    box.dataset.shape = shape;
    box.innerHTML = tiers.map(tierHtml).join("");
  }

  tiers.forEach((tier, index) => {
    const node = box.querySelector(`[data-index="${index}"]`);
    if (!node) return;
    setValue(node.querySelector('[data-field="name"]'), tier.name);
    setValue(node.querySelector('[data-field="duration"]'), tier.durationMs / 1000);
    setChecked(node.querySelector('[data-field="screamer"]'), tier.screamer);
    for (const [key] of SOURCE_FIELDS) {
      setChecked(node.querySelector(`[data-field="src:${key}"]`), tier.sources?.[key] !== false);
    }
    for (const input of node.querySelectorAll("input[data-code]")) {
      setValue(input, tier.minAmounts[input.dataset.code]);
    }
  });
}

function tierHtml(tier, index) {
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
    </div>
    <div class="tier__thresholds">${thresholds}</div>
    <div class="actions tier__add">
      <input type="text" class="inline-input inline-input--short new-code" placeholder="код" />
      <input type="number" class="inline-input inline-input--short new-amount" placeholder="сумма" />
      <button class="btn btn--ghost add">Добавить валюту</button>
    </div>
  </div>`;
}

function renderUrls(port) {
  const base = `http://localhost:${port}`;
  const items = [
    ["Розыгрыш", "/raffle"],
    ["Цель сбора", "/goal"],
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
  renderConfig(next.config);
  renderRaffle(next.raffle);
  renderGoal(next.goal, next.config);
  renderUrls(next.config.port);
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
