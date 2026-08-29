// Последние донаты: лента событий, свежее сверху, по обеим площадкам сразу.
//
// Это не топ: там сумма за всё время и один человек одной строкой, здесь — сами
// донаты, по одному, как пришли. Поэтому и анонимы тут есть: приписать донат
// некому, но событие было, и в ленте ему место.
//
// Суммы не приводятся к валюте цели. Множители площадок нужны, чтобы складывать,
// а складывать здесь нечего: каждая строка — один донат, и честнее показать ту
// сумму, которую человек занёс, в его же валюте.
//
// Как и топ, лента лежит в файле рядом с конфигом: эфир идёт часами, и терять
// последние донаты на ребуте сервера нельзя.

import { readFile, writeFile } from "node:fs/promises";

const SAVE_DELAY_MS = 2000;

// Сколько донатов держать. Показывается меньше — сколько задано в панели, — но
// запас нужен: число мест меняется на лету, и после «покажи не 3, а 10» лента не
// должна начинать копиться заново.
const KEEP = 50;

// Сообщения зрителей бывают на пол-экрана, а в панели у строки один экран в
// ширину. В эфир они не уходят вовсе — на бегущей строке только имя и сумма.
const MESSAGE_MAX = 140;

export class Recent {
  /** @param {string} filePath куда складывать ленту */
  constructor(filePath) {
    this.filePath = filePath;
    this.items = [];
    this.saveTimer = null;
  }

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8"));
      this.items = (raw.donations ?? [])
        .map((item) => normalize(item))
        .filter(Boolean)
        .slice(0, KEEP);
    } catch {
      // Файла ещё нет или он испорчен — начинаем с пустой ленты, это не ошибка.
    }
  }

  /** Учесть донат. Возвращает запись ленты. */
  add(donation) {
    const entry = normalize({
      id: donation.id,
      source: donation.source,
      name: donation.donorName,
      amount: donation.amount,
      currency: donation.currency,
      message: donation.message,
      at: donation.at,
    });

    this.items.unshift(entry);
    if (this.items.length > KEEP) this.items.length = KEEP;
    this.scheduleSave();
    return entry;
  }

  /** Свежее сверху. */
  list(limit = 5) {
    return this.items.slice(0, Math.max(1, limit));
  }

  reset() {
    this.items = [];
    this.scheduleSave();
  }

  /**
   * Что уходит на оверлей — бегущую строку: только имя и сумма.
   *
   * Сообщения зрителей сюда не кладутся вовсе, а не прячутся настройкой: чего нет
   * в кадре, то не попадёт на стрим по недосмотру. Читать их всё равно негде —
   * полоса едет, — а в панели они есть целиком.
   */
  snapshot(config, theme) {
    return {
      type: "recent",
      title: config.title || "",
      // Тема своя, как и у топа: бегущая строка идёт полосой под игрой, и там
      // часто уместнее slim, чем панель, которая хороша для цели в углу.
      theme,
      // Пикселей в секунду. Сколько строка едет — зависит от ширины источника в
      // OBS, поэтому задаётся скорость, а не время круга.
      speed: Number(config.speed) > 0 ? Number(config.speed) : 60,
      limit: config.limit,
      donations: this.list(config.limit).map(({ id, name, amount, currency }) => ({
        id, name, amount, currency,
      })),
      total: this.items.length,
    };
  }

  /**
   * Вся лента как есть — с сообщениями и временем. Это для панели: она открыта на
   * втором мониторе у стримера, и там как раз надо видеть, кто что написал.
   */
  history(limit = KEEP) {
    return this.list(limit);
  }

  // Донаты идут пачками, а файл нужен только чтобы пережить перезапуск —
  // писать на каждый нет смысла.
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch(() => { /* не смогли записать — лента живёт в памяти */ });
    }, SAVE_DELAY_MS);
  }

  async save() {
    const payload = { updatedAt: Date.now(), donations: this.items };
    await writeFile(this.filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}

/**
 * Приводит запись к одному виду — и свежий донат, и строку из файла: файл
 * пользователь мог поправить руками, а оверлей ждёт ровно эти поля.
 */
function normalize(item) {
  const at = Number(item?.at) || Date.now();
  const name = String(item?.name ?? "").trim();
  const message = String(item?.message ?? "").trim();

  return {
    // Ключ нужен оверлею: по нему видно, что лента изменилась и бегущую строку
    // пора пересобрать, — а не гонять её заново на каждое обновление соседей.
    id: String(item?.id ?? `${item?.source ?? "?"}-${at}`),
    source: String(item?.source ?? ""),
    // Анонимы в ленте остаются, но без выдуманного имени: как их назвать,
    // решает оверлей.
    name: name || null,
    amount: round2(Number(item?.amount) || 0),
    currency: String(item?.currency ?? "").trim(),
    message: message ? cut(message, MESSAGE_MAX) : null,
    at,
  };
}

function cut(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
