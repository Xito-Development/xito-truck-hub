// Integración con Discord: webhook de entregas y Rich Presence (estado en el perfil)
const net = require('net');
const TMP = require('./tmp');

class Discord {
  constructor(store, tracker) {
    this.store = store; this.tracker = tracker;
    this.sock = null; this.ready = false; this.connecting = false; this.buf = Buffer.alloc(0);
    this.sessionStart = Date.now(); this.lastPresence = 0; this.timer = null;
    tracker.on('job', (j) => this.onJob(j));
    tracker.on('ev', (e) => { if (e.type === 'fined' && !e.demo) this.onFine(e); });
  }
  get cfg() { return this.store.data.settings.discord || {}; }

  // ---------- webhook ----------
  async driverName() {
    const id = this.store.data.settings.tmpId;
    if (!id) return null;
    try { return (await TMP.player(id)).name; } catch { return null; }
  }
  async post(payload) {
    const url = this.cfg.webhook;
    if (!url) throw new Error('No hay webhook configurado');
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Xito Truck Hub', ...payload }), signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`Discord respondió ${r.status}`);
    return true;
  }
  money(v, game) { return `${Math.round(Math.abs(v || 0)).toLocaleString('es-ES')} ${String(game).toLowerCase() === 'ats' ? '$' : '€'}`; }
  async onJob({ phase, job }) {
    if (job.demo) return;
    const c = this.cfg;
    if (!c.webhook) return;
    if (!(phase === 'delivered' && c.onDelivery !== false) && !(phase === 'cancelled' && c.onCancel !== false)) return;
    const driver = await this.driverName();
    const km = job.distanceKm || job.drivenKm || 0;
    const fields = [
      { name: 'Carga', value: `${job.cargo || '—'} · ${((job.mass || 0) / 1000).toFixed(1).replace('.', ',')} t`, inline: true },
      { name: 'Distancia', value: `${Math.round(km).toLocaleString('es-ES')} km`, inline: true },
      { name: phase === 'delivered' ? 'Ingresos' : 'Penalización', value: (phase === 'delivered' ? '' : '−') + this.money(job.revenue, job.game), inline: true }
    ];
    if (phase === 'delivered') fields.push(
      { name: 'XP', value: String(job.xp || 0), inline: true },
      { name: 'Daño de la carga', value: `${Math.round((job.cargoDamage || 0) * 100)} %`, inline: true },
      { name: 'Velocidad máxima', value: `${Math.round(job.maxSpeed || 0)} km/h`, inline: true },
      { name: 'Combustible', value: `${Math.round(job.fuelUsed || 0)} l`, inline: true },
      { name: 'Multas', value: job.fines?.length ? `${job.fines.length} (${this.money(job.finesTotal, job.game)})` : 'Ninguna', inline: true },
      { name: 'Camión', value: job.truck || '—', inline: true }
    );
    try {
      await this.post({ embeds: [{
        title: `${phase === 'delivered' ? '✅ Entrega completada' : '❌ Trabajo cancelado'}: ${job.fromCity} → ${job.toCity}`,
        description: `${job.fromCompany || ''} → ${job.toCompany || ''}`, color: phase === 'delivered' ? 0x4fd1a1 : 0xff6b7a,
        fields, footer: { text: driver ? `Conductor: ${driver} · Xito Truck Hub` : 'Xito Truck Hub' }, timestamp: new Date().toISOString()
      }] });
    } catch (e) { console.error('[discord]', e.message); }
  }
  async onFine(e) {
    if (!this.cfg.webhook || !this.cfg.onFine) return;
    const driver = await this.driverName();
    this.post({ embeds: [{ title: '🚨 Multa', description: `${e.offence} · ${this.money(e.amount, this.tracker.live?.game)}`, color: 0xffcf5c,
      footer: { text: driver ? `Conductor: ${driver}` : 'Xito Truck Hub' }, timestamp: new Date().toISOString() }] }).catch(() => {});
  }
  test() {
    return this.post({ embeds: [{ title: 'Xito Truck Hub conectado', description: 'Aquí aparecerán tus entregas.', color: 0xffb547, timestamp: new Date().toISOString() }] });
  }

  // ---------- Rich Presence (protocolo IPC local de Discord) ----------
  start() { this.timer = setInterval(() => this.presenceTick(), 15000); this.presenceTick(); }
  stop() { clearInterval(this.timer); this.close(); }
  close() { try { this.sock && this.sock.destroy(); } catch {} this.sock = null; this.ready = false; this.connecting = false; }
  frame(op, obj) {
    const body = Buffer.from(JSON.stringify(obj));
    const h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(body.length, 4);
    return Buffer.concat([h, body]);
  }
  connect(i = 0) {
    if (process.platform !== 'win32' || this.connecting || i > 9) { if (i > 9) this.connecting = false; return; }
    this.connecting = true;
    const s = net.createConnection(`\\\\?\\pipe\\discord-ipc-${i}`);
    s.once('error', () => { s.destroy(); this.connecting = false; if (i < 9) this.connect(i + 1); });
    s.once('connect', () => {
      this.sock = s; this.appId = this.cfg.appId;
      s.write(this.frame(0, { v: 1, client_id: String(this.cfg.appId) }));
    });
    s.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 8) {
        const len = this.buf.readInt32LE(4);
        if (this.buf.length < 8 + len) break;
        let msg = null; try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString()); } catch {}
        this.buf = this.buf.slice(8 + len);
        if (msg && msg.evt === 'READY') { this.ready = true; this.connecting = false; this.lastPresence = 0; this.presenceTick(); }
      }
    });
    s.on('close', () => { if (this.sock === s) { this.sock = null; this.ready = false; this.connecting = false; } });
  }
  presenceTick() {
    const c = this.cfg;
    if (!c.rpc || !c.appId) { if (this.sock) this.close(); return; }
    if (this.sock && this.appId !== c.appId) this.close();
    if (!this.ready) return this.connect();
    const t = this.tracker.live;
    const live = t && t.sdk && this.tracker.status?.state === 'connected';
    let activity = null;
    if (live) {
      const j = t.job, tr = t.truck;
      activity = {
        details: j && j.onJob ? `${j.fromCity} → ${j.toCity}` : 'Conduciendo libre',
        state: j && j.onJob ? `${j.cargo} · ${Math.round((t.nav?.distance || 0) / 1000)} km restantes` : `${[tr.brand, tr.name].filter(Boolean).join(' ')} · ${Math.round(tr.speed)} km/h`,
        timestamps: { start: Math.floor(this.sessionStart / 1000) },
        assets: { large_image: 'logo', large_text: String(t.game).toLowerCase() === 'ats' ? 'American Truck Simulator' : 'Euro Truck Simulator 2' },
        instance: false
      };
    } else this.sessionStart = Date.now();
    try { this.sock.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(Date.now()) })); } catch { this.close(); }
  }
}
module.exports = Discord;
