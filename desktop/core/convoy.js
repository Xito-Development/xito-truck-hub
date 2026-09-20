// Modo convoy: los miembros comparten posición y mensajes rápidos por un canal cifrado y gratuito
const { EventEmitter } = require('events');
const crypto = require('crypto');
const mqtt = require('mqtt');
const { enc, dec, BROKERS } = require('./relay');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'CNV-' + Array.from({ length: 8 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('').replace(/(.{4})(.{4})/, '$1-$2');
function derive(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { topic: 'xth/cv/' + crypto.createHash('sha256').update('cv:' + c).digest('hex').slice(0, 24), key: crypto.pbkdf2Sync('cv:' + c, 'xito-truck-hub', 20000, 32, 'sha256') };
}
const COLORS = ['#ffb547', '#45d6c8', '#ff5bd6', '#7aa7ff', '#4fd1a1', '#ff7a59', '#b07cff', '#e5e55b'];

class Convoy extends EventEmitter {
  constructor(store, tracker) {
    super();
    this.store = store; this.tracker = tracker; this.client = null; this.k = null; this.members = new Map(); this.timer = null;
    if (!store.data.settings.convoy) store.data.settings.convoy = {};
    this.me = store.data.settings.convoy.meId || (store.data.settings.convoy.meId = crypto.randomBytes(6).toString('hex'));
    this.lastGapWarn = 0; this.brokerIdx = 0;
  }
  get cfg() { return this.store.data.settings.convoy; }
  create(name) { this.cfg.code = newCode(); this.cfg.leader = true; if (name) this.cfg.name = name; this.store.save(true); this.start(); return this.state(); }
  join(code, name) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c.startsWith('CNV') || c.length !== 11) throw new Error('El código de convoy no es válido (CNV-XXXX-XXXX)');
    this.cfg.code = 'CNV-' + c.slice(3, 7) + '-' + c.slice(7); this.cfg.leader = false; if (name) this.cfg.name = name;
    this.store.save(true); this.start(); return this.state();
  }
  leave() { this.publish({ t: 'bye' }); setTimeout(() => this.stop(), 300); this.cfg.code = ''; this.members.clear(); this.store.save(true); this.emit('update', this.state()); return this.state(); }
  start() {
    this.stop(true);
    if (!this.cfg.code) return;
    this.k = derive(this.cfg.code);
    const cl = mqtt.connect(BROKERS[this.brokerIdx], { clientId: 'xth-cv-' + crypto.randomBytes(4).toString('hex'), connectTimeout: 12000, reconnectPeriod: 8000, keepalive: 45 });
    this.client = cl; this.online = false; let fails = 0;
    cl.on('connect', () => { this.online = true; fails = 0; cl.subscribe(this.k.topic); this.publish({ t: 'hi' }); this.emit('update', this.state()); });
    cl.on('offline', () => { this.online = false; if (++fails >= 3) { this.brokerIdx = (this.brokerIdx + 1) % BROKERS.length; setTimeout(() => this.start(), 500); } });
    cl.on('error', () => {});
    cl.on('message', (_t, payload) => {
      let m; try { m = dec(this.k.key, payload.toString()); } catch { return; }
      if (!m || m.id === this.me) return;
      const known = this.members.has(m.id);
      if (m.t === 'bye') { const x = this.members.get(m.id); this.members.delete(m.id); if (x) this.emit('msg', { kind: 'leave', name: x.name }); }
      else if (m.t === 'msg') this.emit('msg', { kind: 'msg', name: m.name, text: String(m.text || '').slice(0, 120) });
      else {
        if (m.t === 'pos' || m.t === 'hi') this.members.set(m.id, { ...(this.members.get(m.id) || {}), ...m, seen: Date.now() });
        if (!known && m.name) this.emit('msg', { kind: 'join', name: m.name });
        if (m.t === 'hi') this.publishPos();
      }
      this.emit('update', this.state());
    });
    this.timer = setInterval(() => this.tick(), 2000);
  }
  stop(silent) { clearInterval(this.timer); if (this.client) { try { this.client.end(true); } catch {} this.client = null; } this.online = false; if (!silent) this.emit('update', this.state()); }
  publish(m) { if (!this.client || !this.online) return; try { this.client.publish(this.k.topic, enc(this.k.key, { ...m, id: this.me, name: this.cfg.name || 'Conductor', leader: !!this.cfg.leader })); } catch {} }
  publishPos() {
    const t = this.tracker.live;
    if (!t || !t.truck) return this.publish({ t: 'pos', off: true });
    this.publish({ t: 'pos', x: Math.round(t.truck.x), z: Math.round(t.truck.z), h: t.truck.heading, spd: Math.round(t.truck.speed), game: t.game, dest: t.job?.onJob ? t.job.toCity : '', cargo: t.job?.onJob ? t.job.cargo : '', tmpId: this.store.data.settings.tmpId || null, off: !(t.sdk && this.tracker.status?.state === 'connected') });
  }
  sendMsg(text) { this.publish({ t: 'msg', text }); this.emit('msg', { kind: 'msg', name: this.cfg.name || 'Tú', text, mine: true }); }
  tick() {
    for (const [id, m] of this.members) if (Date.now() - m.seen > 25000) { this.members.delete(id); this.emit('msg', { kind: 'leave', name: m.name }); }
    this.publishPos();
    const st = this.state();
    // ¿Te has quedado atrás (o se ha quedado alguien)?
    const gap = +(this.cfg.maxGap || 5);
    if (Date.now() - this.lastGapWarn > 120000) {
      if (!this.cfg.leader) { const L = st.members.find((m) => m.leader); if (L && L.dist != null && L.dist > gap) { this.lastGapWarn = Date.now(); this.emit('alert', { id: 'convoy-gap', title: 'Te estás quedando atrás', text: `${L.name} (líder) va a ${L.dist.toFixed(1).replace('.', ',')} km`, level: 'warn', at: Date.now() }); } }
      else { const far = st.members.filter((m) => m.dist != null && m.dist > gap && !m.off); if (far.length) { this.lastGapWarn = Date.now(); this.emit('alert', { id: 'convoy-gap', title: 'Alguien se ha quedado atrás', text: far.map((m) => `${m.name} a ${m.dist.toFixed(1).replace('.', ',')} km`).join(', '), level: 'warn', at: Date.now() }); } }
    }
    this.emit('update', st);
  }
  state() {
    const t = this.tracker.live?.truck;
    const list = [...this.members.values()].map((m, i) => {
      const dx = t && m.x != null ? m.x - t.x : null, dz = t && m.z != null ? m.z - t.z : null;
      const dist = dx != null ? Math.hypot(dx, dz) / 1000 : null;
      // Rumbo relativo (grados): 0 = delante
      let rel = null;
      if (dx != null && t) { const h = (t.heading || 0) * Math.PI * 2; const fx = -Math.sin(h), fz = -Math.cos(h); rel = Math.round((Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 180) / Math.PI); }
      return { id: m.id, name: m.name, leader: !!m.leader, x: m.x, z: m.z, spd: m.spd, dest: m.dest, cargo: m.cargo, tmpId: m.tmpId, off: !!m.off, dist, rel, color: COLORS[i % COLORS.length] };
    }).sort((a, b) => (b.leader - a.leader) || ((a.dist ?? 1e9) - (b.dist ?? 1e9)));
    return { active: !!this.cfg.code, code: this.cfg.code || '', leader: !!this.cfg.leader, name: this.cfg.name || '', online: !!this.online, members: list, maxGap: +(this.cfg.maxGap || 5) };
  }
}
module.exports = Convoy;
