// Tráfico de TruckersMP: mapa en vivo (tracker.ets2map.com) + zonas concurridas (traffic.krashnz.com)
const { EventEmitter } = require('events');
const UA = { 'User-Agent': 'XitoTruckHub/1.0' };
const ALIAS = {
  praga: 'prague', munich: 'munchen', colonia: 'koln', cologne: 'koln', viena: 'vienna', lisboa: 'lisbon', varsovia: 'warsaw',
  bruselas: 'brussels', estocolmo: 'stockholm', copenhague: 'copenhagen', ginebra: 'geneva', milan: 'milano', roma: 'rome',
  venecia: 'venezia', turin: 'torino', florencia: 'firenze', napoles: 'napoli', genova: 'genova', burdeos: 'bordeaux',
  marsella: 'marseille', estrasburgo: 'strasbourg', londres: 'london', edimburgo: 'edinburgh', francfort: 'frankfurt am main',
  frankfurt: 'frankfurt am main', hamburgo: 'hamburg', berlin: 'berlin', dresde: 'dresden', nuremberg: 'nurnberg', zurich: 'zurich',
  basilea: 'basel', berna: 'bern', atenas: 'athens', bucarest: 'bucharest', belgrado: 'belgrade', sofia: 'sofia', amberes: 'antwerp',
  lieja: 'liege', gante: 'gent', la_haya: 'den haag', rotterdam: 'rotterdam', amsterdam: 'amsterdam', dusseldorf: 'dusseldorf',
  hannover: 'hannover', leipzig: 'leipzig', estambul: 'istanbul', oporto: 'porto', sevilla: 'sevilla', zaragoza: 'zaragoza'
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const key = (s) => { const n = norm(s); return ALIAS[n.replace(/ /g, '_')] || n; };

class Traffic extends EventEmitter {
  constructor(store, tracker) {
    super();
    this.store = store; this.tracker = tracker;
    this.hot = null; this.nearby = null; this.me = null; this.lastAlert = {}; this.timer = null;
  }
  start() {
    const loop = async () => {
      try { await this.tick(); } catch (e) { /* sin red: se reintenta */ }
      this.timer = setTimeout(loop, 15000);
    };
    loop();
  }
  stop() { clearTimeout(this.timer); }

  async hotspots() {
    if (this.hot && Date.now() - this.hot.t < 60000) return this.hot.v;
    const r = await fetch('https://traffic.krashnz.com/api/v4/traffic', { headers: UA, signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    this.hot = { t: Date.now(), v: j.servers || [] };
    return this.hot.v;
  }
  async overviewMerged(hot) {
    try {
      if (!this.ov || Date.now() - this.ov.t > 60000) {
        const r = await fetch('https://traffic.krashnz.com/api/v4/overview', { headers: UA, signal: AbortSignal.timeout(12000) });
        this.ov = { t: Date.now(), v: (await r.json()).tmp || [] };
      }
    } catch { this.ov = this.ov || { t: 0, v: [] }; }
    return hot.map((h) => ({ ...h, players: (this.ov.v.find((o) => o.id === h.id) || {}).players }));
  }
  async serverDetail(game, url) {
    const r = await fetch(`https://traffic.krashnz.com/api/v4/server/${encodeURIComponent(game)}/${encodeURIComponent(url)}`, { headers: UA, signal: AbortSignal.timeout(12000) });
    return r.json();
  }

  async tick() {
    const t = this.tracker.live;
    const live = t && t.sdk && this.tracker.status?.state === 'connected';
    if (!live) { if (this.nearby) { this.nearby = null; this.emit('update', null); } return; }
    const hot = await this.hotspots().catch(() => []);
    // Posición de todos los jugadores de TruckersMP
    let map = [];
    const needMap = this.store.data.settings.tmpId || this.store.data.settings.demo;
    if (needMap) try {
      const r = await fetch('https://tracker.ets2map.com/v3/fullmap', { headers: UA, signal: AbortSignal.timeout(12000) });
      map = (await r.json()).Data || [];
    } catch {}
    const tmpId = Number(this.store.data.settings.tmpId);
    this.me = map.find((p) => p.MpId === tmpId) || null;
    if (!this.me && this.store.data.settings.demo && map.length) {
      // En modo demostración se simula estar en la zona más concurrida de Simulation 1
      if (!this.demoMe) { const s1 = map.filter((p) => p.ServerId === 2); this.demoMe = s1[Math.floor(Math.random() * s1.length)]; }
      this.me = this.demoMe ? { ...this.demoMe, MpId: -1 } : null;
    }
    const x = this.me ? this.me.X : t.truck.x, z = this.me ? this.me.Y : t.truck.z;
    const serverId = this.me?.ServerId ?? null;
    const players = serverId != null ? map.filter((p) => p.ServerId === serverId && p.MpId !== tmpId) : [];
    const h = (t.truck.heading || 0) * Math.PI * 2;
    const fx = -Math.sin(h), fz = -Math.cos(h);
    let around = 0; const ahead = [];
    for (const p of players) {
      const dx = p.X - x, dz = p.Y - z, d = Math.hypot(dx, dz);
      if (d < 700) around++;
      else if (d < 5000 && (dx * fx + dz * fz) / d > 0.82) ahead.push(d);
    }
    ahead.sort((a, b) => a - b);
    const aheadDist = ahead.length ? ahead[Math.floor(ahead.length / 2)] : null;
    const serverHot = this.matchServer(serverId, map, await this.overviewMerged(hot));
    this.nearby = {
      online: !!this.me, serverId, around, ahead: ahead.length, aheadKm: aheadDist ? aheadDist / 1000 : null,
      level: around >= 25 ? 'congested' : around >= 10 ? 'heavy' : around >= 4 ? 'moderate' : 'low',
      server: serverHot ? { name: serverHot.longName, url: serverHot.url, game: serverHot.game, top: serverHot.traffic } : null,
      at: Date.now()
    };
    this.emit('update', this.nearby);
    this.alerts(t, hot, serverHot);
  }

  // Los IDs de Krashnz no son los del mapa: se emparejan por tipo de juego y número de jugadores
  matchServer(serverId, map, hot) {
    if (serverId == null) return null;
    const mine = map.filter((p) => p.ServerId === serverId);
    if (!mine.length) return null;
    const type = mine[0].ServerType, count = mine.length + 1;
    const game = { 1: 'ets2', 2: 'ats', 3: 'promods' }[type];
    let best = null;
    for (const h of hot.filter((x) => x.game === game)) {
      const players = h.players ?? (h.percent != null ? null : null);
      const c = players ?? (h.traffic || []).reduce((a, l) => a + (l.players || 0), 0);
      const diff = Math.abs(c - count) / Math.max(c, count, 1);
      if (!best || diff < best.diff) best = { h, diff };
    }
    return best ? best.h : null;
  }

  alert(id, title, text, level = 'warn', cooldown = 240000) {
    if (this.store.data.settings.alerts?.traffic === false) return;
    if (Date.now() - (this.lastAlert[id] || 0) < cooldown) return;
    this.lastAlert[id] = Date.now();
    this.emit('alert', { id, title, text, level, at: Date.now() });
  }

  alerts(t, hot, serverHot) {
    const n = this.nearby;
    if (n.ahead >= 12 && n.aheadKm) this.alert('ahead', 'Te acercas a un punto congestionado', `${n.ahead} camiones a unos ${n.aheadKm.toFixed(1).replace('.', ',')} km`, 'bad');
    else if (n.ahead >= 6 && n.aheadKm) this.alert('ahead-mid', 'Tráfico denso más adelante', `${n.ahead} camiones a unos ${n.aheadKm.toFixed(1).replace('.', ',')} km`, 'warn');
    if (n.around >= 25) this.alert('around', 'Zona muy concurrida', `${n.around} jugadores a tu alrededor. Conduce con cuidado.`, 'bad', 300000);
    const j = t.job;
    const list = serverHot?.traffic || [];
    if (j && j.onJob && list.length) {
      const dest = list.find((l) => key(l.name) === key(j.toCity) || key(l.name) === key(j.toCityId));
      if (dest && (dest.severity === 'congested' || dest.severity === 'heavy'))
        this.alert('dest-' + dest.id, `Tu destino está ${dest.severity === 'congested' ? 'congestionado' : 'muy transitado'}`, `${dest.name}: ${dest.players} jugadores ahora mismo`, dest.severity === 'congested' ? 'bad' : 'warn', 900000);
    }
  }

  onJobStarted(job) {
    const list = (this.nearby?.server?.top) || [];
    const road = list.find((l) => l.type === 'road');
    if (road) this.alert('popular-' + road.id, 'Ruta más concurrida ahora', `${road.name} · ${road.players} jugadores`, 'info', 600000);
  }
}
Traffic.key = key;
Traffic.norm = norm;
module.exports = Traffic;
