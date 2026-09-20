// Tacógrafo realista (normativa europea): 4 h 30 min de conducción → pausa de 45 min
// (se puede partir en tramos de al menos 15 min) y un máximo diario de 9 h (descanso diario de 9 h).
const { EventEmitter } = require('events');
const MIN = 60;

class Tacho extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    if (!store.data.tacho) store.data.tacho = { block: 0, day: 0, brk: 0, seg: 0, last: 0, dayStart: Date.now(), history: [] };
    this.warned = {};
  }
  get s() { return this.store.data.tacho; }
  get cfg() { return { enabled: true, blockMin: 270, breakMin: 45, dayMin: 540, restMin: 540, ...(this.store.data.settings.tacho || {}) }; }
  closeBreak() {
    const s = this.s, c = this.cfg, seg = s.seg;
    if (seg >= c.restMin * MIN) { this.finishDay(); s.block = 0; s.brk = 0; }
    else if (seg >= 15 * MIN) { s.brk += seg; if (s.brk >= c.breakMin * MIN) { s.block = 0; s.brk = 0; this.warned = {}; } }
    s.seg = 0;
  }
  finishDay() {
    const s = this.s;
    if (s.day > 60) { s.history.unshift({ start: s.dayStart, end: Date.now(), drive: Math.round(s.day) }); s.history = s.history.slice(0, 60); this.emit('day', s.history[0]); }
    s.day = 0; s.dayStart = Date.now(); this.warned = {};
  }
  onTel(t) {
    if (t.demo || !this.cfg.enabled) return;
    const s = this.s, now = Date.now();
    // El tiempo con el juego cerrado cuenta como descanso
    if (s.last && now - s.last > 5000) { s.seg += (now - s.last) / 1000; }
    const dt = s.last ? Math.min(1, (now - s.last) / 1000) : 0;
    s.last = now;
    const driving = t.sdk && !t.paused && t.truck.speed > 2;
    if (driving) {
      if (s.seg > 0) this.closeBreak();
      s.block += dt; s.day += dt;
    } else s.seg += dt;
    this.check(driving);
  }
  fire(id, title, text, level, every = 0) {
    if (this.warned[id] && (!every || Date.now() - this.warned[id] < every)) return;
    this.warned[id] = Date.now();
    this.emit('alert', { id: 'tacho-' + id, title, text, level, at: Date.now() });
  }
  check(driving) {
    const s = this.s, c = this.cfg, b = s.block / MIN, d = s.day / MIN;
    if (!driving) return;
    if (b >= c.blockMin) this.fire('over', 'Tacógrafo: tiempo de conducción superado', `Llevas ${fmt(s.block)} seguidas. Para y descansa ${c.breakMin} min.`, 'bad', 10 * 60000);
    else if (b >= c.blockMin - 15) this.fire('soon', 'Pausa obligatoria en 15 minutos', `Busca un área de descanso: al llegar a ${fmt(c.blockMin * MIN)} debes parar ${c.breakMin} min.`, 'warn');
    if (d >= c.dayMin) this.fire('dayover', 'Tacógrafo: límite diario superado', `Has conducido ${fmt(s.day)} hoy. Toca el descanso diario.`, 'bad', 15 * 60000);
    else if (d >= c.dayMin - 30) this.fire('daysoon', 'Queda media hora de conducción hoy', `Límite diario: ${fmt(c.dayMin * MIN)}.`, 'warn');
  }
  state() {
    const s = this.s, c = this.cfg;
    return {
      enabled: c.enabled, block: Math.round(s.block), day: Math.round(s.day), brk: Math.round(s.brk), seg: Math.round(s.seg),
      blockMax: c.blockMin * MIN, dayMax: c.dayMin * MIN, breakNeed: c.breakMin * MIN,
      breakLeft: Math.max(0, c.breakMin * MIN - s.brk - (s.seg >= 15 * MIN ? s.seg : 0)),
      history: s.history.slice(0, 14)
    };
  }
  reset() { Object.assign(this.s, { block: 0, day: 0, brk: 0, seg: 0, dayStart: Date.now() }); this.warned = {}; this.store.save(); }
}
function fmt(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }
module.exports = Tacho;
