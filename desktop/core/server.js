// Servidor HTTP + WebSocket (local y red Wi-Fi) que sirve la interfaz y la API
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const TMP = require('./tmp');
const stats = require('./stats');
const steam = require('./steam');
const world = require('./world');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

function lanIps() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const n of list || []) {
    if (n.family !== 'IPv4' || n.internal) continue;
    // Las redes virtuales (VirtualBox, WSL, VPN…) van al final
    const virtual = /vethernet|virtual|vmware|vbox|wsl|hyper-v|tailscale|zerotier|hamachi|loopback/i.test(name) || n.address.startsWith('169.254.');
    out.push({ ip: n.address, virtual });
  }
  return out.sort((a, b) => a.virtual - b.virtual).map((x) => x.ip);
}
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function csv(rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\ufeff' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}

const KEY_DEFAULTS = {
  lights: 'L', highBeam: 'K', blinkLeft: '[', blinkRight: ']', hazard: 'F', beacon: 'O', horn: 'H', airHorn: 'N', engine: 'E', parking: 'SPACE',
  cruise: 'C', engineBrake: 'B', retarderUp: ';', retarderDown: "'", wipers: 'P', liftAxle: 'U', map: 'M', screenshot: 'F10', chat: 'Y',
  cam1: '1', cam2: '2', cam3: '3', cam4: '4', cam5: '5', cam6: '6', cam7: '7', cam8: '8', pause: 'ESCAPE', gps: 'F5', trailer: 'T'
};
function createServer({ port, uiDir, store, tracker, bridge, hooks, resourcesDir, version, traffic, discord, nav, game, relayRef, tacho, vtcBot, convoy, tmpWatch, laliga }) {
  const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  const uiRoot = path.resolve(uiDir) + path.sep;
  const headers = (extra = {}) => ({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  const send = (res, code, obj) => { res.writeHead(code, headers({ 'Content-Type': 'application/json; charset=utf-8' })); res.end(JSON.stringify(obj)); };
  const body = (req) => new Promise((ok) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 25e6) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } });
  });
  // Sin PIN solo desde este PC y solo desde la propia app: evita que una web cualquiera abierta en el navegador use la API
  const authed = (req, url) => {
    const pin = req.headers['x-hub-pin'] || url.searchParams.get('pin');
    if (pin && safeEq(pin, store.data.settings.pin)) return true;
    if (!isLocal(req)) return false;
    const origin = req.headers.origin;
    return !origin || ORIGINS.has(origin);
  };

  const routes = {
    'GET /api/state': () => ({
      version, settings: store.data.settings, status: tracker.status, live: tracker.live, current: store.data.current,
      traffic: traffic.nearby, lan: { ips: lanIps(), port }, platform: process.platform, electron: !!hooks.electron,
      game: game.state, remote: relayRef.relay?.status(), tacho: tacho.state(), convoy: convoy.state(), laliga: laliga.state
    }),
    'GET /api/stats': (q) => stats.compute(store.data, q.get('range') || 'all'),
    'GET /api/achievements': () => stats.achievements(store.data),
    'GET /api/job': (q) => { const j = store.data.jobs.find((x) => x.id === q.get('id')); if (!j) throw new Error('Trabajo no encontrado'); return j; },
    'GET /api/jobs': (q) => {
      const off = Math.max(0, +q.get('offset') || 0), lim = Math.min(Math.max(1, +q.get('limit') || 50), 1000);
      const s = (q.get('q') || '').toLowerCase().trim();
      const st = q.get('status');
      const f = store.data.jobs.filter((j) => (!st || j.status === st) && (!s || [j.cargo, j.fromCity, j.toCity, j.fromCompany, j.toCompany, j.truck].join(' ').toLowerCase().includes(s)));
      return { total: f.length, items: f.slice(off, off + lim).map(({ path, sc, ...j }) => j) };
    },
    'GET /api/events': (q) => {
      const type = q.get('type');
      const f = store.data.events.filter((e) => !type || e.type === type);
      return { total: f.length, items: f.slice(0, Math.min(+q.get('limit') || 100, 2000)) };
    },
    'GET /api/tmp/player': async (q) => TMP.player(q.get('id') || store.data.settings.tmpId),
    'GET /api/tmp/bans': async (q) => TMP.bans(q.get('id') || store.data.settings.tmpId),
    'GET /api/tmp/servers': async () => TMP.servers(),
    'GET /api/tmp/gametime': async () => TMP.gameTime(),
    'GET /api/tmp/events': async () => TMP.events(),
    'GET /api/tmp/vtc': async (q) => TMP.vtc(q.get('id') || store.data.settings.vtcId),
    'GET /api/tmp/vtc/members': async (q) => TMP.vtcMembers(q.get('id') || store.data.settings.vtcId),
    'GET /api/tmp/vtc/events': async (q) => TMP.vtcEvents(q.get('id') || store.data.settings.vtcId),
    'GET /api/tmp/detect': async () => {
      const sid = await steam.recentSteamId();
      if (!sid) throw new Error('No se encontró ninguna cuenta de Steam en este PC');
      return TMP.player(sid);
    },
    'GET /api/traffic': async () => ({ nearby: traffic.nearby, servers: await traffic.overviewMerged(await traffic.hotspots()) }),
    'GET /api/traffic/server': async (q) => traffic.serverDetail(q.get('game') || 'ets2', q.get('url') || 'sim1'),
    'GET /api/plugin': async () => ({ games: await steam.findGames() }),
    'GET /api/goals': () => stats.goals(store.data),
    'GET /api/finance': () => stats.finance(store.data),
    'GET /api/laliga': async (q) => { if (q.get('refresh')) await laliga.check().catch(() => {}); return laliga.state; },
    'GET /api/displays': () => hooks.displays?.() || [],
    'POST /api/displays': async (_q, b) => { hooks.setDisplay?.(+b.id); return hooks.displays?.() || []; },
    'POST /api/log/client': async (_q, b) => { require('./log').write('UI', String(b.msg || '').slice(0, 1500)); return { ok: true }; },
    'GET /api/log': () => ({ lines: require('./log').tail(400), file: require('./log').file }),
    'POST /api/open-data': async () => { await hooks.openPath?.(require('path').dirname(require('./log').file)); return { ok: true }; },
    'GET /api/vtc/online': () => tmpWatch.vtcOnline,
    'GET /api/tmp/upcoming': () => tmpWatch.events.map((e) => ({ id: e.id, name: e.name, start_at: e.start_at, url: e.url, server: e.server?.name })).sort((a, b) => String(a.start_at).localeCompare(String(b.start_at))),
    'GET /api/game': async () => ({ ...game.state, launcher: !!(await game.findLauncher()) }),
    'POST /api/launch': async (_q, b) => {
      const target = b.target || 'tmp';
      if (target === 'tmp') {
        const exe = await game.findLauncher();
        if (exe) { await hooks.openPath?.(exe); return { ok: true, how: 'launcher' }; }
        await hooks.openExternal?.('https://truckersmp.com/download');
        return { ok: true, how: 'download' };
      }
      await hooks.openExternal?.(`steam://rungameid/${target === 'ats' ? 270880 : 227300}`);
      return { ok: true, how: 'steam' };
    },
    'GET /api/remote': () => relayRef.relay.status(),
    'GET /api/tacho': () => tacho.state(),
    'POST /api/tacho/reset': () => { tacho.reset(); return tacho.state(); },
    'GET /api/vtcbot': () => vtcBot.status(),
    'POST /api/vtcbot/test': async () => { await vtcBot.test(); return vtcBot.status(); },
    'GET /api/convoy': () => convoy.state(),
    'POST /api/convoy': async (_q, b) => {
      if (b.action === 'create') return convoy.create(b.name);
      if (b.action === 'join') return convoy.join(b.code, b.name);
      if (b.action === 'leave') return convoy.leave();
      if (b.action === 'msg') { convoy.sendMsg(String(b.text || '').slice(0, 120)); return convoy.state(); }
      if (b.action === 'config') { if (b.name) store.data.settings.convoy.name = String(b.name).slice(0, 30); if (b.maxGap) store.data.settings.convoy.maxGap = Math.max(1, Math.min(50, +b.maxGap)); store.save(); return convoy.state(); }
      throw new Error('Acción no válida');
    },
    'GET /api/keys': () => ({ bindings: { ...KEY_DEFAULTS, ...(store.data.settings.keys || {}) }, live: process.platform === 'win32' && !store.data.settings.demo }),
    'POST /api/keys': async (_q, b) => {
      const map = { ...KEY_DEFAULTS, ...(store.data.settings.keys || {}) };
      const key = b.action ? map[b.action] : b.key;
      if (!key) throw new Error('Acción sin tecla asignada');
      const sent = bridge.sendKey(String(key).toUpperCase(), b.a || 'tap');
      return { ok: true, sent, key };
    },
    'POST /api/keys/bindings': async (_q, b) => {
      const clean = {}; for (const [k, v] of Object.entries(b || {})) if (k in KEY_DEFAULTS) clean[k] = String(v || '').toUpperCase().slice(0, 20);
      store.data.settings.keys = { ...(store.data.settings.keys || {}), ...clean }; store.save();
      return { bindings: { ...KEY_DEFAULTS, ...store.data.settings.keys } };
    },
    'POST /api/remote': async (_q, b) => {
      const r = store.data.settings.remote || (store.data.settings.remote = {});
      if (b.regenerate || (b.enabled && !r.code)) r.code = require('./relay').newCode();
      if ('enabled' in b) r.enabled = !!b.enabled;
      store.save(true); relayRef.relay.start();
      return relayRef.relay.status();
    },
    'GET /api/tmp/rules': async () => TMP.rules(),
    'GET /api/tmp/version': async () => TMP.version(),
    'GET /api/tmp/myevents': async (q) => TMP.userEvents(q.get('id') || store.data.settings.tmpId),
    'GET /api/tmp/vtc/news': async (q) => TMP.vtcNews(q.get('id') || store.data.settings.vtcId),
    'GET /api/session': () => tracker.session,
    'GET /api/map/locations': async (q) => world.locations(q.get('game') || 'ets2'),
    'GET /api/map/players': async (q) => {
      world.touchHeat();
      const r = await world.players({ server: q.get('server') || store.data.settings.map?.server, tmpId: store.data.settings.tmpId });
      try {
        const map = await world.fullmap();
        const hot = await traffic.overviewMerged(await traffic.hotspots().catch(() => [])).catch(() => []);
        for (const s of r.servers) { const m = traffic.matchServer(s.id, map, hot); s.name = m ? m.longName + (m.game === 'ats' ? ' (ATS)' : m.game === 'promods' && !/promods/i.test(m.longName) ? ' (ProMods)' : '') : `Servidor ${s.id}`; }
      } catch { for (const s of r.servers) s.name = s.name || `Servidor ${s.id}`; }
      return r;
    },
    'GET /api/map/trail': (q) => {
      const id = q.get('job');
      if (id) { const j = store.data.jobs.find((x) => x.id === id) || (tracker.cur && tracker.cur.id === id ? tracker.cur : null); return { path: j?.path || [] }; }
      const t = store.data.trail, step = Math.max(1, Math.ceil(t.length / (+q.get('max') || 20000)));
      return { trail: step === 1 ? t : t.filter((p, i) => p === null || i % step === 0) };
    },
    'GET /api/map/cities': () => store.data.cities,
    'GET /api/journeys': async (q) => {
      const d = store.data, t = d.trail, max = Math.max(500, Math.min(20000, +q.get('max') || 8000)), step = Math.max(1, Math.ceil(t.length / max));
      const del = d.jobs.filter((j) => j.status === 'delivered');
      // Ciudades y países visitados (usando el mapa de TruckersMP para saber el país)
      const locs = await world.locations('ets2').catch(() => []);
      const flat = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
      const cityCountry = new Map(locs.filter((l) => l.t === 'city').map((l) => [flat(l.n), l.c]));
      const cities = {};
      for (const j of d.jobs) for (const c of [j.fromCity, j.toCity]) if (c) cities[c] = (cities[c] || 0) + 1;
      const countries = {};
      for (const [c, n] of Object.entries(cities)) { const k = cityCountry.get(flat(c)); if (k) countries[k] = (countries[k] || 0) + n; }
      const sumBy = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
      const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
      return {
        at: Date.now(),
        trail: step === 1 ? t : t.filter((p, i) => p === null || i % step === 0),
        hist: d.hist || null,
        cities: top(cities).slice(0, 40), cityCount: Object.keys(cities).length,
        countries: top(countries), fleet: stats.fleet(d),
        speed: { max: Math.max(0, ...del.map((j) => j.maxSpeed || 0)), avg: del.length ? sumBy(del, (j) => j.avgSpeed) / del.length : 0 },
        totals: { km: d.totals.km, driveSec: d.totals.driveSec, fuel: d.totals.fuel, jobs: del.length },
        longest: del.slice().sort((a, b) => (b.distanceKm || b.drivenKm || 0) - (a.distanceKm || a.drivenKm || 0)).slice(0, 5).map((j) => ({ from: j.fromCity, to: j.toCity, km: j.distanceKm || j.drivenKm, at: j.endedAt, path: j.path }))
      };
    },
    'GET /api/map/area': async (q) => {
      world.touchHeat();
      let server = q.get('server');
      if (!server || server === 'auto') { const r = await world.players({ server: 'auto', tmpId: store.data.settings.tmpId }).catch(() => null); server = r?.server || 2; }
      return { server: +server, players: await world.area({ x1: +q.get('x1'), y1: +q.get('y1'), x2: +q.get('x2'), y2: +q.get('y2'), server }) };
    },
    'GET /api/map/heat': (q) => { world.touchHeat(); return { cells: world.heatList(q.get('game') || 'ets2', +q.get('min') || 0.3), hot: traffic.nearby?.server?.top || [] }; },
    'POST /api/route/manual': async (_q, b) => {
      const to = [+b.toX, +b.toY];
      if (!isFinite(to[0]) || !isFinite(to[1])) throw new Error('Destino no válido');
      const from = b.fromX != null && b.fromX !== '' ? [+b.fromX, +b.fromY] : null;
      nav.manual = { to, toName: String(b.toName || 'Destino').slice(0, 60), game: b.game || undefined };
      const r = await nav.compute({ game: b.game || undefined, from, to, toName: nav.manual.toName });
      broadcast({ t: 'route', d: { ...r, manual: true } });
      return r;
    },
    'POST /api/route/clear': () => { nav.manual = null; nav.cache = null; broadcast({ t: 'route', d: null }); return { ok: true }; },
    'GET /api/route/current': () => ({ route: nav.cache?.value || null, manual: nav.manual || null }),
    'GET /api/route': async (q) => {
      const num = (k) => (q.get(k) != null && q.get(k) !== '' ? +q.get(k) : null);
      const fx = num('fromX'), fy = num('fromY'), tx = num('toX'), ty = num('toY');
      return nav.compute({ game: q.get('game') || undefined, from: fx != null && fy != null ? [fx, fy] : null, to: tx != null && ty != null ? [tx, ty] : null, toName: q.get('toName') || undefined });
    },
    'GET /api/friends': async () => world.friends(store.data.settings.friends || [], tracker.live?.truck ? { x: tracker.live.truck.x, z: tracker.live.truck.z } : null),
    'POST /api/update/install': async (_q, b) => { if (!hooks.installUpdate) throw new Error('Solo disponible en el programa de Windows'); if (!/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(b.url || '')) throw new Error('Dirección de descarga no válida'); hooks.installUpdate(b.url, b.version); return { ok: true }; },
    'GET /api/update/check': async () => world.checkUpdate('Xito-Development/xito-truck-hub', version, ''),
    'POST /api/jobs/update': async (_q, b) => {
      const j = store.data.jobs.find((x) => x.id === b.id);
      if (!j) throw new Error('Trabajo no encontrado');
      if ('note' in b) j.note = String(b.note || '').slice(0, 500);
      if ('rating' in b) j.rating = Math.max(0, Math.min(5, Math.round(+b.rating || 0)));
      store.save(); return j;
    },
    'POST /api/plugin/install': async (_q, b) => {
      const games = await steam.findGames();
      const g = games.find((x) => x.key === b.game) || games[0];
      if (!g) throw new Error('No se encontró Euro Truck Simulator 2 en Steam');
      const ok = await steam.installPlugin(resourcesDir, g);
      if (!ok) throw new Error('No se pudo copiar el plugin. Cierra el juego y vuelve a intentarlo.');
      return { games: await steam.findGames() };
    },
    'POST /api/settings': async (_q, b) => {
      const prevDemo = store.data.settings.demo;
      const s = store.updateSettings(b || {});
      if ('demo' in b && s.demo !== prevDemo) bridge.restart(s.demo);
      if ('autoStart' in b) hooks.setAutoStart?.(s.autoStart);
      if ('overlay' in b) hooks.overlay?.('settings', s.overlay);
      if ('discord' in b) discord.presenceTick();
      broadcast({ t: 'settings', settings: s });
      return s;
    },
    'POST /api/overlay': async (_q, b) => { hooks.overlay?.(b.action, b); return { ok: true }; },
    'POST /api/pin/reset': async () => {
      store.data.settings.pin = String(crypto.randomInt(100000, 999999)); store.save(true);
      // Desconecta los móviles que usaban el PIN anterior
      for (const c of wss.clients) if (!c.isLocal) c.terminate();
      return { pin: store.data.settings.pin };
    },
    'POST /api/discord/test': async () => { await discord.test(); return { ok: true }; },
    'POST /api/jobs/delete': async (_q, b) => {
      store.data.jobs = store.data.jobs.filter((j) => j.id !== b.id); store.save(true);
      return { ok: true };
    },
    'POST /api/data/reset': async (_q, b) => {
      if (b.confirm !== 'BORRAR') throw new Error('Confirmación incorrecta');
      Object.assign(store.data, { totals: { km: 0, driveSec: 0, fuel: 0 }, days: {}, jobs: [], events: [], achievements: [], current: null, trail: [], cities: {}, hist: null, botQueue: [] });
      store.save(true); return { ok: true };
    },
    'POST /api/data/import': async (_q, b) => {
      if (!b || !Array.isArray(b.jobs) || !b.totals) throw new Error('El archivo no es una copia de Xito Truck Hub');
      const known = new Set(store.data.jobs.map((j) => j.id));
      const added = b.jobs.filter((j) => j && j.id && !known.has(j.id));
      store.data.jobs = [...store.data.jobs, ...added].sort((x, y) => (y.endedAt || 0) - (x.endedAt || 0));
      const evIds = new Set(store.data.events.map((e) => e.id));
      store.data.events = [...store.data.events, ...(b.events || []).filter((e) => e && !evIds.has(e.id))].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 5000);
      for (const [k, d] of Object.entries(b.days || {})) if (!store.data.days[k]) store.data.days[k] = d;
      if (!store.data.totals.km) store.data.totals = b.totals;
      store.save(true);
      return { added: added.length };
    },
    'GET /api/data/export': () => ({ ...store.data, settings: { ...store.data.settings, pin: undefined } })
  };

  // Llamada interna a la API (la usa el acceso remoto)
  async function call(method, fullPath, b) {
    let url; try { url = new URL(fullPath, 'http://x'); } catch { return { status: 400, body: { error: 'Ruta no válida' } }; }
    const h = routes[`${method} ${url.pathname}`];
    if (!h) return { status: 404, body: { error: 'No encontrado' } };
    try { return { status: 200, body: await h(url.searchParams, method === 'POST' ? (b || {}) : null) }; }
    catch (e) { return { status: 500, body: { error: e.name === 'TimeoutError' ? 'El servicio externo no responde' : e.message } }; }
  }
  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers({ 'Access-Control-Allow-Headers': 'content-type, x-hub-pin', 'Access-Control-Allow-Methods': 'GET, POST' }));
      return res.end();
    }
    if (url.pathname === '/api/jobs.csv') {
      if (!authed(req, url)) return send(res, 401, { error: 'PIN incorrecto' });
      const rows = [['Fecha', 'Estado', 'Origen', 'Empresa origen', 'Destino', 'Empresa destino', 'Carga', 'Toneladas', 'Km', 'Ingresos', 'Beneficio neto', 'XP', 'Nota', 'Calificación', 'Modo', 'Daño %', 'Combustible l', 'Coste combustible', 'Vel. máx', 'Multas', 'Camión', 'Matrícula']];
      for (const j of store.data.jobs) rows.push([new Date(j.endedAt).toLocaleString('es-ES'), ({ delivered: 'Entregado', cancelled: 'Cancelado', interrupted: 'Interrumpido' })[j.status] || j.status, j.fromCity, j.fromCompany, j.toCity, j.toCompany, j.cargo,
        ((j.mass || 0) / 1000).toFixed(1).replace('.', ','), Math.round(j.distanceKm || j.drivenKm || 0), Math.round(j.revenue || 0), j.net != null ? Math.round(j.net) : '', j.xp || 0,
        j.score ?? '', j.grade || '', j.mode === 'real' ? 'Real' : j.mode === 'race' ? 'Carrera' : '',
        Math.round((j.cargoDamage || 0) * 100), Math.round(j.fuelUsed || 0), j.fuelCost != null ? Math.round(j.fuelCost) : '', Math.round(j.maxSpeed || 0), Math.round(j.finesTotal || 0), j.truck, j.plate || '']);
      res.writeHead(200, headers({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="xito-truckhub-entregas.csv"' }));
      return res.end(csv(rows));
    }
    if (url.pathname === '/api/ping') return send(res, 200, { app: 'xito-truck-hub', version, host: os.hostname() });
    if (url.pathname.startsWith('/api/')) {
      if (!authed(req, url)) return send(res, 401, { error: 'PIN incorrecto' });
      const h = routes[`${req.method} ${url.pathname}`];
      if (!h) return send(res, 404, { error: 'No encontrado' });
      try { send(res, 200, await h(url.searchParams, req.method === 'POST' ? await body(req) : null)); }
      catch (e) { send(res, 500, { error: e.name === 'TimeoutError' ? 'El servicio externo no responde' : e.message }); }
      return;
    }
    // Estáticos
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (p === '/') p = '/index.html';
    const file = path.resolve(uiRoot, '.' + p);
    if (!file.startsWith(uiRoot)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('No encontrado'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, sock, head) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch { return sock.destroy(); }
    if (url.pathname !== '/ws' || !authed(req, url)) { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); sock.destroy(); return; }
    wss.handleUpgrade(req, sock, head, (ws) => {
      ws.isAlive = true; ws.isLocal = isLocal(req);
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', () => {});
      ws.send(JSON.stringify({ t: 'hello', status: tracker.status, live: tracker.live, current: store.data.current, settings: store.data.settings, traffic: traffic.nearby, game: game.state, convoy: convoy.state(), tacho: tacho.state(), laliga: laliga.state }));
    });
  });
  // Latido: cierra conexiones muertas (móviles que se bloquean o salen de la Wi‑Fi)
  const beat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} }
  }, 20000);
  server.on('close', () => clearInterval(beat));

  function broadcast(msg) {
    relayRef.relay?.publish(msg);
    const s = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === 1 && c.bufferedAmount < 1e6) c.send(s);
  }
  let lastTel = 0;
  tracker.on('telemetry', (t) => {
    const now = Date.now(); if (now - lastTel < 190) return; lastTel = now;
    const c = tracker.cur;
    broadcast({ t: 'tel', d: t, cur: c ? { id: c.id, drivenKm: c.drivenKm, fines: c.fines.length, startedAt: c.startedAt, startDistance: c.startDistance, score: tracker.liveScore() } : null, ses: tracker.session, tacho: tacho.state(), tmpTime: tracker.tmpTime ? tracker.tmpTime() : null, onTmp: tracker.onTmp ? tracker.onTmp() : false });
  });
  tracker.on('ev', (e) => broadcast({ t: 'ev', d: e }));
  tracker.on('job', (j) => broadcast({ t: 'job', d: j }));
  tracker.on('status', (s) => broadcast({ t: 'status', d: s }));
  traffic.on('update', (n) => broadcast({ t: 'traffic', d: n }));

  server.on('error', (e) => {
    console.error('[server]', e.message);
    hooks.serverError?.(e.code === 'EADDRINUSE' ? `El puerto ${port} está ocupado por otro programa.` : e.message);
  });
  server.listen(port, '0.0.0.0');
  return { server, broadcast, lanIps, wss, call };
}
module.exports = { createServer, lanIps };
