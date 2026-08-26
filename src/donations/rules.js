// Тиры донатов: во что попал донат по сумме и надо ли вообще на него реагировать.
//
// Курсы здесь не нужны: порог задан в той же валюте, в которой пришёл донат.
// Если для валюты донатера порога нет, но источник пересчитал сумму сам
// (DonationAlerts кладёт её в amount_in_user_currency) — сверяемся с пересчётом.
// Если нет ни того, ни другого, остаётся порог "default".

export const DEFAULT_KEY = "default";

function lookup(minAmounts, currency) {
  if (!currency || !minAmounts) return undefined;
  const code = String(currency).trim().toUpperCase();
  for (const [key, value] of Object.entries(minAmounts)) {
    if (key.trim().toUpperCase() === code) return Number(value);
  }
  return undefined;
}

/** Заданы ли пороги для этой валюты хоть в одном тире. */
function anyThresholdFor(tiers, currency) {
  return tiers.some((tier) => lookup(tier.minAmounts, currency) !== undefined);
}

/**
 * Сумма и валюта, с которыми имеет смысл сверяться с порогом.
 * @returns {{amount: number, currency: string}}
 */
export function comparableOf(donation, tiers, baseCurrency) {
  if (anyThresholdFor(tiers, donation.currency)) {
    return { amount: donation.amount, currency: donation.currency };
  }
  if (donation.baseAmount !== null && donation.baseAmount !== undefined) {
    return { amount: donation.baseAmount, currency: baseCurrency || "USD" };
  }
  return { amount: donation.amount, currency: DEFAULT_KEY };
}

/**
 * Тир доната — самый крупный из тех, чей порог сумма перекрывает. Тиры, выключенные
 * для этой площадки, в расчёт не идут вовсе: иначе крупный донат с выключенной
 * площадки «съедал» бы тир и не попадал в мелкий, который для неё включён.
 *
 * @param {object} donation
 * @param {Array} tiers      секция alerts.tiers из конфига
 * @param {string} baseCurrency
 * @returns {{tier: object, threshold: number, comparable: object} | null}
 */
export function tierFor(donation, tiers, baseCurrency) {
  const list = Array.isArray(tiers) ? tiers : [];
  const comparable = comparableOf(donation, list, baseCurrency);

  let best = null;
  for (const tier of list) {
    if (tier.sources && tier.sources[donation.source] === false) continue;

    const threshold = lookup(tier.minAmounts, comparable.currency)
      ?? lookup(tier.minAmounts, DEFAULT_KEY);
    if (threshold === undefined || !Number.isFinite(threshold)) continue;
    if (comparable.amount < threshold) continue;

    if (best === null || threshold > best.threshold) {
      best = { tier, threshold, comparable };
    }
  }
  return best;
}
