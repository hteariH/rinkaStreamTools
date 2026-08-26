// Пороги для скримера и алертов.
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

/**
 * Сумма и валюта, с которыми имеет смысл сверяться с порогом.
 * @returns {{amount: number, currency: string, exact: boolean}}
 */
export function comparableOf(donation, { minAmounts, baseCurrency }) {
  if (lookup(minAmounts, donation.currency) !== undefined) {
    return { amount: donation.amount, currency: donation.currency, exact: true };
  }
  if (donation.baseAmount !== null && donation.baseAmount !== undefined) {
    return { amount: donation.baseAmount, currency: baseCurrency || "USD", exact: true };
  }
  return { amount: donation.amount, currency: DEFAULT_KEY, exact: false };
}

/** Перекрывает ли донат порог. */
export function passesThreshold(donation, { minAmounts, baseCurrency }) {
  const comparable = comparableOf(donation, { minAmounts, baseCurrency });
  const threshold = lookup(minAmounts, comparable.currency) ?? lookup(minAmounts, DEFAULT_KEY);
  if (threshold === undefined || !Number.isFinite(threshold)) return false;
  return comparable.amount >= threshold;
}
