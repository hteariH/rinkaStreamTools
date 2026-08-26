// Общая цель сбора: складывает суммы всех подключённых площадок в одну.
//
// Каждая площадка ведёт свой счётчик в своей валюте, поэтому у источника есть
// множитель rate — им сумма приводится к валюте цели. Курсы намеренно не тянутся
// из сети: они меняются, а цифра на экране во время эфира прыгать не должна.
// Плюс manualOffset — наличные, крипта и прочее мимо площадок.

export class Goal {
  /**
   * @param {object} config    секция goal из config.json
   * @param {Array<{key: string, source: object, config: object}>} sources
   * @param {(key: string, error: Error) => void} onError  неудачный опрос площадки
   */
  constructor(config, sources, onError) {
    this.config = config;
    this.sources = sources;
    this.onError = onError;
    this.timer = null;
    this.lastPollAt = null;
  }

  configure(config, sourceConfigs) {
    const intervalChanged = config.pollIntervalMs !== this.config.pollIntervalMs;
    this.config = config;
    for (const entry of this.sources) {
      entry.config = sourceConfigs[entry.key];
    }
    if (intervalChanged && this.timer) this.start();
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    const interval = Math.max(10000, Number(this.config.pollIntervalMs) || 60000);
    this.timer = setInterval(() => this.poll(), interval);
    this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Опрос всех площадок. Падение одной не мешает остальным, но не проходит молча. */
  async poll() {
    const active = this.sources.filter((entry) => entry.source.enabled);
    const results = await Promise.allSettled(active.map((entry) => entry.source.pollGoal()));

    results.forEach((result, index) => {
      if (result.status === "rejected" && this.onError) {
        this.onError(active[index].key, result.reason);
      }
    });

    this.lastPollAt = Date.now();
    return results;
  }

  snapshot() {
    const target = Number(this.config.target) || 0;
    const manual = Number(this.config.manualOffset) || 0;

    const breakdown = {};
    let current = manual;

    for (const { key, source, config } of this.sources) {
      const rate = Number(config?.rate);
      const factor = Number.isFinite(rate) && rate > 0 ? rate : 1;
      const converted = source.enabled ? source.amount * factor : 0;
      current += converted;

      breakdown[key] = {
        enabled: source.enabled,
        status: source.status,
        amount: source.amount,
        currency: source.currency,
        rate: factor,
        converted: round2(converted),
      };
    }

    current = round2(current);

    return {
      type: "goal",
      title: this.config.title || "",
      theme: this.config.theme || "default",
      target,
      currency: this.config.currency || "USD",
      manualOffset: manual,
      current,
      percentage: target > 0 ? Math.min(100, (current / target) * 100) : 0,
      sources: breakdown,
      lastPollAt: this.lastPollAt,
    };
  }
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
