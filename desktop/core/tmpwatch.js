// Vigilancia de TruckersMP: amigos que se conectan, compañeros de la VTC en el mapa y recordatorios de eventos
const { EventEmitter } = require('events');
const world = require('./world');
const TMP = require('./tmp');

const parseUtc = (s) => new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')).getTime();

class TmpWatch extends EventEmitter {
  constructor(store, tracker) {
    super();
    this.store = store; this.tracker = tracker;
    this.onlineFriends = new Set(); this.first = true; this.vtcOnline = []; this.vtcIds = null; this.vtcAt = 0;
    this.reminded = {}; this.events = []; this.eventsAt = 0; this.nearWarn = {};
  }
  get S() { return this.store.data.settings; }
  start() { const loop = async () => { try { await this.tick(); } catch {} this.timer = setTimeout(loop, 45000); }; this.timer = setTimeout(loop, 8000); }
  stop() { clearTimeout(this.timer); }
  alert(a) { if (this.S.alerts?.tmp === false) return; this.emit('alert', { level: 'info', at: Date.now(), ...a }); }

  async tick() {
    const map = await world.fullmap().catch(() => null);
    if (map) {
      // Amigos que acaban de conectarse
      const now = new Set();
      for (const f of this.S.friends || []) {
        const p = map.find((x) => x.MpId === f.id);
        if (p) { now.add(f.id); if (!this.first && !this.onlineFriends.has(f.id)) this.alert({ id: 'friend-' + f.id, kind: 'tmp', title: `${f.name || p.Name} se ha conectado`, text: 'Tu amigo está conduciendo en TruckersMP.' }); }
      }
      this.onlineFriends = now;
      // Compañeros de la VTC conectados
      const vtcId = this.S.vtcId;
      if (vtcId && (!this.vtcIds || Date.now() - this.vtcAt > 30 * 60000)) {
        try { const r = await TMP.vtcMembers(vtcId); this.vtcIds = new Map((r.members || []).map((m) => [m.user_id, m])); this.vtcAt = Date.now(); } catch {}
      }
      const me = Number(this.S.tmpId);
      const t = this.tracker.live?.truck;
      this.vtcOnline = this.vtcIds ? map.filter((p) => this.vtcIds.has(p.MpId) && p.MpId !== me).map((p) => {
        const m = this.vtcIds.get(p.MpId);
        const dist = t && (t.x || t.z) ? Math.hypot(p.X - t.x, p.Y - t.z) / 1000 : null;
        return { id: p.MpId, name: m.username || p.Name, role: m.role, x: p.X, y: p.Y, server: p.ServerId, dist };
      }) : [];
      for (const v of this.vtcOnline) {
        if (v.dist != null && v.dist < 2.5 && Date.now() - (this.nearWarn[v.id] || 0) > 15 * 60000) {
          this.nearWarn[v.id] = Date.now();
          this.alert({ id: 'vtcnear-' + v.id, kind: 'tmp', title: `${v.name} está cerca`, text: `Compañero de tu VTC a ${v.dist.toFixed(1).replace('.', ',')} km. ¡Salúdale!` });
        }
      }
      this.first = false;
      this.emit('vtc', this.vtcOnline);
    }
    // Recordatorios de eventos a los que te has apuntado y de tu VTC
    if (Date.now() - this.eventsAt > 10 * 60000) {
      const list = [];
      if (this.S.tmpId) try { list.push(...(await TMP.userEvents(this.S.tmpId)) || []); } catch {}
      if (this.S.vtcId) try { list.push(...(await TMP.vtcEvents(this.S.vtcId)) || []); } catch {}
      this.events = list.filter((e, i, a) => e && e.start_at && a.findIndex((x) => x.id === e.id) === i);
      this.eventsAt = Date.now();
    }
    for (const e of this.events) {
      const mins = (parseUtc(e.start_at) - Date.now()) / 60000;
      for (const th of [30, 5]) {
        const k = `${e.id}-${th}`;
        if (mins <= th && mins > th - 6 && !this.reminded[k]) {
          this.reminded[k] = true;
          this.alert({ id: 'event-' + k, kind: 'tmp', title: th === 5 ? `«${e.name}» empieza ya` : `«${e.name}» empieza en 30 min`, text: `${e.server?.name || ''} · salida desde ${e.departure?.city || '?'}`, level: th === 5 ? 'warn' : 'info' });
        }
      }
    }
  }
}
module.exports = TmpWatch;
