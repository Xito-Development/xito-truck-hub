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
  // Nombres internos del juego (id de ciudad) → nombre del mapa de TruckersMP
  static ALIAS = {
    praha: 'prague', wien: 'vienna', koln: 'cologne', munchen: 'munich', nurnberg: 'nuremberg', geneve: 'geneva', bruxelles: 'brussels',
    lisboa: 'lisbon', warszawa: 'warsaw', roma: 'rome', milano: 'milan', torino: 'turin', venezia: 'venice', firenze: 'florence', napoli: 'naples',
    genova: 'genoa', sevilla: 'seville', frankfurt: 'frankfurt am main', den_haag: 'the hague', gdansk: 'gdansk', krakow: 'krakow', bucuresti: 'bucharest',
    beograd: 'belgrade', sofiya: 'sofia', athina: 'athens', kobenhavn: 'copenhagen', goteborg: 'gothenburg', malmo: 'malmo', tallinn: 'tallinn',
    rostock: 'rostock', luxembourg: 'luxembourg', strasbourg: 'strasbourg', a_coruna: 'a coruna', cordoba: 'cordoba', malaga: 'malaga',
    sankt_peterburg: 'saint petersburg', st_peterburg: 'saint petersburg', moskva: 'moscow', kyiv: 'kiev', vilnius: 'vilnius', riga: 'riga',
    klagenfurt: 'klagenfurt am worthersee', dusseldorf: 'dusseldorf', brussel: 'brussels', antwerpen: 'antwerp', liege: 'liege', aachen: 'aachen',
    zurich: 'zurich', basel: 'basel', bern: 'bern', edinburgh: 'edinburgh', london: 'london', istanbul: 'istanbul', tirane: 'tirana',
    // nombres de ciudades en español (el juego las da en el idioma elegido)
    munich: 'munich', colonia: 'cologne', viena: 'vienna', praga: 'prague', varsovia: 'warsaw', bruselas: 'brussels', ginebra: 'geneva',
    milan: 'milan', turin: 'turin', venecia: 'venice', florencia: 'florence', napoles: 'naples', genova: 'genoa', copenhague: 'copenhagen',
    gotemburgo: 'gothenburg', estocolmo: 'stockholm', moscu: 'moscow', sanpetersburgo: 'saint petersburg', atenas: 'athens', estambul: 'istanbul',
    bucarest: 'bucharest', belgrado: 'belgrade', burdeos: 'bordeaux', marsella: 'marseille', niza: 'nice', estrasburgo: 'strasbourg',
    francfort: 'frankfurt am main', hamburgo: 'hamburg', berlin: 'berlin', dresde: 'dresden', nuremberg: 'nuremberg', zurich2: 'zurich',
    berna: 'bern', basilea: 'basel', salzburgo: 'salzburg', cracovia: 'krakow', breslavia: 'wroclaw', londres: 'london', edimburgo: 'edinburgh',
    amsterdam: 'amsterdam', roterdam: 'rotterdam', lahaya: 'the hague', amberes: 'antwerp', lieja: 'liege', luxemburgo: 'luxembourg',
    aquisgran: 'aachen', tallin: 'tallinn', vilna: 'vilnius', kiev: 'kiev', lisboa2: 'lisbon', oporto: 'porto', mannheim: 'mannheim',
    hanover: 'hannover', coblenza: 'koblenz', maguncia: 'mainz', ratisbona: 'regensburg', lucerna: 'lucerne', tesalonica: 'thessaloniki',
    sofia: 'sofia', calais: 'calais', dunkerque: 'dunkirk', calais2: 'calais'
  };
  async findCity(game, name, id) {
    const learned = this.store.data.cities[String(id || '').toLowerCase()] || this.store.data.cities[String(name || '').toLowerCase()];
    if (learned && learned.x != null) return { name: learned.name, x: learned.x, y: learned.z };
    const locs = await world.locations(game);
    const flat = (v) => Traffic.norm(v).replace(/[^a-z]/g, '');
    const cands = [name, id, Navigator.ALIAS[String(id || '').toLowerCase()], Navigator.ALIAS[flat(name)]].filter(Boolean).map(flat);
    const cities = locs.filter((l) => l.t === 'city');
    const c = cities.find((l) => cands.includes(flat(l.n)) || cands.includes(flat(Traffic.key(l.n))))
      || cities.find((l) => cands.some((x) => x.length > 3 && (flat(l.n).startsWith(x) || x.startsWith(flat(l.n)))));
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
// Distancia (en unidades del mapa) del camión a la ruta, y el índice del punto más cercano
Navigator.prototype.offRoute = function () {
  const R = this.cache?.value, t = this.tracker.live?.truck;
  if (!R || !t || !(R.popular || R.fastest)) return null;
  const [x, y] = router.tf(R.game, t.x, t.z);
  let best = Infinity;
  // Vale cualquiera de las dos rutas (la del GPS suele coincidir con la más corta)
  for (const route of [R.popular, R.fastest]) for (const p of route?.points || []) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best) best = d; }
  return best;
};
module.exports = Navigator;
