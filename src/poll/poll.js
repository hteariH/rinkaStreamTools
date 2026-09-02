// Опрос в чате: вопрос, варианты и голоса зрителей.
//
// Голосуют тем же чатом, который уже читается ради розыгрыша, — номером варианта.
// По умолчанию просто числом («2»), потому что так короче всего и так привыкли;
// если в чате и без опроса летают числа, можно задать команду («!голос 2»).
//
// Один зритель — один голос. Ключ тот же, что у розыгрыша: площадка плюс имя.
// Идентификатор автора у AxelChat для части площадок меняется от сообщения к
// сообщению, и по нему один и тот же зритель голосовал бы сколько угодно раз.
//
// Передумать можно, пока голосование открыто: это настройка, и по умолчанию она
// включена — зритель, промахнувшийся мимо цифры, иначе остаётся с чужим голосом.

// Вариантов не больше, чем цифр на клавиатуре: голосуют одним символом, а
// двузначные номера в чате уже не наберёшь без ошибок.
export const MAX_OPTIONS = 9;

export class Poll {
  constructor(config) {
    this.config = config;
    this.question = "";
    // [{ text, votes }] — счётчик держим рядом с вариантом, чтобы не пересчитывать
    // всю карту голосов на каждое сообщение из чата.
    this.options = [];
    // ключ зрителя -> индекс варианта
    this.votes = new Map();
    this.open = false;
    // Показывать ли опрос на оверлее. Закрытое голосование ещё висит с итогами,
    // пока его не уберут: результаты обсуждают уже после того, как отсчёт кончился.
    this.visible = false;
    this.endsAt = null;
  }

  configure(config) {
    this.config = config;
  }

  /**
   * Запустить голосование. Возвращает false, если спрашивать нечего.
   * @param {{question: string, options: string[], seconds?: number}} params
   */
  start({ question, options, seconds }) {
    const list = (options ?? [])
      .map((option) => String(option ?? "").trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS);

    // Одного варианта мало: это уже не опрос, а объявление.
    if (list.length < 2) return false;

    this.question = String(question ?? "").trim();
    this.options = list.map((text) => ({ text, votes: 0 }));
    this.votes.clear();
    this.open = true;
    this.visible = true;

    const limit = Math.floor(Number(seconds));
    this.endsAt = Number.isFinite(limit) && limit > 0 ? Date.now() + limit * 1000 : null;
    return true;
  }

  /** Закрыть голосование, оставив итоги на экране. */
  stop() {
    if (!this.open) return false;
    this.open = false;
    this.endsAt = null;
    return true;
  }

  /** Убрать опрос с оверлея совсем. */
  clear() {
    this.open = false;
    this.visible = false;
    this.endsAt = null;
    this.question = "";
    this.options = [];
    this.votes.clear();
  }

  /** Сколько секунд осталось. 0 — таймера нет или он уже вышел. */
  remaining() {
    if (!this.endsAt) return 0;
    return Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
  }

  /**
   * Учесть сообщение из чата. Возвращает true, если картина голосов изменилась —
   * только тогда есть смысл обновлять оверлей.
   */
  vote(message) {
    if (!this.open) return false;

    const index = this.parse(message?.text);
    if (index === null || index >= this.options.length) return false;

    const key = Poll.keyFor(message);
    if (!key) return false;

    const previous = this.votes.get(key);
    if (previous === index) return false;
    // Передумать нельзя — первый голос остаётся за зрителем.
    if (previous !== undefined && this.config.allowChange === false) return false;

    if (previous !== undefined) this.options[previous].votes -= 1;
    this.options[index].votes += 1;
    this.votes.set(key, index);
    return true;
  }

  /**
   * Номер варианта из сообщения (с нуля) или null.
   *
   * Без команды голосом считается сообщение из одного числа и ничего больше:
   * «2» — голос, «2 балла из 10» — обычная реплика, и записывать её в голоса
   * значило бы считать чужие разговоры.
   */
  parse(text) {
    const clean = String(text ?? "").trim();
    if (!clean) return null;

    const command = String(this.config.command ?? "").trim();
    let candidate = clean;

    if (command) {
      const parts = clean.split(/\s+/);
      if (parts[0].toLowerCase() !== command.toLowerCase()) return null;
      candidate = parts.slice(1).join(" ").trim();
    }

    if (!/^[1-9]$/.test(candidate)) return null;
    return Number(candidate) - 1;
  }

  /** Ключ зрителя: площадка и имя, как в розыгрыше. */
  static keyFor({ serviceId, name } = {}) {
    const clean = String(name ?? "").trim().toLowerCase();
    if (!clean) return null;
    return `${serviceId || "unknown"}:name:${clean}`;
  }

  get total() {
    return this.votes.size;
  }

  /** Что уходит на оверлей. */
  snapshot(theme) {
    const total = this.total;
    // Ведущих может быть несколько — при равенстве не выделяем никого, иначе
    // оверлей объявлял бы победителем того, кто просто оказался выше в списке.
    const best = this.options.reduce((max, option) => Math.max(max, option.votes), 0);
    const leaders = best > 0 ? this.options.filter((option) => option.votes === best).length : 0;

    return {
      type: "poll",
      visible: this.visible,
      open: this.open,
      title: this.config.title || "",
      theme,
      question: this.question,
      total,
      seconds: this.remaining(),
      showPercent: this.config.showPercent !== false,
      options: this.options.map((option) => ({
        text: option.text,
        votes: option.votes,
        // Доля считается на сервере: оверлею незачем знать про деление на ноль.
        percent: total > 0 ? Math.round((option.votes / total) * 100) : 0,
        // Подсвечиваем ведущего только когда он один и голосование уже закрыто:
        // на живом голосовании подсветка прыгала бы туда-сюда.
        leading: !this.open && leaders === 1 && option.votes === best && best > 0,
      })),
    };
  }
}
