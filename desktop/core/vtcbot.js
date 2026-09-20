// Envía entregas, multas y tacógrafo al bot de Discord de la VTC
// Si el bot no está disponible, los envíos se guardan y se reintentan solos.
const TMP = require('./tmp');

class VtcBot {
  constructor(store, tracker, tacho) {
    this.store = store; this.tracker = tracker; this.timer = null; this.last = { ok: null, at: 0, error: '' };
    if (!Array.isArray(store.data.botQueue)) store.data.botQueue = [];
    tracker.on('job', ({ phase, job }) => {
      if (job.demo) return;
      if (phase === 'delivered') this.send('entrega', this.jobData(job));
      else if (phase === 'cancelled') this.send('cancelacion', this.jobData(job));
      else if (phase === 'started') this.send('inicio_trabajo', { origen: job.fromCity, destino: job.toCity, carga: job.cargo, toneladas: +((job.mass || 0) / 1000).toFixed(1), pago_previsto: job.income });
    });
    tracker.on('ev', (e) => { if (!e.demo && e.type === 'fined') this.send('multa', { motivo: e.offence, importe: e.amount }); });
    tacho.on('day', (d) => this.send('tacografo_dia', { inicio: new Date(d.start).toISOString(), fin: new Date(d.end).toISOString(), conduccion_min: Math.round(d.drive / 60) }));
    tacho.on('alert', (a) => { if (/over/.test(a.id)) this.send('tacografo_infraccion', { aviso: a.title, detalle: a.text }); });
  }
  get cfg() { return this.store.data.settings.vtcBot || {}; }
  jobData(j) {
    return {
      id: j.id, estado: j.status, origen: j.fromCity, empresa_origen: j.fromCompany, destino: j.toCity, empresa_destino: j.toCompany,
      carga: j.cargo, toneladas: +((j.mass || 0) / 1000).toFixed(1), km: Math.round(j.distanceKm || j.drivenKm || 0), ingresos: Math.round(j.revenue || 0),
      xp: j.xp || 0, dano_carga_pct: Math.round((j.cargoDamage || 0) * 100), combustible_l: Math.round(j.fuelUsed || 0), vel_max: Math.round(j.maxSpeed || 0),
      multas: j.fines?.length || 0, nota: j.score ?? null, calificacion: j.grade || null, modo: j.mode || null, camion: j.truck, matricula: j.plate || '',
      juego: String(j.game || '').toLowerCase(), inicio: new Date(j.startedAt).toISOString(), fin: new Date(j.endedAt).toISOString(), duracion_min: j.realMinutes || 0
    };
  }
  async driver() {
    const s = this.store.data.settings;
    let name = this.cfg.driverName || '';
    if (!name && s.tmpId) { try { name = (await TMP.player(s.tmpId)).name; } catch {} }
    return { nombre: name, tmp_id: s.tmpId || null, discord_id: this.cfg.discordId || null };
  }
  send(event, data) {
    if (!this.cfg.enabled || !this.cfg.url) return;
    this.store.data.botQueue.push({ event, data, at: Date.now() });
    if (this.store.data.botQueue.length > 300) this.store.data.botQueue.splice(0, this.store.data.botQueue.length - 300);
    this.store.save();
    this.flush();
  }
  async post(item) {
    const r = await fetch(this.cfg.url, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.token || ''}`, 'User-Agent': 'XitoTruckHub' },
      body: JSON.stringify({ evento: item.event, fecha: new Date(item.at).toISOString(), conductor: await this.driver(), datos: item.data, app: 'xito-truck-hub' })
    });
    if (!r.ok) throw new Error(`El bot respondió ${r.status}`);
  }
  async flush() {
    if (this.busy) return; this.busy = true;
    try {
      const q = this.store.data.botQueue;
      while (q.length) {
        try { await this.post(q[0]); q.shift(); this.last = { ok: true, at: Date.now(), error: '' }; }
        catch (e) { this.last = { ok: false, at: Date.now(), error: e.name === 'TimeoutError' ? 'El bot no responde' : e.message }; break; }
      }
      this.store.save();
    } finally { this.busy = false; }
  }
  start() { this.timer = setInterval(() => this.flush(), 60000); }
  stop() { clearInterval(this.timer); }
  status() { return { ...this.last, pending: this.store.data.botQueue.length, enabled: !!this.cfg.enabled }; }
  async test() { await this.post({ event: 'prueba', data: { mensaje: 'Xito Truck Hub conectado' }, at: Date.now() }); return true; }
}
module.exports = VtcBot;
