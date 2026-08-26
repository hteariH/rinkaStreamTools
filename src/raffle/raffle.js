// Состояние розыгрыша: список уникальных участников, текущая команда, победитель.
// Уникальность — по serviceId + имя (регистронезависимо). Имя стабильно и видно
// зрителям; author.id у AxelChat для части площадок может меняться от сообщения к
// сообщению, из-за чего один зритель попадал в список много раз и «перевешивал»
// розыгрыш. Поэтому дедупим по имени.

export class Raffle {
  // Доступные темы оверлея (совпадают с data-theme в public/overlay.html).
  static THEMES = ["default", "grimoire", "rune", "blood", "glitch"];

  constructor(command = "!хил") {
    this.command = command;
    this.participants = new Map(); // key -> { name, serviceId }
    this.last = null; // последний добавленный { name, serviceId }
    this.winner = null; // { name, serviceId } или null
    this.drawn = new Set(); // ключи уже выпавших победителей — их не разыгрываем повторно
    this.theme = "default"; // тема оверлея
    this.timerEndsAt = null; // момент окончания обратного отсчёта (epoch ms) или null
    this.timerPausedRemaining = null; // остаток секунд на паузе (null — не на паузе)
  }

  // Запустить обратный отсчёт на seconds секунд до конца розыгрыша.
  // Возвращает число секунд, либо false при некорректном значении.
  startTimer(seconds) {
    const s = Math.floor(Number(seconds));
    if (!Number.isFinite(s) || s <= 0) return false;
    this.timerEndsAt = Date.now() + s * 1000;
    this.timerPausedRemaining = null;
    return s;
  }

  // Поставить таймер на паузу — запоминаем остаток. Возвращает true, если было
  // что паузить (таймер шёл и ещё не истёк).
  pauseTimer() {
    if (this.timerEndsAt === null) return false;
    const left = this.timerRemaining();
    if (left <= 0) return false;
    this.timerPausedRemaining = left;
    this.timerEndsAt = null;
    return true;
  }

  // Снять с паузы — снова запускаем отсчёт от запомненного остатка.
  // Возвращает число секунд, либо false, если таймер не на паузе.
  resumeTimer() {
    if (this.timerPausedRemaining === null) return false;
    const left = this.timerPausedRemaining;
    this.timerEndsAt = Date.now() + left * 1000;
    this.timerPausedRemaining = null;
    return left;
  }

  // На паузе ли сейчас таймер.
  timerPaused() {
    return this.timerPausedRemaining !== null;
  }

  // Остановить/сбросить таймер. Возвращает true, если таймер был активен
  // (шёл или стоял на паузе).
  stopTimer() {
    const was = this.timerEndsAt !== null || this.timerPausedRemaining !== null;
    this.timerEndsAt = null;
    this.timerPausedRemaining = null;
    return was;
  }

  // Сколько секунд осталось до конца отсчёта (учитывает паузу; 0 — таймер
  // выключен или истёк).
  timerRemaining() {
    if (this.timerPausedRemaining !== null) return this.timerPausedRemaining;
    if (this.timerEndsAt === null) return 0;
    return Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
  }

  setCommand(command) {
    const c = String(command || "").trim();
    if (!c) return false;
    this.command = c;
    return true;
  }

  // Сменить тему оверлея. Возвращает false, если тема неизвестна.
  setTheme(theme) {
    const t = String(theme || "").trim().toLowerCase();
    if (!Raffle.THEMES.includes(t)) return false;
    this.theme = t;
    return true;
  }

  // Ключ уникальности участника — площадка + нормализованное имя.
  static keyFor({ serviceId, name }) {
    const svc = serviceId || "unknown";
    return `${svc}:name:${String(name || "").trim().toLowerCase()}`;
  }

  // Совпадает ли текст сообщения с командой (первый токен, регистронезависимо).
  matches(text) {
    const first = String(text || "").trim().split(/\s+/)[0] || "";
    return first.toLowerCase() === this.command.toLowerCase();
  }

  // Вставка участника с дедупом. Возвращает { name, serviceId } если добавлен
  // новый, иначе null (пустое имя ИЛИ уже в списке). Команду НЕ проверяет.
  _add(msg) {
    const name = String(msg.name || "").trim();
    if (!name) return null;
    const key = Raffle.keyFor(msg);
    if (this.participants.has(key)) return null;
    const entry = { name, serviceId: msg.serviceId || "unknown" };
    this.participants.set(key, entry);
    this.last = entry;
    return entry;
  }

  // Пытается добавить участника по сообщению из чата.
  // Сначала проверяет совпадение текста с командой, затем вставляет.
  tryAdd(msg) {
    if (!this.matches(msg.text)) return null;
    return this._add(msg);
  }

  // Ручное добавление по имени (CLI-команда add) — без проверки команды.
  addManual(name) {
    return this._add({ name, serviceId: "manual", authorId: "" });
  }

  // Случайный победитель среди тех, кто ещё НЕ выпадал. Уже выигравшие
  // исключаются из последующих розыгрышей (пока не сделан restart). Список
  // участников не очищается. Возвращает победителя, либо null, если разыгрывать
  // некого (пусто или все уже выпали) — различить помогает remaining().
  draw() {
    const pool = [...this.participants.entries()].filter(([key]) => !this.drawn.has(key));
    if (pool.length === 0) return null;
    const [key, entry] = pool[Math.floor(Math.random() * pool.length)];
    this.drawn.add(key);
    this.winner = entry;
    return entry;
  }

  // Сколько участников ещё могут выпасть (не выигрывали в этом круге).
  remaining() {
    let n = 0;
    for (const key of this.participants.keys()) if (!this.drawn.has(key)) n++;
    return n;
  }

  // Полный сброс розыгрыша.
  restart() {
    this.participants.clear();
    this.drawn.clear();
    this.last = null;
    this.winner = null;
    this.timerEndsAt = null;
    this.timerPausedRemaining = null;
  }

  list() {
    return [...this.participants.values()];
  }

  // Участники с ключами и отметкой «уже выпадал» — для списка в панели управления.
  entries() {
    return [...this.participants.entries()].map(([key, entry]) => ({
      key,
      name: entry.name,
      serviceId: entry.serviceId,
      drawn: this.drawn.has(key),
    }));
  }

  // Убрать участника из списка (в панели — крестик напротив имени).
  // Возвращает false, если такого ключа нет.
  remove(key) {
    if (!this.participants.has(key)) return false;
    const entry = this.participants.get(key);
    this.participants.delete(key);
    this.drawn.delete(key);
    if (this.last && this.last === entry) this.last = null;
    if (this.winner && this.winner === entry) this.winner = null;
    return true;
  }

  snapshot() {
    return {
      command: this.command,
      count: this.participants.size,
      remaining: this.remaining(),
      last: this.last,
      winner: this.winner,
      theme: this.theme,
      timerEndsAt: this.timerEndsAt,
      timerPausedRemaining: this.timerPausedRemaining,
    };
  }
}
