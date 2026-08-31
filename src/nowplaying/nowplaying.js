// «Сейчас играет»: одна служба поверх двух источников — медиасессии Windows и
// текстового файла плеера. Наружу отдаёт один текущий трек и следит, чтобы
// оверлей дёргался только когда трек и правда сменился.
//
// Обложка ищется отдельно и приходит позже самого трека: каталог отвечает за
// сотни миллисекунд, а название на экране должно смениться сразу. Поэтому смен
// на оверлее на один трек бывает две — сначала текст, потом он же с картинкой.

import { EventEmitter } from "node:events";

import { SystemMediaSource } from "./system.js";
import { FileTrackSource } from "./file.js";
import { Covers } from "./cover.js";
import { normalizeTrack, sameTrack, trackSnapshot, trackLabel } from "./track.js";

export class NowPlaying extends EventEmitter {
  constructor(config, covers = new Covers()) {
    super();
    this.config = config;
    this.covers = covers;

    this.current = null;
    // Что видно системе — список для панели: по нему стример выбирает, что
    // писать в фильтр приложения.
    this.apps = [];
    this.source = null;
    this.started = false;
    // Отвечает каталог не мгновенно, а трек за это время мог смениться. Чтобы
    // обложка не прилипла к следующей песне, ответ сверяется с этим номером.
    this.lookupId = 0;
  }

  get enabled() {
    return Boolean(this.config.enabled);
  }

  /** Что показывать в панели: «работает», «нет связи» или «выключено». */
  get status() {
    if (!this.enabled) return "off";
    return this.source?.status ?? "off";
  }

  start() {
    this.started = true;
    this._openSource();
  }

  stop() {
    this.started = false;
    this._closeSource();
    // Рассылать тишину, когда её и так не было, незачем: оверлей уже пуст.
    if (this.current) this._setTrack(null);
  }

  configure(config) {
    const sourceChanged = config.source !== this.config.source;
    const enabledChanged = Boolean(config.enabled) !== Boolean(this.config.enabled);
    const coverOff = this.config.cover && !config.cover;
    this.config = config;

    if (!this.started) return;

    if (sourceChanged || enabledChanged) {
      this._closeSource();
      this._openSource();
      return;
    }

    // Обложки выключили — снимаем и с того, что уже на экране.
    if (coverOff && this.current) {
      this.current = { ...this.current, cover: null };
      this.emit("change", this.current);
    } else if (!coverOff && config.cover && this.current && !this.current.cover) {
      // И наоборот: включили — ищем для того, что играет прямо сейчас.
      this._findCover(this.current);
    }

    this.source?.configure(config);
  }

  snapshot(theme) {
    return trackSnapshot(this.current, this.config, theme);
  }

  // ------------------------------------------------------------- источник

  _openSource() {
    if (!this.enabled) {
      this.emit("status", "off");
      return;
    }

    this.source =
      this.config.source === "file"
        ? new FileTrackSource(this.config)
        : new SystemMediaSource(this.config);

    this.source.on("track", (raw) => this._onRawTrack(raw));
    this.source.on("status", (status) => this.emit("status", status));
    this.source.on("log", (text) => this.emit("log", text));
    // Список приложений даёт только медиасессия — у файла его взяться неоткуда.
    this.source.on("apps", (apps) => {
      this.apps = apps;
      this.emit("apps", apps);
    });

    this.source.start();
  }

  _closeSource() {
    if (!this.source) return;
    this.source.stop();
    this.source.removeAllListeners();
    this.source = null;
    this.apps = [];
  }

  _onRawTrack(raw) {
    const next = normalizeTrack(raw);
    if (sameTrack(next, this.current)) return;

    // Тот же трек, но сняли с паузы (или поставили) — обложку заново не ищем:
    // она уже найдена и осталась той же.
    const sameSong =
      next && this.current && next.title === this.current.title && next.artist === this.current.artist;
    if (sameSong) next.cover = this.current.cover;

    this._setTrack(next);
    if (next && !next.cover && this.config.cover) this._findCover(next);
  }

  _setTrack(track) {
    this.current = track;
    this.lookupId += 1;
    this.emit("change", track);
    this.emit("log", trackLabel(track));
  }

  _findCover(track) {
    const id = this.lookupId;
    this.covers.find(track.artist, track.title, track.album).then((url) => {
      // Пока искали, трек сменился — эта обложка уже ничья.
      if (!url || id !== this.lookupId || this.current !== track) return;
      this.current = { ...track, cover: url };
      this.emit("change", this.current);
    });
  }
}
