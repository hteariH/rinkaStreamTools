// Озвучка сообщений донатеров.
//
// Устроено как у DonationAlerts: синтезирует не браузер, а сервер, оверлею
// приезжает ссылка на готовый звук. Движков два и они взаимозаменяемы:
//
//   windows     — голоса Windows: бесплатно, офлайн, звучит роботом;
//   elevenlabs  — облако по ключу стримера: звучит живо, но упирается в лимиты.
//
// Общее — здесь: что читать, сколько читать и где звук лежит до показа. Всё,
// что различается, живёт в самих движках.
//
// Файлы на диск не пишутся: озвучка нужна один раз и живёт минуты. Складывать её
// в папку рядом с конфигом значило бы копить мусор, который никто не чистит.

import { randomUUID } from "node:crypto";

import { log } from "../log.js";
import { ElevenLabs } from "./elevenlabs.js";
import { WindowsVoice } from "./windows.js";
import { speechText } from "./text.js";

// Сколько озвучек держать в памяти и как долго. Больше не нужно: звук играет
// сразу после доната, а очередь алертов и так идёт по одному.
const CACHE_MAX = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;

export { speechText };

export class Tts {
  constructor(config) {
    this.config = config;
    // id -> {audio, ext, at}. Ключ случайный: адрес озвучки не должен быть
    // угадываемым по номеру доната.
    this.cache = new Map();
    this.quota = null;
    this.voices = [];
    this.status = "off";
    this.engine = null;
    this._openEngine();
  }

  get engineName() {
    return this.config.engine === "windows" ? "windows" : "elevenlabs";
  }

  get enabled() {
    return Boolean(this.config.enabled && this.engine?.ready);
  }

  configure(next) {
    const was = this.engineName;
    const settings = JSON.stringify(this.config[was] ?? {});
    this.config = next;

    // Движок или его настройки сменились — старое состояние к новому отношения
    // не имеет: список голосов и остаток лимита относились к прошлому аккаунту
    // или к прошлой подсистеме.
    if (was !== this.engineName || settings !== JSON.stringify(next[this.engineName] ?? {})) {
      this.voices = [];
      this.quota = null;
      this.status = "off";
      this._openEngine();
    }
  }

  _openEngine() {
    this.engine =
      this.engineName === "windows"
        ? new WindowsVoice(this.config.windows)
        : new ElevenLabs(this.config.elevenlabs);
  }

  /**
   * Озвучить донат. Возвращает адрес звука для оверлея или null — если озвучка
   * выключена, читать нечего или синтез не задался.
   */
  async speak(donation) {
    if (!this.enabled) return null;

    const text = speechText(donation, this.config);
    if (!text) return null;

    let result;
    try {
      result = await this.engine.synthesize(text);
    } catch (error) {
      this.status = "error";
      log.warn("tts", `не озвучилось: ${error.message}`);
      return null;
    }

    this.status = "on";
    const id = randomUUID();
    this.remember(id, result);

    // Остаток лимита спрашиваем после синтеза: до него он всё равно не изменится,
    // а лишний запрос задержал бы алерт. У офлайнового голоса лимита нет вовсе.
    this.refreshQuota().catch(() => { /* необязательная цифра для панели */ });

    log.info("tts", `озвучено ${text.length} симв.`);
    return `/tts/${id}.${result.ext}`;
  }

  /** Готовая озвучка по адресу из алерта. */
  take(id) {
    return this.cache.get(String(id)) || null;
  }

  remember(id, result) {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.at > CACHE_TTL_MS) this.cache.delete(key);
    }
    while (this.cache.size >= CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(id, { audio: result.audio, ext: result.ext, at: now });
  }

  async refreshQuota() {
    this.quota = this.engine ? await this.engine.quota() : null;
    return this.quota;
  }

  async refreshVoices() {
    this.voices = this.engine ? await this.engine.voices() : [];
    return this.voices;
  }

  /** Что показать в панели. Ключ сюда не попадает — только факт, что он задан. */
  state() {
    return {
      engine: this.engineName,
      ready: Boolean(this.engine?.ready),
      hasKey: Boolean(this.config.elevenlabs?.apiKey),
      status: this.enabled ? this.status : "off",
      quota: this.quota,
      voices: this.voices,
    };
  }
}
