// Топ донатеров: кто сколько занёс за всё время, одним списком по обеим площадкам.
//
// Объединяются по имени: площадки друг про друга не знают, общего id у зрителя нет,
// и единственное, что у доната с DonationAlerts и с Donatello совпадает, — это ник.
// Значит, два разных человека с одинаковым ником сложатся в одного; ничего лучше
// имени тут нет, и об этом честно сказано в панели.
//
// Суммы приводятся к валюте цели теми же множителями площадок — иначе гривны с одной
// и доллары с другой сложились бы в бессмыслицу.
//
// Копится это только из живых событий сокета, поэтому переживает перезапуск лишь
// благодаря файлу рядом с конфигом: эфир идёт часами, и ронять таблицу на ребуте
// сервера нельзя.

import { readFile, writeFile } from "node:fs/promises";

const SAVE_DELAY_MS = 2000;

export class Donors {
  /**
   * @param {string} filePath           куда складывать таблицу
   * @param {(source: string) => number} rateFor  множитель площадки к валюте цели
   */
  constructor(filePath, rateFor) {
    this.filePath = filePath;
    this.rateFor = rateFor;
    this.donors = new Map();
    this.anonymous = { count: 0, total: 0 };
    this.saveTimer = null;
  }

  /** Ключ объединения: имя без регистра и без краевых пробелов. */
  static keyFor(name) {
    return String(name || "").trim().toLowerCase();
  }

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8"));
      for (const donor of raw.donors ?? []) {
        const key = Donors.keyFor(donor.name);
        if (!key) continue;
        this.donors.set(key, {
          name: donor.name,
          total: Number(donor.total) || 0,
          count: Number(donor.count) || 0,
          sources: Array.isArray(donor.sources) ? donor.sources : [],
          lastAt: Number(donor.lastAt) || 0,
        });
      }
      this.anonymous = {
        count: Number(raw.anonymous?.count) || 0,
        total: Number(raw.anonymous?.total) || 0,
      };
    } catch {
      // Файла ещё нет или он испорчен — начинаем с чистой таблицы, это не ошибка.
    }
  }

  /**
   * Учесть донат. Возвращает запись донатера или null, если донат анонимный —
   * такие в список не идут: приписать их некому, а сваливать всех в одного «Анонима»
   * значит выдумать донатера, которого нет.
   */
  add(donation) {
    const rate = Number(this.rateFor(donation.source));
    const factor = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const amount = round2((Number(donation.amount) || 0) * factor);

    const key = Donors.keyFor(donation.donorName);
    if (!key) {
      this.anonymous.count += 1;
      this.anonymous.total = round2(this.anonymous.total + amount);
      this.scheduleSave();
      return null;
    }

    const entry = this.donors.get(key) ?? {
      name: donation.donorName.trim(),
      total: 0,
      count: 0,
      sources: [],
      lastAt: 0,
    };

    entry.total = round2(entry.total + amount);
    entry.count += 1;
    entry.lastAt = donation.at ?? Date.now();
    // Показываем последнее написание ника: человек мог его сменить.
    entry.name = donation.donorName.trim();
    if (!entry.sources.includes(donation.source)) entry.sources.push(donation.source);

    this.donors.set(key, entry);
    this.scheduleSave();
    return entry;
  }

  /** Список сверху вниз. При равных суммах выше тот, кто занёс раньше. */
  top(limit = 10) {
    return [...this.donors.values()]
      .sort((a, b) => b.total - a.total || a.lastAt - b.lastAt)
      .slice(0, Math.max(1, limit));
  }

  reset() {
    this.donors.clear();
    this.anonymous = { count: 0, total: 0 };
    this.scheduleSave();
  }

  snapshot(config, currency, theme) {
    return {
      type: "top",
      title: config.title || "",
      // Тема своя: рядом с целью топ обычно ставят в той же, но сцены бывают
      // разные — например полоса цели slim под игрой и панель топа в углу.
      theme,
      currency,
      limit: config.limit,
      donors: this.top(config.limit).map((donor, index) => ({
        place: index + 1,
        name: donor.name,
        total: donor.total,
        count: donor.count,
        sources: donor.sources,
      })),
      // Анонимов в списке нет, но знать, что они были, полезно.
      anonymous: this.anonymous,
      totalDonors: this.donors.size,
    };
  }

  // Донаты идут пачками, а файл нужен только чтобы пережить перезапуск —
  // писать на каждый нет смысла.
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch(() => { /* не смогли записать — таблица живёт в памяти */ });
    }, SAVE_DELAY_MS);
  }

  async save() {
    const payload = {
      updatedAt: Date.now(),
      anonymous: this.anonymous,
      donors: [...this.donors.values()],
    };
    await writeFile(this.filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
