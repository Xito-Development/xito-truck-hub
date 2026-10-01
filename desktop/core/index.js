// Núcleo del HUB: une telemetría, almacenamiento, seguimiento, avisos y servidor
const Store = require('./store');
const Tracker = require('./tracker');
const Bridge = require('./bridge');
const Traffic = require('./traffic');
const Alerts = require('./alerts');
const Discord = require('./discord');
const Navigator = require('./navigator');
const world = require('./world');
const Game = require('./game');
const { Relay } = require('./relay');
const Tacho = require('./tacho');
const VtcBot = require('./vtcbot');
const Convoy = require('./convoy');
const TmpWatch = require('./tmpwatch');
const LaLiga = require('./laliga');
const { createServer } = require('./server');

function start({ dataDir, resourcesDir, uiDir, port = 25580, hooks = {}, version = '1.0.0' }) {
  require('./log').init(dataDir);
  const store = new Store(dataDir);
  const tracker = new Tracker(store);
  const bridge = new Bridge(resourcesDir);
  bridge.on('tel', (t) => { tracker.onTel(t); tracker.emit('telemetry', t); });
  bridge.on('ev', (e) => tracker.onEv(e));
  bridge.on('status', (s) => tracker.onStatus({ state: s.state, msg: s.msg }));

  const traffic = new Traffic(store, tracker);
  const alerts = new Alerts(store, tracker);
  alerts.traffic = traffic;
  const game = new Game();
  const tacho = new Tacho(store);
  tracker.on('telemetry', (t) => tacho.onTel(t));
  const vtcBot = new VtcBot(store, tracker, tacho);
  const convoy = new Convoy(store, tracker);
  const tmpWatch = new TmpWatch(store, tracker);
  const laliga = new LaLiga(store);
  const relayRef = {};
  const discord = new Discord(store, tracker);
  const nav = new Navigator(store, tracker, traffic);
  nav.cacheDir = require('path').join(dataDir, 'tiles');
  tracker.on('job', (j) => {
    if (j.phase !== 'started') return;
    // Espera a que el GPS calcule la ruta y avisa por dónde va la ruta más concurrida
    setTimeout(async () => {
      try {
        const r = await nav.compute();
        const via = (r.popular?.via || []).slice(0, 5).map((v) => v.name);
        srv.broadcast({ t: 'route', d: r });
        if (store.data.settings.alerts?.traffic !== false)
          srv.broadcast({ t: 'alert', d: { id: 'route', title: 'Ruta más concurrida', text: via.length ? `Pasa por ${via.join(' → ')}` : `Directa hacia ${r.dest.name}`, level: 'info', at: Date.now() } });
      } catch { traffic.onJobStarted(j.job); }
    }, 8000);
  });

  // Ruta REAL del GPS del juego leída de la memoria (solo lectura). Tiene prioridad sobre las calculadas.
  let gpsStatus = { ok: null, msg: '' };
  bridge.on('gpsstatus', (m) => { gpsStatus = { ok: m.ok, msg: m.msg }; srv.broadcast({ t: 'gpsstatus', d: gpsStatus }); });
  bridge.on('gps', (m) => {
    if (store.data.settings.gpsMemory === false) return;
    nav.setGameRoute(m.pts, m.dist, (r) => srv.broadcast({ t: 'route', d: r }));
  });
  const syncGpsSetting = () => bridge.sendCmd({ cmd: 'gps', on: store.data.settings.gpsMemory !== false });
  setTimeout(syncGpsSetting, 3000);
  { const upd = store.updateSettings.bind(store); store.updateSettings = (...a) => { const r = upd(...a); try { syncGpsSetting(); if (store.data.settings.gpsMemory === false && nav.gameRoute) { nav.gameRoute = null; nav.cache = null; srv.broadcast({ t: 'route', d: null }); } } catch {} return r; }; }
  // Patrones actualizados desde GitHub (si una actualización del juego los cambia, se arregla sin nueva versión)
  setTimeout(async () => {
    try {
      const r = await fetch('https://raw.githubusercontent.com/Xito-Development/xito-truck-hub/main/gps-offsets.json', { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.aob) bridge.sendCmd({ cmd: 'gpscfg', global: j.aob.global?.pattern, nav: j.aob.nav_offset?.pattern, route: j.aob.route_getter?.pattern, itemSize: j.route_item?.size });
    } catch {}
  }, 5000);
  tracker.gpsStatus = () => gpsStatus;
  // Navegación en tiempo real: si te sales de la ruta recomendada (o cambia el destino) se recalcula sola
  let lastDest = null, rerouting = false, lastFail = null, lastFailAt = 0;
  const navTimer = setInterval(async () => {
    const t = tracker.live, j = t?.job;
    if (nav.gameRoute) return; // el GPS del juego manda
    // Ruta puesta a mano desde el HUB o el móvil: tiene prioridad y se quita al llegar
    if (nav.manual && t && t.sdk && t.truck && !rerouting) {
      const [dx, dy] = nav.manual.to;
      if (Math.hypot(t.truck.x - dx, t.truck.z - dy) < 900) {
        nav.manual = null; nav.cache = null;
        srv.broadcast({ t: 'route', d: null });
        srv.broadcast({ t: 'alert', d: { id: 'route-arrived', title: 'Has llegado a tu destino', text: 'Se ha quitado la ruta del mini mapa.', level: 'good', at: Date.now() } });
        return;
      }
      const off = nav.offRoute();
      if (off != null && off < 1800) return;
      rerouting = true;
      try { const r = await nav.compute({ game: nav.manual.game, to: nav.manual.to, toName: nav.manual.toName }); srv.broadcast({ t: 'route', d: { ...r, manual: true, rerouted: off != null } }); }
      catch {} finally { rerouting = false; }
      return;
    }
    if (!t || !t.sdk || !j || !j.onJob || rerouting) { if (!j?.onJob) lastDest = null; return; }
    const dest = j.toCity + '|' + j.toCompany;
    const off = nav.offRoute();
    if (dest === lastDest && off != null && off < 1800) { const upd = nav.recheckGps(); if (upd) srv.broadcast({ t: 'route', d: upd }); return; }
    if (dest === lastDest && off == null && nav.cache) return;
    rerouting = true;
    if (dest === lastFail && Date.now() - lastFailAt < 120000) { rerouting = false; return; }
    try {
      const r = await nav.compute();
      lastDest = dest; lastFail = null;
      srv.broadcast({ t: 'route', d: { ...r, rerouted: off != null && off >= 1800 } });
    } catch (e) {
      lastFail = dest; lastFailAt = Date.now();
      srv.broadcast({ t: 'route-error', d: { error: e.message, dest: j.toCity } });
    } finally { rerouting = false; }
  }, 15000);
  // Hora del servidor de TruckersMP (en TMP el reloj va 6 veces más rápido que el real y es común para todos)
  const tmpClock = { gt: null, at: 0 };
  const syncClock = async () => { try { const r = await require('./tmp').gameTime(); const gt = r?.game_time ?? r; if (typeof gt === 'number') { tmpClock.gt = gt; tmpClock.at = Date.now(); } } catch {} };
  syncClock(); const clockTimer = setInterval(syncClock, 5 * 60000);
  // Hora estimada del servidor de TruckersMP (siempre que se haya podido consultar)
  tracker.tmpTime = () => (tmpClock.gt == null ? null : Math.floor(tmpClock.gt + ((Date.now() - tmpClock.at) / 60000) * 6));
  tracker.onTmp = () => !!(traffic.me || game.state?.tmp || tracker.live?.mpOffset);
  const srv = createServer({ port, uiDir, store, tracker, bridge, hooks, resourcesDir, version, traffic, discord, nav, game, relayRef, tacho, vtcBot, convoy, tmpWatch, laliga });
  relayRef.relay = new Relay(store, (m, p, b) => srv.call(m, p, b),
    async () => ({ t: 'hello', status: tracker.status, live: tracker.live, current: store.data.current, settings: store.data.settings, traffic: traffic.nearby, game: game.state }));
  relayRef.relay.start();
  game.on('change', (g) => srv.broadcast({ t: 'game', d: g }));
  game.start();
  const pushAlert = (a) => srv.broadcast({ t: 'alert', d: a });
  traffic.on('alert', pushAlert);
  alerts.on('alert', pushAlert);
  tacho.on('alert', pushAlert);
  convoy.on('alert', pushAlert);
  tmpWatch.on('alert', pushAlert);
  laliga.on('alert', pushAlert);
  laliga.on('update', (st) => srv.broadcast({ t: 'laliga', d: st }));
  convoy.on('update', (st) => srv.broadcast({ t: 'convoy', d: st }));
  convoy.on('msg', (m) => pushAlert({ id: 'convoy-' + m.kind + '-' + Date.now(), kind: 'convoy', title: m.kind === 'join' ? `${m.name} se ha unido al convoy` : m.kind === 'leave' ? `${m.name} ha salido del convoy` : `${m.name}: ${m.text}`, text: m.kind === 'msg' ? 'Mensaje del convoy' : '', level: 'info', at: Date.now(), mine: !!m.mine }));
  bridge.on('keyerror', (msg) => pushAlert({ id: 'keyerror', title: 'Botonera', text: msg, level: 'warn', at: Date.now() }));

  bridge.start(store.data.settings.demo);
  traffic.start();
  discord.start();
  vtcBot.start();
  tmpWatch.start();
  laliga.start();
  if (store.data.settings.convoy?.code) convoy.start();
  world.startHeat(() => tracker.status?.state === 'connected');
  // Marca sin avisar los logros que ya estaban conseguidos al abrir el HUB
  setTimeout(() => alerts.checkAchievements(true), 5000);
  const stop = () => { try { nav.worker?.terminate(); } catch {} clearInterval(clockTimer); clearInterval(navTimer); laliga.stop(); tmpWatch.stop(); convoy.stop(true); vtcBot.stop(); relayRef.relay.stop(); game.stop(); world.stopHeat(); traffic.stop(); discord.stop(); bridge.stop(); store.save(true); try { srv.server.close(); } catch {} };
  return { store, tracker, bridge, srv, traffic, alerts, discord, nav, game, relay: relayRef.relay, tacho, vtcBot, convoy, stop };
}
module.exports = { start };
