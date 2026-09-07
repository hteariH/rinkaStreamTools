// Счётчик на оверлее: смерти, победы, «сколько раз я это сказал» — что угодно,
// что стример считает вслух и всё равно теряет счёт.
//
// Всё, что он умеет, — прибавить, убавить и обнулиться. Отдельного смысла у
// числа нет, поэтому и настроек у него ровно три: подпись, шаг и разрешены ли
// отрицательные значения. Считается обычно вниз от нуля незачем: «смертей: -1»
// выглядит поломкой, а не счётом, поэтому по умолчанию ниже нуля не уходит.
//
// Значение живёт здесь, а в конфиге лежит только его слепок: эфир может
// оборваться на середине, и терять счёт из-за перезапуска программы обидно.

export class Counter {
  constructor(config) {
    this.config = config;
    this.value = toInt(config?.value, 0);
  }

  /** Настройки меняются из панели, значение — нет: им командуют кнопки и хоткеи. */
  configure(config) {
    this.config = config;
    // Отрицательные только что запретили, а на экране минус — подтягиваем к нулю,
    // иначе настройка выглядела бы невыполненной.
    if (!this.config.allowNegative && this.value < 0) this.value = 0;
  }

  /** Шаг из настроек. Ноль и мусор — это единица: счётчик без шага бесполезен. */
  get step() {
    const step = Math.abs(toInt(this.config?.step, 1));
    return step || 1;
  }

  /** Прибавить (или убавить). Возвращает true, если число и правда изменилось. */
  add(delta) {
    return this.set(this.value + toInt(delta, 0));
  }

  set(value) {
    let next = toInt(value, this.value);
    if (!this.config?.allowNegative && next < 0) next = 0;
    if (next === this.value) return false;
    this.value = next;
    return true;
  }

  reset() {
    return this.set(0);
  }

  /** Что уходит на оверлей. */
  snapshot(theme) {
    return {
      type: "counter",
      // Выключенный счётчик — это пустой оверлей, а не убранный источник в OBS:
      // сцену ради паузы в счёте никто не пересобирает.
      visible: this.config?.enabled !== false,
      title: this.config?.title || "",
      value: this.value,
      theme,
    };
  }
}

function toInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? number : fallback;
}
