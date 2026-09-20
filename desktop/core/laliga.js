// Bloqueos de LaLiga: durante los partidos se bloquean IPs de Cloudflare en España y
// TruckersMP (web, API y a veces el propio juego online) deja de funcionar.
// Fuente: https://hayahora.futbol (misma lógica que usa su web para decir «hay fútbol»).
const { EventEmitter } = require('events');
const KEY_IPS = ['188.114.96.5', '188.114.97.5'];

class LaLiga extends EventEmitter {
  constructor(store) {
    super();
    this.store = store; this.etag = null;
    this.state = { blocked: false, since: null, lastCheck: 0, blockedIps: 0, source: 'https://hayahora.futbol/', error: '' };
  }
  get enabled() { return this.store.data.settings.alerts?.laliga !== false; }
  start() {
    const loop = async () => {
      if (this.enabled) { try { await this.check(); } catch (e) { this.state.error = e.message; } }
      // Más a menudo mientras dura el bloqueo, para avisar en cuanto termine
      this.timer = setTimeout(loop, this.state.blocked ? 2 * 60000 : 5 * 60000);
    };
    this.timer = setTimeout(loop, 6000);
  }
  stop() { clearTimeout(this.timer); }
  async check() {
    const headers = { 'User-Agent': 'XitoTruckHub (aviso de bloqueos)' };
    if (this.etag) headers['If-None-Match'] = this.etag;
    const r = await fetch('https://hayahora.futbol/estado/data.json', { headers, signal: AbortSignal.timeout(30000) });
    this.state.lastCheck = Date.now(); this.state.error = '';
    if (r.status === 304) return;
    if (!r.ok) throw new Error(`hayahora.futbol respondió ${r.status}`);
    this.etag = r.headers.get('etag');
    const j = await r.json();
    const perIp = new Map(), keyHit = new Set(), all = new Set();
    for (const row of j.data || []) {
      const last = row.stateChanges && row.stateChanges[row.stateChanges.length - 1];
      if (!last || last.state !== true) continue;
      all.add(row.ip);
      if (row.description === 'Cloudflare') { perIp.set(row.ip, (perIp.get(row.ip) || 0) + 1); if (KEY_IPS.includes(row.ip)) keyHit.add(row.ip); }
    }
    const widespread = [...perIp.values()].filter((n) => n > 2).length;
    const blocked = widespread > 10 || KEY_IPS.every((ip) => keyHit.has(ip));
    const was = this.state.blocked;
    this.state.blocked = blocked; this.state.blockedIps = all.size; this.state.updated = j.lastUpdate || null;
    if (blocked && !was) {
      this.state.since = Date.now();
      this.emit('alert', { id: 'laliga-on', title: 'TruckersMP caído temporalmente en España', text: 'Hay fútbol y LaLiga está bloqueando IPs de Cloudflare. La web, la API y los servidores de TruckersMP pueden fallar hasta que termine.', level: 'bad', at: Date.now(), kind: 'laliga' });
    } else if (!blocked && was) {
      const mins = this.state.since ? Math.round((Date.now() - this.state.since) / 60000) : null;
      this.state.since = null;
      this.emit('alert', { id: 'laliga-off', title: 'Se acabó el bloqueo del fútbol', text: `TruckersMP vuelve a funcionar con normalidad en España${mins ? ` (duró unos ${mins} min)` : ''}.`, level: 'good', at: Date.now(), kind: 'laliga' });
    }
    this.emit('update', this.state);
  }
}
module.exports = LaLiga;
