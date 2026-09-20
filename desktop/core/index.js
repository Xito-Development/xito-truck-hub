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
  const stop = () => { laliga.stop(); tmpWatch.stop(); convoy.stop(true); vtcBot.stop(); relayRef.relay.stop(); game.stop(); world.stopHeat(); traffic.stop(); discord.stop(); bridge.stop(); store.save(true); try { srv.server.close(); } catch {} };
  return { store, tracker, bridge, srv, traffic, alerts, discord, nav, game, relay: relayRef.relay, tacho, vtcBot, convoy, stop };
}
module.exports = { start };
