// Облачная озвучка через ElevenLabs — тем же способом, каким это делает
// DonationAlerts: синтез на чужом сервере, к нам приезжает готовый mp3.
//
// Ключ — чужая тайна и деньги: он не пишется в лог, не уходит в панель обратно и
// не летит никуда, кроме api.elevenlabs.io.

const API = "https://api.elevenlabs.io/v1";

// Алерт не должен зависеть от чужого сервера: не успели — донат покажется молча.
const TIMEOUT_MS = 6000;

export class ElevenLabs {
  constructor(config) {
    this.config = config || {};
  }

  /** Ключ из конфига без краёв: его копируют из кабинета, часто с переносом строки. */
  get key() {
    return String(this.config.apiKey ?? "").trim();
  }

  get voice() {
    return String(this.config.voiceId ?? "").trim();
  }

  get ready() {
    return Boolean(this.key && this.voice);
  }

  async synthesize(text) {
    const response = await fetch(
      `${API}/text-to-speech/${encodeURIComponent(this.voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "xi-api-key": this.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // Flash дешевле вдвое по символам и отвечает за десятки миллисекунд —
          // для алертов важно и то и другое.
          model_id: this.config.modelId || "eleven_flash_v2_5",
        }),
      }
    );

    if (!response.ok) throw new Error(await describe(response));
    return { audio: Buffer.from(await response.arrayBuffer()), ext: "mp3" };
  }

  async voices() {
    if (!this.key) return [];

    const response = await fetch(`${API}/voices`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "xi-api-key": this.key },
    });
    if (!response.ok) throw new Error(await describe(response));

    const data = await response.json();
    return (data.voices ?? []).map((voice) => ({
      id: String(voice.voice_id),
      name: String(voice.name ?? voice.voice_id),
    }));
  }

  /** Сколько символов уже потрачено из месячного лимита. */
  async quota() {
    if (!this.key) return null;

    const response = await fetch(`${API}/user/subscription`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "xi-api-key": this.key },
    });
    if (!response.ok) throw new Error(await describe(response));

    const data = await response.json();
    return {
      used: Number(data.character_count) || 0,
      limit: Number(data.character_limit) || 0,
      resetsAt: Number(data.next_character_count_reset_unix) * 1000 || null,
      plan: String(data.tier || ""),
    };
  }
}

/**
 * Ошибку чужого API переводим в строку, по которой видно, что делать.
 *
 * Объяснение самого ElevenLabs идёт вперёд нашей догадки: под одним и тем же 401
 * у них живут и «ключ не тот», и «у ключа нет прав», а под 402 — и кончившиеся
 * кредиты, и «бесплатным этот голос недоступен». Чинятся они по-разному, и
 * подменять их общими словами значит отправить человека искать не там.
 */
async function describe(response) {
  let status = "";
  let message = "";
  try {
    const body = await response.json();
    status = String(body?.detail?.status ?? "");
    message = String(body?.detail?.message ?? "");
  } catch {
    /* тело не разобралось — обойдёмся кодом */
  }

  const own = HINTS[status] || GENERIC[response.status] || `HTTP ${response.status}`;
  const detail = message || status;
  return detail ? `${own} (${detail})` : own;
}

// Что означают частые ответы ElevenLabs — своими словами.
const HINTS = {
  invalid_api_key: "ключ не подошёл",
  missing_permissions: "у ключа нет нужных прав — в кабинете дай ему доступ к голосам и синтезу",
  quota_exceeded: "кредиты кончились",
  paid_plan_required: "на бесплатном плане этот голос через API недоступен — нужен платный план или свой голос в аккаунте",
  detected_unusual_activity: "ElevenLabs отключил бесплатный план для этого аккаунта — обычно при VPN или в регионе, где бесплатный тариф закрыт",
};

const GENERIC = {
  401: "ключ не подошёл",
  402: "нужен платный план",
  422: "запрос не принят",
  429: "слишком часто, лимит запросов",
};
