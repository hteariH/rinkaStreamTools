// Что именно читать вслух. Одинаково для обоих движков, поэтому отдельно от них.

/**
 * Сообщение донатера — в текст для синтеза.
 *
 * Ссылки выкидываются: читать вслух «аш тэ тэ пэ эс двоеточие слэш слэш» незачем,
 * а в облачном движке они уходят на кредиты как обычный текст. Длина режется по
 * той же причине — одно сообщение на пол-страницы способно съесть заметный кусок
 * месячного лимита, а в офлайновом движке просто читается минуту.
 */
export function speechText(donation, config) {
  const message = String(donation?.message ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!message) return "";

  const name = String(donation?.donorName ?? "").trim();
  const full = config?.readName !== false && name ? `${name} пишет: ${message}` : message;

  const limit = Number(config?.maxChars) > 0 ? Number(config.maxChars) : 200;
  return full.length <= limit ? full : full.slice(0, limit).trimEnd() + "…";
}
