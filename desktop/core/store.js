// Almacén local en JSON (sin dependencias nativas)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Fecha local AAAA-MM-DD (no UTC: a medianoche en España cambiaría de día antes de tiempo)
function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const emptyDay = () => ({ km: 0, revenue: 0, jobs: 0, fuel: 0, fines: 0, driveSec: 0, xp: 0 });

const DEFAULTS = () => ({
  version: 3,
  settings: {
    theme: 'autopista',
    tmpId: null,
    vtcId: null,
    pin: String(crypto.randomInt(100000, 999999)),
    autoStart: false,
    startMinimized: false,
    demo: false,
    wizardDone: false,
    units: 'metric',
    overlay: {
      enabled: true, opacity: 0.95, scale: 1, corner: 'br',
      bounds: null,
      show: { speed: true, job: true, fuel: true, damage: false, clock: true, toasts: true, traffic: true, alerts: true },
      style: 'hud',
      pauseMini: true,
      mapRotate: true, mapZoom: 1,
      widgets: {
        speed: { on: true, x: 1.5, y: 66 }, lamps: { on: true, x: 1.5, y: 93 }, nav: { on: true, x: 79, y: 64 },
        messages: { on: true, x: 79, y: 44 }, finance: { on: true, x: 79, y: 36 }, damage: { on: false, x: 13, y: 80 },
        job: { on: true, x: 38, y: 2 }, tacho: { on: true, x: 15, y: 86 }, convoy: { on: true, x: 1.5, y: 30 }, fuel: { on: true, x: 15, y: 77 }
      }
    },
    alerts: {
      rest: true, fuel: true, speeding: true, damage: true, traffic: true,
      speedTolerance: 8, fuelKm: 120, restMinutes: 60, damageJump: 3,
      sound: true, voice: false, volume: 0.6, target: 'pc', pack: 'suave', rules: true, system: true
    },
    remote: { enabled: false, code: '', broker: '' },
    tacho: { enabled: true, blockMin: 270, breakMin: 45, dayMin: 540, restMin: 540 },
    vtcBot: { enabled: false, url: '', token: '', discordId: '', driverName: '' },
    language: 'es',
    clock: 'auto', // auto | game | tmp | real
    discord: { webhook: '', onDelivery: true, onCancel: true, onFine: false, rpc: false, appId: '' },
    appearance: {
      accent: '', density: 'normal', radius: 1, fontScale: 1, motion: true, startPage: 'cabina',
      clock24: true, glow: true, compactNav: false,
      cockpit: { hero: true, job: true, tanks: true, damage: true, controls: true, session: true, goals: true }
    },
    units: { speed: 'kmh', temp: 'c', volume: 'l', weight: 't' },
    costs: { fuelPrice: 1.6 },
    goals: { dailyKm: 500, weeklyKm: 3000, weeklyRevenue: 150000, weeklyJobs: 15 },
    friends: [],
    updates: { repo: 'Xito-Development/xito-truck-hub', check: true, url: '' },
    map: { layer: true, follow: true, trail: true, labels: true, server: 'auto' }
  },
  trail: [],
  cities: {},
  totals: { km: 0, driveSec: 0, fuel: 0 },
  days: {},
  jobs: [],
  events: [],
  achievements: [],
  current: null
});

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function deepMerge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (isObj(extra[k]) && isObj(base[k])) deepMerge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'xito-truckhub-data.json');
    this.data = DEFAULTS();
    this._t = null;
    let loaded = null;
    for (const f of [this.file, this.file + '.bak']) {
      try { if (fs.existsSync(f)) { loaded = JSON.parse(fs.readFileSync(f, 'utf8')); break; } }
      catch { try { fs.copyFileSync(f, f + '.corrupto-' + Date.now()); } catch {} }
    }
    if (loaded) deepMerge(this.data, loaded);
    this.migrate();
  }
  migrate() {
    const d = this.data;
    if (!Array.isArray(d.jobs)) d.jobs = [];
    if (!Array.isArray(d.events)) d.events = [];
    if (!Array.isArray(d.achievements)) d.achievements = [];
    if (!isObj(d.days)) d.days = {};
    if (!Array.isArray(d.trail)) d.trail = [];
    if (!isObj(d.cities)) d.cities = {};
    if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
    if (d.settings.theme === 'alboran') d.settings.theme = 'costa';
    if (d.settings.updates && !d.settings.updates.repo) d.settings.updates.repo = 'Xito-Development/xito-truck-hub';
    d.version = 3;
  }
  save(now = false) {
    const write = () => {
      clearTimeout(this._t); this._t = null;
      try {
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        // Copia de seguridad del último guardado correcto
        if (fs.existsSync(this.file)) { try { fs.copyFileSync(this.file, this.file + '.bak'); } catch {} }
        fs.renameSync(tmp, this.file);
      } catch (e) { console.error('[store]', e.message); }
    };
    if (now) write(); else if (!this._t) this._t = setTimeout(write, 3000);
  }
  day(date = new Date()) {
    const k = dayKey(date);
    if (!this.data.days[k]) this.data.days[k] = emptyDay();
    return this.data.days[k];
  }
  updateSettings(patch) {
    const allowed = ['theme', 'tmpId', 'vtcId', 'autoStart', 'startMinimized', 'demo', 'wizardDone', 'overlay', 'alerts', 'discord', 'units', 'appearance', 'goals', 'friends', 'updates', 'map', 'remote', 'language', 'tacho', 'vtcBot', 'costs', 'clock'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    // Normaliza IDs (solo números) y valores numéricos
    for (const k of ['tmpId', 'vtcId']) {
      if (k in clean) { const v = String(clean[k] ?? '').replace(/\D/g, ''); clean[k] = v ? Number(v) : null; }
    }
    if (isObj(clean.overlay)) {
      if ('opacity' in clean.overlay) clean.overlay.opacity = Math.min(1, Math.max(0.3, +clean.overlay.opacity || 0.95));
      if ('scale' in clean.overlay) clean.overlay.scale = Math.min(2, Math.max(0.5, +clean.overlay.scale || 1));
    }
    if (Array.isArray(clean.friends)) {
      clean.friends = clean.friends.map((f) => ({ id: Number(String(f.id).replace(/\D/g, '')), name: String(f.name || '').slice(0, 40), avatar: String(f.avatar || '') }))
        .filter((f, i, a) => f.id > 0 && a.findIndex((x) => x.id === f.id) === i).slice(0, 100);
    }
    if (isObj(clean.updates) && 'repo' in clean.updates) {
      const m = String(clean.updates.repo || '').trim().match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
      clean.updates.repo = m ? m[1] : '';
    }
    if (isObj(clean.appearance) && 'accent' in clean.appearance && !/^#[0-9a-f]{6}$/i.test(clean.appearance.accent || '')) clean.appearance.accent = '';
    if (isObj(clean.discord) && 'webhook' in clean.discord) {
      const w = String(clean.discord.webhook || '').trim();
      clean.discord.webhook = /^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/webhooks\//.test(w) ? w : '';
    }
    deepMerge(this.data.settings, clean);
    this.save();
    return this.data.settings;
  }
}
Store.dayKey = dayKey;
Store.emptyDay = emptyDay;
module.exports = Store;
