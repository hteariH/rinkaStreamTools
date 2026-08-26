// Сборка приложения: состояние розыгрыша, источники донатов, цель сбора и хаб
// сокетов. Здесь же живёт протокол панели управления — единственное место, куда
// приходят команды снаружи.

import { existsSync } from "node:fs";
import path from "node:path";

import { Hub } from "./server.js";
import { PUBLIC_DIR } from "./paths.js";
import { log } from "./log.js";
import { saveConfig } from "./config.js";
import { Raffle } from "./raffle/raffle.js";
import { AxelChatClient } from "./raffle/axelchat.js";
import { DonationAlertsSource } from "./donations/donationalerts.js";
import { DonatelloSource } from "./donations/donatello.js";
import { Goal } from "./donations/goal.js";
import { passesThreshold } from "./donations/rules.js";

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

    this.hub = new Hub(
      config.port,
      {
        "/ws/raffle": () => this.raffle.snapshot(),
        "/ws/goal": () => this.goal.snapshot(),
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
    if (!donation.test) this.refreshGoalSoon();

    if (this.config.alerts.enabled && donation.amount >= (Number(this.config.alerts.minAmount) || 0)) {
      this.hub.broadcast("/ws/alerts", {
        ...donation,
        type: "alert",
        durationMs: Number(this.config.alerts.durationMs) || 7000,
      });
    }

    if (this.config.screamer.enabled && passesThreshold(donation, this.config.screamer)) {
      this.hub.broadcast("/ws/screamer", {
        ...donation,
        type: "screamer",
        tier: "full",
        durationMs: Number(this.config.screamer.durationMs) || 5000,
        variant: donation.variant || undefined,
      });
    }
  }

  /**
   * Приветствие оверлею алертов. Наличие звука проверяет сервер, а не страница:
   * иначе каждый запуск оверлея писал бы 404 в консоль браузера и в лог OBS.
   */
  alertsHello() {
    return {
      type: "hello",
      durationMs: this.config.alerts.durationMs,
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

  // ------------------------------------------------------------- рассылка

  pushRaffle() {
    this.hub.broadcast("/ws/raffle", this.raffle.snapshot());
    this.pushControl();
  }

  pushGoal() {
    this.hub.broadcast("/ws/goal", this.goal.snapshot());
    this.pushControl();
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
      case "test.donation":
        this.onDonation({
          id: `test-${Date.now()}`,
          source: message.source === "donatello" ? "donatello" : "donationAlerts",
          donorName: message.name || null,
          amount: Number(message.amount) || 0,
          currency: message.currency || this.config.goal.currency || "USD",
          baseAmount: null,
          message: message.message || null,
          at: Date.now(),
          variant: message.variant || undefined,
          test: true,
        });
        return;
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
    this.hub.broadcast("/ws/screamer", { type: "hello", opacity: next.screamer.opacity });
  }
}

// minAmounts заменяется целиком: иначе удалить валюту из панели было бы нельзя.
function mergeDeep(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && key !== "minAmounts") {
      out[key] = mergeDeep(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

