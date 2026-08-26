// Сборка приложения: состояние розыгрыша, источники донатов, цель сбора и хаб
// сокетов. Здесь же живёт протокол панели управления — единственное место, куда
// приходят команды снаружи.

import { existsSync } from "node:fs";
import path from "node:path";

import { Hub } from "./server.js";
import { PUBLIC_DIR, DONORS_PATH } from "./paths.js";
import { log } from "./log.js";
import { saveConfig } from "./config.js";
import { Raffle } from "./raffle/raffle.js";
import { AxelChatClient } from "./raffle/axelchat.js";
import { DonationAlertsSource } from "./donations/donationalerts.js";
import { DonatelloSource } from "./donations/donatello.js";
import { Goal } from "./donations/goal.js";
import { Donors } from "./donations/donors.js";
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

    this.hub = new Hub(
      config.port,
      {
        "/ws/raffle": () => this.raffle.snapshot(),
        "/ws/goal": () => this.goal.snapshot(),
        "/ws/top": () => this.topSnapshot(),
        // Алерты и скримеры — поток событий, начального состояния у них нет:
        // оверлей, подключившийся после доната, показывать его задним числом не должен.
        "/ws/alerts": () => this.alertsHello(),
        "/ws/screamer": () => ({ type: "hello", opacity: this.config.screamer.opacity }),
        "/ws/control": () => this.controlState(),
      },
      (channel, message, ws) => {
        if (channel === "/ws/control") this.handleCommand(message, ws);
      }
    );
  }

  async start() {
    await this.donors.load();
    await this.hub.start();

    this._wireAxelChat();
    this._wireSource("donationAlerts", this.donationAlerts);
    this._wireSource("donatello", this.donatello);

    this.axelchat.start();
    this.donationAlerts.start();
    this.donatello.start();
    this.goal.start();

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
  onDonation(donation) {
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
      this.pushTop();
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

    this.hub.broadcast("/ws/alerts", {
      ...donation,
      type: "alert",
      tier: tier.id,
      tierName: tier.name,
      durationMs: Number(tier.durationMs) || 7000,
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
    return this.donors.snapshot(
      this.config.top,
      this.config.goal.currency || "USD",
      this.config.goal.theme || "default"
    );
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
      top: this.topSnapshot(),
      status: {
        axelchat: this.axelchatStatus,
        donationAlerts: this.donationAlerts.enabled ? this.donationAlerts.status : "off",
        donatello: this.donatello.enabled ? this.donatello.status : "off",
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
      case "top.reset":
        this.donors.reset();
        log.info("top", "таблица донатеров очищена");
        this.pushTop();
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

    if (portChanged) log.warn("server", "порт сменится после перезапуска");

    this.pushRaffle();
    this.pushGoal();
    this.hub.broadcast("/ws/alerts", this.alertsHello());
    this.pushTop();
    this.hub.broadcast("/ws/screamer", { type: "hello", opacity: next.screamer.opacity });
  }
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

