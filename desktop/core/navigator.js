// Navegador: ruta recomendada (la más concurrida) para el trabajo actual
const world = require('./world');
const router = require('./router');
const Traffic = require('./traffic');

class Navigator {
  constructor(store, tracker, traffic) {
    this.store = store; this.tracker = tracker; this.traffic = traffic;
    this.cache = null; this.pending = null;
  }
  gameKey(t) {
    if (String(t?.game).toLowerCase() === 'ats') return 'ats';
    if (this.traffic.me && this.traffic.me.ServerType === 3) return 'promods';
    return 'ets2';
  }
  async findCity(game, name, id) {
    const learned = this.store.data.cities[String(id || '').toLowerCase()] || this.store.data.cities[String(name || '').toLowerCase()];
    if (learned && learned.x != null) return { name: learned.name, x: learned.x, y: learned.z };
    const locs = await world.locations(game);
    const k = Traffic.key(name), kid = Traffic.key(id);
    const c = locs.find((l) => l.t === 'city' && (Traffic.key(l.n) === k || Traffic.key(l.n) === kid))
      || locs.find((l) => l.t === 'city' && Traffic.norm(l.n).replace(/[^a-z]/g, '') === Traffic.norm(name).replace(/[^a-z]/g, ''));
    return c ? { name: c.n, x: c.x, y: c.y } : null;
  }
  async compute({ game, from, to, toName } = {}) {
    const t = this.tracker.live;
    world.touchHeat();
    if (!from) {
      if (!t || !t.truck || !(t.truck.x || t.truck.z)) throw new Error('Conduce con un trabajo activo para calcular la ruta');
      from = [t.truck.x, t.truck.z];
    }
    game = game || this.gameKey(t);
    let dest = null;
    if (!to) {
      const j = t?.job;
      if (!j || !j.onJob) throw new Error('No hay ningún trabajo activo');
      dest = await this.findCity(game, j.toCity, j.toCityId);
      if (!dest) throw new Error(`No encuentro ${j.toCity} en el mapa`);
      to = [dest.x, dest.y];
    } else dest = { name: toName || 'Destino', x: to[0], y: to[1] };
    const key = [game, Math.round(from[0] / 4000), Math.round(from[1] / 4000), Math.round(to[0]), Math.round(to[1]), Math.floor(Date.now() / 180000)].join(':');
    if (this.cache && this.cache.key === key) return this.cache.value;
    if (this.pending && this.pending.key === key) return this.pending.p;
    const p = (async () => {
      const locs = await world.locations(game).catch(() => []);
      const hot = (this.traffic.nearby?.server?.top) || [];
      const r = await router.route({ game, from, to, heat: world.heatList(game, 0.2), cities: locs.filter((l) => l.t === 'city'), hot });
      const value = { ...r, dest, from, computedAt: Date.now() };
      this.cache = { key, value };
      return value;
    })();
    this.pending = { key, p };
    try { return await p; } finally { if (this.pending && this.pending.p === p) this.pending = null; }
  }
}
module.exports = Navigator;
