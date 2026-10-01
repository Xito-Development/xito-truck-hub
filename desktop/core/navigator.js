// Navegador: ruta recomendada (la más concurrida) para el trabajo actual
const world = require('./world');
const world_ = world;
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
    // Si el juego ya nos da su ruta real (memoria), esa es la buena
    if (this.gameRoute && !from && !to) return this.gameRoute;
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
      const r = await this.routeAsync({ game, from, to, heat: world.heatList(game, 0.2), cities: locs.filter((l) => l.t === 'city'), hot }, { alternatives: true });
      r.gps = this.pickGps(r);
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
  if (!R || !t || !(R.gps || R.popular || R.fastest)) return null;
  const [x, y] = router.tf(R.game, t.x, t.z);
  let best = Infinity;
  // Vale cualquiera de las dos rutas (la del GPS suele coincidir con la más corta)
  for (const route of [R.gps, R.popular, R.fastest]) for (const p of route?.points || []) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best) best = d; }
  return best;
};
// Entre todas las rutas candidatas, la que más se parece a la distancia que marca el GPS del juego
Navigator.prototype.pickGps = function (r) {
  const navM = this.tracker.live?.nav?.distance || 0;
  const cands = [r.fastest, r.popular, ...(r.alts || [])].filter(Boolean);
  if (!cands.length) return null;
  if (!navM || this.manual) return r.fastest || cands[0];
  let best = cands[0], bd = Infinity;
  for (const c of cands) { const d = Math.abs(c.units - navM); if (d < bd) { bd = d; best = c; } }
  return { ...best, match: Math.max(0, Math.round(100 - (bd / navM) * 100)) };
};
// Mientras conduces se vuelve a elegir: si el GPS va por otro lado, la distancia deja de cuadrar
Navigator.prototype.recheckGps = function () {
  const v = this.cache?.value; if (!v || !v.fastest) return null;
  const prev = v.gps;
  const t = this.tracker.live?.truck, navM = this.tracker.live?.nav?.distance || 0;
  if (!t || !navM) return null;
  const [x, y] = router.tf(v.game, t.x, t.z);
  // longitud restante de cada candidata desde el punto más cercano al camión
  const remaining = (c) => { let bi = 0, bd = Infinity; c.points.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bi = i; } }); let L = 0; for (let i = bi + 1; i < c.points.length; i++) L += Math.hypot(c.points[i][0] - c.points[i - 1][0], c.points[i][1] - c.points[i - 1][1]); return { L, off: bd }; };
  let best = null, bs = Infinity;
  for (const c of [v.fastest, v.popular, ...(v.alts || [])].filter(Boolean)) { const { L, off } = remaining(c); const score = Math.abs(L - navM) + off * 2; if (score < bs) { bs = score; best = c; } }
  if (best && (!prev || best.units !== prev.units)) { v.gps = { ...best, match: Math.max(0, Math.round(100 - (bs / navM) * 100)) }; return v; }
  return null;
};
// Ejecuta el cálculo en el hilo de rutas (si falla el hilo, lo hace aquí mismo)
Navigator.prototype.routeAsync = function (args, opts) {
  if (!this.worker && !this.workerBroken) {
    try {
      const { Worker } = require('worker_threads');
      const wfile = require('path').join(__dirname, 'routeWorker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      this.worker = new Worker(wfile, { workerData: { cacheDir: this.cacheDir } });
      this.pendingRoutes = new Map(); this.seq = 0;
      this.worker.on('message', (m) => { const p = this.pendingRoutes.get(m.id); if (!p) return; this.pendingRoutes.delete(m.id); m.ok ? p.ok(m.result) : p.ko(new Error(m.error)); });
      this.worker.on('error', (e) => {
        // Si el hilo no puede arrancar (p. ej. dentro del paquete), se calcula aquí mismo sin perder la petición
        console.warn('[rutas] hilo', e.message); this.workerBroken = true; this.worker = null;
        if (this.cacheDir) router.setCacheDir(this.cacheDir);
        for (const p of this.pendingRoutes.values()) (p.kind === 'follow' ? router.follow(p.args) : router.route(p.args, p.opts)).then(p.ok, p.ko);
        this.pendingRoutes.clear();
      });
    } catch (e) { this.workerBroken = true; }
  }
  if (!this.worker) { if (this.cacheDir) router.setCacheDir(this.cacheDir); return opts?.kind === 'follow' ? router.follow(args) : router.route(args, opts); }
  return new Promise((ok, ko) => { const id = ++this.seq; this.pendingRoutes.set(id, { ok, ko, args, opts, kind: opts?.kind }); this.worker.postMessage({ id, args, opts, kind: opts?.kind }); });
};
// Ruta REAL del GPS del juego (leída de la memoria, solo lectura). pts = [x0, z0, x1, z1, …] en metros de mundo.
Navigator.prototype.setGameRoute = async function (flat, distGame, onReady) {
  if (!flat || flat.length < 4) { const had = !!this.gameRoute; this.gameRoute = null; if (had) { this.cache = null; onReady(null); } return; }
  const t = this.tracker.live;
  const game = String(t?.game).toLowerCase() === 'ats' ? 'ats' : (this.traffic.me && this.traffic.me.ServerType === 3 ? 'promods' : 'ets2');
  const world = []; for (let i = 0; i + 1 < flat.length; i += 2) world.push([flat[i], flat[i + 1]]);
  const seq = (this.gameSeq = (this.gameSeq || 0) + 1);
  const build = async (points, units) => {
    const locs = await world_.locations(game).catch(() => []);
    const cities = locs.filter((l) => l.t === 'city');
    const via = [];
    const last = world[world.length - 1];
    let dest = null, bd = Infinity;
    for (const c of cities) { const d = Math.hypot(c.x - last[0], c.y - last[1]); if (d < bd) { bd = d; dest = c; } }
    for (const c of cities) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < world.length; i += 2) { const d = Math.hypot(world[i][0] - c.x, world[i][1] - c.y); if (d < best) { best = d; bi = i; } }
      const dS = Math.hypot(c.x - world[0][0], c.y - world[0][1]), dE = Math.hypot(c.x - last[0], c.y - last[1]);
      if (best < 1500 && dS > 3000 && dE > 3000) via.push({ name: c.n, at: bi, x: c.x, y: c.y });
    }
    via.sort((a, b) => a.at - b.at);
    const gps = { points, units, via: via.slice(0, 12).map(({ at, ...v }) => v), source: 'memory', distGame: distGame || 0 };
    const value = { game, gps, popular: null, fastest: null, alts: [], source: 'memory', dest: dest && bd < 6000 ? { name: dest.n, x: dest.x, y: dest.y } : { name: 'Destino del GPS', x: last[0], y: last[1] }, computedAt: Date.now() };
    return value;
  };
  // 1) al instante: los nodos del GPS unidos en línea recta
  const raw = world.map(([x, z]) => router.tf(game, x, z).map(Math.round));
  let units = 0; for (let i = 1; i < raw.length; i++) units += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
  const quick = await build(raw, Math.round(units));
  if (seq !== this.gameSeq) return;
  this.gameRoute = quick; this.cache = { key: 'mem', value: quick }; onReady(quick);
  // 2) después: cada tramo ajustado a las carreteras del mapa
  try {
    const fine = await this.routeAsync({ game, pts: world }, { kind: 'follow' });
    if (seq !== this.gameSeq) return;
    const v = await build(fine.points, fine.units);
    this.gameRoute = v; this.cache = { key: 'mem', value: v }; onReady(v);
  } catch {}
};
module.exports = Navigator;
