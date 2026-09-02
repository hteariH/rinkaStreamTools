// Сборка приложения: состояние розыгрыша, источники донатов, цель сбора и хаб
// сокетов. Здесь же живёт протокол панели управления — единственное место, куда
// приходят команды снаружи.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { Hub } from "./server.js";
import { PUBLIC_DIR, DONORS_PATH, RECENT_PATH, MEDIA_DIR, DATA_DIR } from "./paths.js";
import { log } from "./log.js";
import { saveConfig } from "./config.js";
import { Raffle } from "./raffle/raffle.js";
import { AxelChatClient } from "./raffle/axelchat.js";
import { DonationAlertsSource } from "./donations/donationalerts.js";
import { DonatelloSource } from "./donations/donatello.js";
import { Goal } from "./donations/goal.js";
import { Donors } from "./donations/donors.js";
import { Recent } from "./donations/recent.js";
import { Media } from "./media.js";
import { Tts } from "./tts/service.js";
import { NowPlaying } from "./nowplaying/nowplaying.js";
import { tierFor } from "./donations/rules.js";

export class App {
  constructor(config) {
    this.config = config;

    this.raffle = new Raffle(config.raffle.command);
    if (!this.raffle.setTheme(config.raffle.theme)) {
      log.warn("raffle", `неизвестная тема "${config.raffle.theme}", использую default`);
    }

    this.axelchat = new AxelChatClient(config.raffle.axelchatUrl);
    this.axelchatStatus = "off";
    this.refreshTimer = null;
    this.autoDrawTimer = null;

    this.donationAlerts = new DonationAlertsSource(config.donationAlerts);
    this.donatello = new DonatelloSource(config.donatello);

    this.goal = new Goal(
      config.goal,
      [
        { key: "donationAlerts", source: this.donationAlerts, config: config.donationAlerts },
        { key: "donatello", source: this.donatello, config: config.donatello },
      ],
      (key, error) => log.warn(key, `сумма не обновилась: ${error.message}`)
    );

    // Множитель площадки к валюте цели тот же, что у самой цели: иначе гривны с
    // одной площадки и доллары с другой сложились бы в бессмыслицу.
    this.donors = new Donors(DONORS_PATH, (source) => this.config[source]?.rate ?? 1);

    // Лента последних донатов, наоборот, множители не трогает: там не сумма, а
    // сами донаты — каждый в валюте, в которой пришёл.
    this.recent = new Recent(RECENT_PATH);

    // Гифки и звуки алертов. Список файлов держим при себе: выбирать медиа
    // приходится в момент доната, а лезть в это время на диск — лишняя задержка
    // перед тем, что зритель ждёт прямо сейчас.
    this.media = new Media(MEDIA_DIR);
    this.mediaFiles = { images: [], sounds: [] };
    // Что выпало в прошлый раз, по тирам: две одинаковых гифки подряд на пачке
    // донатов выглядят как зависший оверлей.
    this.lastMedia = new Map();

    // Озвучка сообщений. Ключ и голос — стримера, программа только клиент.
    this.tts = new Tts(config.tts);

    // Что играет — сбоку от донатов: со сбором это не связано никак, поэтому и
    // канал у оверлея свой.
    this.nowPlaying = new NowPlaying(config.nowplaying);

    this.hub = new Hub(
      config.port,
      {
        "/ws/raffle": () => this.raffle.snapshot(),
        "/ws/goal": () => this.goal.snapshot(),
        "/ws/top": () => this.topSnapshot(),
        "/ws/recent": () => this.recentSnapshot(),
        "/ws/track": () => this.trackSnapshot(),
        // Алерты и скримеры — поток событий, начального состояния у них нет:
        // оверлей, подключившийся после доната, показывать его задним числом не должен.
        "/ws/alerts": () => this.alertsHello(),
        "/ws/screamer": () => ({ type: "hello", opacity: this.config.screamer.opacity }),
        "/ws/control": () => this.controlState(),
      },
      (channel, message, ws) => {
        if (channel === "/ws/control") this.handleCommand(message, ws);
      },
      {
        media: this.media,
        tts: this.tts,
        // Файл добавили или убрали из панели — список в панели должен обновиться
        // сразу, а не после перезапуска.
        onMediaChange: () => this.refreshMedia(),
      }
    );
  }

  async start() {
    await this.donors.load();
    await this.recent.load();
    await this.refreshMedia();
    await this.hub.start();

    this._wireAxelChat();
    this._wireSource("donationAlerts", this.donationAlerts);
    this._wireSource("donatello", this.donatello);

    this._wireNowPlaying();

    this.axelchat.start();
    this.donationAlerts.start();
    this.donatello.start();
    this.goal.start();
    this.nowPlaying.start();

    log.on("line", (entry) => this.hub.broadcast("/ws/control", { type: "log", entry }));

    log.ok("server", `панель управления: http://localhost:${this.config.port}/`);
  }

  // -------------------------------------------------------------- источники

  _wireAxelChat() {
    this.axelchat.on("status", (status) => {
      const was = this.axelchatStatus;
      if (status === "connected") {
        this.axelchatStatus = "on";
        log.ok("axelchat", `подключено: ${this.config.raffle.axelchatUrl}`);
      } else if (status === "disconnected" || status.startsWith("error")) {
        this.axelchatStatus = "error";
        // Пока AxelChat не запущен, попытки идут каждые 15 секунд. Пишем об этом
        // один раз на обрыв, иначе лог панели забивается одной и той же строкой.
        if (was !== "error") log.warn("axelchat", "нет связи, переподключаюсь…");
      }
      if (was !== this.axelchatStatus) this.pushControl();
    });

    this.axelchat.on("message", (msg) => {
      const added = this.raffle.tryAdd(msg);
      if (!added) return;
      log.info("raffle", `+ ${added.name} [${added.serviceId}] (всего: ${this.raffle.list().length})`);
      this.pushRaffle();
    });
  }

  _wireNowPlaying() {
    this.nowPlaying.on("change", () => this.pushTrack());
    this.nowPlaying.on("status", () => this.pushControl());
    this.nowPlaying.on("log", (text) => log.info("track", text));
    // Список приложений идёт только в панель: на оверлее ему делать нечего.
    this.nowPlaying.on("apps", () => this.pushControl());
  }

  _wireSource(key, source) {
    source.on("log", (text) => log.info(key, text));
    source.on("status", (status) => {
      log.info(key, status === "on" ? "подключено" : status === "error" ? "нет связи" : "выключено");
      this.pushControl();
    });
    source.on("goal", () => this.pushGoal());
    source.on("donation", (donation) => this.onDonation(donation));
  }

  /** Единая точка входа для доната из любой площадки — и для теста из панели. */
  async onDonation(donation) {
    log.ok(
      donation.source,
      `донат ${donation.amount} ${donation.currency} от ${donation.donorName || "анонима"}`
    );

    // Сумму площадки не досчитываем сами, а спрашиваем у неё: в сокет прилетает
    // не всегда ровно то, что площадка потом покажет в цели. Опрос внеочередной,
    // иначе цифра на экране догоняла бы донат до минуты.
    if (!donation.test) {
      this.refreshGoalSoon();
      this.donors.add(donation);
      this.recent.add(donation);
      this.pushTop();
      this.pushRecent();
    }

    if (!this.config.alerts.enabled) return;

    const match = tierFor(donation, this.config.alerts.tiers, this.config.screamer.baseCurrency);
    if (!match) {
      log.info(donation.source, "тир не подошёл — ни алерта, ни скримера");
      return;
    }

    const { tier, threshold, comparable } = match;
    log.info(
      donation.source,
      `тир «${tier.name}» (${comparable.amount} ${comparable.currency} ≥ ${threshold})`
    );

    // Озвучка ждётся до показа, а не догоняет алерт: голос, приехавший к уже
    // уехавшей карточке, читает сообщение, которого на экране больше нет.
    // Не успела или не задалась — алерт всё равно выходит, просто молча.
    const voice = tier.speak ? await this.tts.speak(donation) : null;

    this.hub.broadcast("/ws/alerts", {
      ...donation,
      type: "alert",
      tier: tier.id,
      tierName: tier.name,
      durationMs: Number(tier.durationMs) || 7000,
      theme: tier.theme || "default",
      colors: this.config.colors,
      volume: clamp01(this.config.alerts.volume, 0.8),
      // Что показать и что сыграть, решает сервер: у него список файлов, и
      // оверлею незачем знать, что их несколько.
      ...this.pickMedia(tier),
      voice,
    });

    // Скример — свойство тира: на мелкие донаты он обычно не нужен, а на крупные
    // страница сама подберёт вариацию посильнее по имени тира.
    if (tier.screamer && this.config.screamer.enabled) {
      this.hub.broadcast("/ws/screamer", {
        ...donation,
        type: "screamer",
        tier: tier.id,
        durationMs: Number(this.config.screamer.durationMs) || 5000,
      });
    }
  }

  /**
   * Показать конкретную вариацию скримера, не разбирая тиры. Нужно для проверки
   * из панели: иначе «сердечко» с мелкой суммой не показало бы ничего, потому что
   * мелкий тир скример не вызывает.
   */
  previewScreamer(donation, variant) {
    this.hub.broadcast("/ws/screamer", {
      ...donation,
      type: "screamer",
      tier: "check",
      durationMs: Number(this.config.screamer.durationMs) || 5000,
      variant,
    });
    log.info("screamer", `проверка: вариация «${variant}»`);
  }

  /**
   * Гифка и звук для алерта: случайные из того, что выбрано в тире.
   *
   * Из списка выкидывается то, чего на диске уже нет: файл могли убрать из папки
   * руками, а тир про него ещё помнит — на эфире это была бы битая картинка.
   */
  pickMedia(tier) {
    const has = (kind) => new Set(this.mediaFiles[kind].map((file) => file.name));
    const images = (tier.images ?? []).filter((name) => has("images").has(name));
    const sounds = (tier.sounds ?? []).filter((name) => has("sounds").has(name));

    const last = this.lastMedia.get(tier.id) || {};
    const image = pickOne(images, last.image);
    const sound = pickOne(sounds, last.sound);
    this.lastMedia.set(tier.id, { image, sound });

    return { image, sound };
  }

  /** Перечитать папку медиа и разослать новый список в панель. */
  async refreshMedia() {
    this.mediaFiles = await this.media.list();
    this.pushControl();
  }

  /**
   * Приветствие оверлею алертов. Наличие звука проверяет сервер, а не страница:
   * иначе каждый запуск оверлея писал бы 404 в консоль браузера и в лог OBS.
   */
  alertsHello() {
    // Длительность теперь у каждого тира своя и едет вместе с самим алертом.
    return {
      type: "hello",
      sound: existsSync(path.join(PUBLIC_DIR, "alert.mp3")),
    };
  }

  /**
   * Внеочередной опрос сумм после доната. С задержкой и без накопления очереди:
   * донаты приходят пачками, а площадка успевает учесть донат не мгновенно.
   */
  refreshGoalSoon() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.goal.poll().then(() => this.pushGoal());
    }, 2500);
  }

  /**
   * Разыграть победителя по истечении обратного отсчёта, если это включено.
   * Таймер до сих пор был чисто оформительским: сервер хранил момент окончания,
   * а тикал его сам оверлей. Теперь на этот момент нужно ещё и среагировать.
   */
  scheduleAutoDraw() {
    clearTimeout(this.autoDrawTimer);
    this.autoDrawTimer = null;

    if (!this.config.raffle.autoDrawOnTimer) return;
    if (this.raffle.timerPaused()) return;

    const left = this.raffle.timerRemaining();
    if (left <= 0) return;

    this.autoDrawTimer = setTimeout(() => {
      this.autoDrawTimer = null;
      const winner = this.raffle.draw();
      if (!winner) {
        log.warn("raffle", "отсчёт кончился, но разыгрывать некого");
      } else {
        log.ok("raffle", `отсчёт кончился, победитель: ${winner.name}`);
      }
      this.pushRaffle();
    }, left * 1000);
  }

  // ------------------------------------------------------------- рассылка

  pushRaffle() {
    this.hub.broadcast("/ws/raffle", this.raffle.snapshot());
    this.pushControl();
  }

  pushGoal() {
    this.hub.broadcast("/ws/goal", this.goal.snapshot());
    this.pushControl();
  }

  pushTop() {
    this.hub.broadcast("/ws/top", this.topSnapshot());
    this.pushControl();
  }

  topSnapshot() {
    return {
      ...this.donors.snapshot(
        this.config.top,
        // Валюта — общая, от цели: суммы в топе приведены к ней же.
        this.config.goal.currency || "USD",
        this.config.top.theme || "default"
      ),
      colors: this.config.colors,
    };
  }

  pushRecent() {
    this.hub.broadcast("/ws/recent", this.recentSnapshot());
    this.pushControl();
  }

  recentSnapshot() {
    return {
      ...this.recent.snapshot(this.config.recent, this.config.recent.theme || "default"),
      colors: this.config.colors,
    };
  }

  pushTrack() {
    this.hub.broadcast("/ws/track", this.trackSnapshot());
    this.pushControl();
  }

  trackSnapshot() {
    return this.nowPlaying.snapshot(this.config.nowplaying.theme || "default");
  }

  pushControl() {
    this.hub.broadcast("/ws/control", this.controlState());
  }

  controlState() {
    return {
      type: "state",
      config: this.config,
      raffle: { ...this.raffle.snapshot(), participants: this.raffle.entries() },
      goal: this.goal.snapshot(),
      // В панели таблица целиком, а не только видимая на оверлее часть: править
      // надо и того, кто в кадр не попал.
      top: { ...this.topSnapshot(), all: this.donors.all() },
      // В панели лента полная и с сообщениями, а не та обрезанная, что едет
      // строкой на оверлее.
      recent: { donations: this.recent.history() },
      media: this.mediaFiles,
      // Где лежат настройки и данные: без этого «куда делись мои донаты после
      // обновления» не на что ответить.
      dataDir: DATA_DIR,
      // Ключ наружу не отдаём — только факт, что он задан, остаток лимита и
      // список голосов.
      tts: this.tts.state(),
      // В панели трек как есть, вместе с паузой: прячет её только оверлей, а
      // стримеру видно, что музыка вообще идёт.
      nowplaying: { track: this.nowPlaying.current, apps: this.nowPlaying.apps },
      status: {
        axelchat: this.axelchatStatus,
        donationAlerts: this.donationAlerts.enabled ? this.donationAlerts.status : "off",
        donatello: this.donatello.enabled ? this.donatello.status : "off",
        nowplaying: this.nowPlaying.status,
      },
      log: log.recent(),
    };
  }

  // -------------------------------------------------------------- команды

  handleCommand(message, ws) {
    const reply = (text, level = "info") => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "toast", text, level }));
    };

    switch (message.type) {
      case "raffle.draw": {
        const winner = this.raffle.draw();
        if (!winner) {
          reply(this.raffle.list().length ? "Все участники уже выигрывали" : "Список пуст", "warn");
          return;
        }
        log.ok("raffle", `победитель: ${winner.name}`);
        this.pushRaffle();
        return;
      }
      case "raffle.restart":
        this.raffle.restart();
        log.info("raffle", "список очищен");
        this.scheduleAutoDraw();
        this.pushRaffle();
        return;
      case "raffle.add": {
        const added = this.raffle.addManual(message.name);
        if (!added) {
          reply("Пустое имя или такой участник уже есть", "warn");
          return;
        }
        log.info("raffle", `+ ${added.name} (вручную)`);
        this.pushRaffle();
        return;
      }
      case "raffle.remove":
        if (this.raffle.remove(message.key)) this.pushRaffle();
        return;
      case "raffle.timer":
        this.handleTimer(message, reply);
        return;
      case "top.remove": {
        if (!this.donors.remove(message.name)) {
          reply("Такого донатера в таблице нет", "warn");
          return;
        }
        log.info("top", `убран донатер: ${message.name}`);
        this.pushTop();
        return;
      }
      case "top.add": {
        const added = this.donors.addManual(message.name, message.amount);
        if (!added) {
          reply("Нужны имя и сумма больше нуля", "warn");
          return;
        }
        log.info("top", `+ ${added.name}: ${added.total} (вручную)`);
        this.pushTop();
        reply(`Добавлено: ${added.name}`, "ok");
        return;
      }
      case "recent.remove": {
        if (!this.recent.remove(message.id)) {
          reply("Такого доната в ленте нет", "warn");
          return;
        }
        log.info("recent", "донат убран из ленты");
        this.pushRecent();
        return;
      }
      case "recent.add": {
        const added = this.recent.addManual({
          name: message.name,
          amount: message.amount,
          currency: message.currency || this.config.goal.currency,
          message: message.message,
        });
        if (!added) {
          reply("Нужна сумма больше нуля", "warn");
          return;
        }
        log.info("recent", `+ ${added.name || "аноним"}: ${added.amount} ${added.currency} (вручную)`);
        this.pushRecent();
        reply("Добавлено в ленту", "ok");
        return;
      }
      case "top.reset":
        this.donors.reset();
        log.info("top", "таблица донатеров очищена");
        this.pushTop();
        return;
      case "test.track": {
        // Демо-трек, чтобы поставить оверлей на место в OBS, не дожидаясь, пока
        // сменится песня. Держится до следующей настоящей смены трека.
        this.hub.broadcast("/ws/track", {
          ...this.trackSnapshot(),
          track: {
            title: "Звезда по имени Солнце",
            artist: "Кино",
            status: "playing",
            cover: null,
          },
        });
        log.info("track", "проверка: демо-трек на оверлее");
        return;
      }
      case "data.open": {
        // Проводник — единственный способ показать папку человеку, который не
        // ходит по путям руками.
        if (process.platform !== "win32") {
          reply(DATA_DIR, "info");
          return;
        }
        // Проводник возвращает ненулевой код даже когда открылся, поэтому за его
        // выходом не следим.
        spawn("explorer.exe", [DATA_DIR], { detached: true, stdio: "ignore" }).unref();
        reply("Папка открыта");
        return;
      }
      case "tts.refresh":
        /*
         * Голоса и остаток лимита спрашиваются независимо: у ключа с урезанными
         * правами одно может быть разрешено, а другое нет, и падать целиком из-за
         * недоступной цифры лимита — значит скрыть работающий список голосов.
         */
        Promise.allSettled([this.tts.refreshVoices(), this.tts.refreshQuota()]).then(
          ([voices, quota]) => {
            this.pushControl();

            const parts = [];
            parts.push(
              voices.status === "fulfilled"
                ? `Голосов: ${this.tts.voices.length}`
                : `Голоса не пришли: ${voices.reason.message}`
            );
            // У офлайнового движка лимита нет вовсе — молчим про него, а не
            // пишем «недоступен», как будто что-то сломалось.
            if (quota.status === "rejected" && this.tts.engineName !== "windows") {
              parts.push(`остаток лимита недоступен: ${quota.reason.message}`);
            }

            const ok = voices.status === "fulfilled";
            reply(parts.join(". "), ok ? "ok" : "warn");
            log.info("tts", parts.join(". "));
          }
        );
        return;
      case "recent.reset":
        this.recent.reset();
        log.info("recent", "лента последних донатов очищена");
        this.pushRecent();
        return;
      case "goal.refresh":
        this.goal.poll().then(() => {
          this.pushGoal();
          reply("Суммы обновлены");
        });
        return;
      case "config.save":
        this.applyConfig(message.patch).then(
          () => reply("Настройки сохранены", "ok"),
          (error) => reply(`Не сохранилось: ${error.message}`, "warn")
        );
        return;
      case "test.donation": {
        const donation = {
          id: `test-${Date.now()}`,
          source: message.source === "donatello" ? "donatello" : "donationAlerts",
          donorName: message.name || null,
          amount: Number(message.amount) || 0,
          currency: message.currency || this.config.goal.currency || "USD",
          baseAmount: null,
          message: message.message || null,
          at: Date.now(),
          test: true,
        };

        // Вариация выбрана руками — показываем её саму, мимо тиров и порогов.
        if (message.variant) {
          if (!this.config.screamer.enabled) {
            reply("Скримеры выключены — включи их выше", "warn");
            return;
          }
          this.previewScreamer(donation, message.variant);
          return;
        }

        this.onDonation(donation);
        return;
      }
      default:
        reply(`Неизвестная команда: ${message.type}`, "warn");
    }
  }

  handleTimer(message, reply) {
    switch (message.action) {
      case "start": {
        if (!this.raffle.startTimer(message.seconds)) {
          reply("Некорректное время", "warn");
          return;
        }
        log.info("raffle", `таймер на ${message.seconds} с`);
        break;
      }
      case "pause":
        if (!this.raffle.pauseTimer()) return;
        break;
      case "resume":
        if (!this.raffle.resumeTimer()) return;
        break;
      case "stop":
        this.raffle.stopTimer();
        break;
      default:
        return;
    }
    this.scheduleAutoDraw();
    this.pushRaffle();
  }

  // -------------------------------------------------------------- настройки

  async applyConfig(patch) {
    const next = mergeDeep(this.config, patch || {});
    // Порт меняется только перезапуском: сокеты панели живут на старом.
    const portChanged = next.port !== this.config.port;
    this.config = next;
    await saveConfig(next);

    if (next.raffle.axelchatUrl !== this.axelchat.url) {
      this.axelchat.stop();
      this.axelchat = new AxelChatClient(next.raffle.axelchatUrl);
      this._wireAxelChat();
      this.axelchat.start();
    }
    this.raffle.setCommand(next.raffle.command);
    this.raffle.setTheme(next.raffle.theme);
    this.scheduleAutoDraw();

    this.donationAlerts.configure(next.donationAlerts);
    this.donatello.configure(next.donatello);
    this.goal.configure(next.goal, {
      donationAlerts: next.donationAlerts,
      donatello: next.donatello,
    });
    this.nowPlaying.configure(next.nowplaying);
    this.tts.configure(next.tts);

    if (portChanged) log.warn("server", "порт сменится после перезапуска");

    this.pushRaffle();
    this.pushGoal();
    this.hub.broadcast("/ws/alerts", this.alertsHello());
    this.pushTop();
    this.pushRecent();
    this.pushTrack();
    this.hub.broadcast("/ws/screamer", { type: "hello", opacity: next.screamer.opacity });
  }
}

/**
 * Случайный элемент, по возможности не тот же, что в прошлый раз. Пусто —
 * значит медиа у тира нет, и это нормальный случай, а не ошибка.
 */
function pickOne(items, previous) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  const choices = items.filter((item) => item !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

function clamp01(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

// Массивы (тиры алертов) заменяются целиком: иначе удалить тир или валюту
// из панели было бы нельзя.
function mergeDeep(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeDeep(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

