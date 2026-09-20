// Mapa en vivo, amigos y comprobación de actualizaciones
const UA = { 'User-Agent': 'XitoTruckHub/1.2' };
const TMP = require('./tmp');
const cache = new Map();
async function cached(key, ttl, fn) {
  const h = cache.get(key);
  if (h && Date.now() - h.t < ttl) return h.v;
  try { const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; }
  catch (e) { if (h) return h.v; throw e; }
}
const get = (url, ms = 15000) => fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });

// Todos los jugadores de TruckersMP con su posición
function fullmap() {
  return cached('fullmap', 15000, async () => {
    const r = await get('https://tracker.ets2map.com/v3/fullmap', 20000);
    if (!r.ok) throw new Error(`El mapa en vivo respondió ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.Data)) throw new Error('El mapa en vivo no devolvió jugadores');
    return j.Data;
  });
}
// Ciudades y países del mapa (TruckersMP)
function locations(game = 'ets2') {
  const file = { ets2: 'locations_ets2.min.json', ats: 'locations_ats.min.json', promods: 'locations_promods.min.json' }[game] || 'locations_ets2.min.json';
  return cached('loc3-' + game, 24 * 3600e3, async () => {
    const raw = await (await get('https://map.truckersmp.com/' + file, 30000)).json();
    const out = [];
    // Puntos de interés del mapa: gasolineras, áreas de descanso, talleres, garajes, concesionarios, empresas…
    const KEEP = { fuel: 'fuel', parking: 'rest', service: 'service', garage: 'garage', dealer: 'dealer', recruitment: 'recruit', ferry: 'port', business: 'company' };
    const pretty = (id) => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    for (const c of raw) {
      out.push({ t: 'country', n: c.name, x: c.x, y: c.y });
      const all = [];
      for (const p of c.pois || []) { all.push(p); for (const q of p.pois || []) all.push(q); }
      for (const p of all) {
        if (p.type === 'city') out.push({ t: 'city', n: p.name, x: p.x, y: p.y, c: c.name });
        else if (KEEP[p.type]) out.push({ t: KEEP[p.type], n: p.type === 'business' ? pretty(p.name) : '', x: Math.round(p.x), y: Math.round(p.y), c: c.name });
        else if (p.type === 'overlay' && p.name === 'toll_ico') out.push({ t: 'toll', n: '', x: Math.round(p.x), y: Math.round(p.y) });
        else if (p.type === 'overlay' && p.name === 'weigh_ico') out.push({ t: 'weigh', n: '', x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
    return out;
  });
}

// Jugadores de una zona concreta (tiempo real, mucho más ligero que el mapa completo)
async function area({ x1, y1, x2, y2, server }) {
  const q = `x1=${Math.round(Math.min(x1, x2))}&y1=${Math.round(Math.max(y1, y2))}&x2=${Math.round(Math.max(x1, x2))}&y2=${Math.round(Math.min(y1, y2))}&server=${server || 2}`;
  return cached('area-' + q, 2500, async () => {
    const r = await get('https://tracker.ets2map.com/v3/area?' + q, 8000);
    const j = await r.json();
    return (j.Data || []).map((p) => [p.X, p.Y, p.Heading, p.MpId, p.Name]);
  });
}
async function players({ server, tmpId }) {
  const map = await fullmap();
  const me = tmpId ? map.find((p) => p.MpId === Number(tmpId)) : null;
  const sid = server === 'auto' || !server ? (me ? me.ServerId : null) : Number(server);
  const servers = {};
  for (const p of map) servers[p.ServerId] = (servers[p.ServerId] || 0) + 1;
  const list = sid == null ? map.filter((p) => p.ServerType !== 2) : map.filter((p) => p.ServerId === sid);
  return {
    server: sid, me: me ? { x: me.X, y: me.Y, server: me.ServerId } : null,
    servers: Object.entries(servers).map(([id, n]) => ({ id: +id, players: n, type: (map.find((p) => p.ServerId === +id) || {}).ServerType })).sort((a, b) => b.players - a.players),
    // Formato compacto: [x, y, rumbo, idTMP, nombre]
    players: list.map((p) => [p.X, p.Y, p.Heading, p.MpId, p.Name])
  };
}

async function friends(list, near) {
  const map = await fullmap().catch(() => []);
  return Promise.all(list.map(async (f) => {
    const on = map.find((p) => p.MpId === f.id);
    let name = f.name, avatar = f.avatar;
    if (!name || !avatar) { try { const p = await TMP.player(f.id); name = p.name; avatar = p.smallAvatar || p.avatar; } catch {} }
    const dist = on && near ? Math.hypot(on.X - near.x, on.Y - near.z) / 1000 : null;
    return { id: f.id, name: name || `#${f.id}`, avatar, online: !!on, server: on ? on.ServerId : null, x: on?.X, y: on?.Y, dist };
  }));
}

// Compara versiones "1.2.10" > "1.2.9"
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
}
async function checkUpdate(repo, current, jsonUrl) {
  // 1) Archivo updates.json (gratis en GitHub, un Gist o cualquier web)
  const url = jsonUrl || (repo ? `https://raw.githubusercontent.com/${repo}/main/updates.json` : '');
  if (url) {
    try {
      const j = await (await get(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())).json();
      if (j && j.latest) return { current, latest: j.latest, available: newer(j.latest, current), notes: j.notes || [], exe: j.exe || null, apk: j.apk || null, url: j.page || null, mandatory: !!j.mandatory, source: 'json' };
    } catch {}
  }
  if (!repo) throw new Error('Escribe tu repositorio de GitHub o la URL de updates.json en Ajustes → Actualizaciones');
  return cached('upd-' + repo, 10 * 60000, async () => {
    const r = await get(`https://api.github.com/repos/${repo}/releases/latest`);
    if (r.status === 404) throw new Error('El repositorio no tiene ninguna versión publicada todavía');
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const j = await r.json();
    const asset = (re) => (j.assets || []).find((a) => re.test(a.name));
    const latest = String(j.tag_name || '').replace(/^v/, '');
    return {
      current, latest, available: newer(latest, current), notes: j.body || '', url: j.html_url,
      exe: asset(/\.exe$/i)?.browser_download_url || null, apk: asset(/\.apk$/i)?.browser_download_url || null, date: j.published_at
    };
  });
}
// ---------- mapa de calor del tráfico (se acumula con el tiempo para dibujar las carreteras más usadas) ----------
const heat = { 1: new Map(), 2: new Map(), 3: new Map() }; // tipo de servidor → celda de 1 km → intensidad
let lastSample = 0, activeUntil = 0, heatTimer = null;
function touchHeat() { activeUntil = Date.now() + 5 * 60000; }
async function sampleHeat() {
  const map = await fullmap();
  for (const m of Object.values(heat)) for (const [k, v] of m) { const nv = v * 0.985; if (nv < 0.05) m.delete(k); else m.set(k, nv); }
  for (const p of map) {
    const m = heat[p.ServerType]; if (!m) continue;
    const k = Math.floor(p.X / 1000) + ',' + Math.floor(p.Y / 1000);
    m.set(k, (m.get(k) || 0) + 1);
  }
  lastSample = Date.now();
}
function startHeat(isLive) {
  const tick = async () => {
    // Cada 20 s si se está usando (juego, mapa o rutas); si no, cada 5 minutos para no gastar datos
    const busy = Date.now() < activeUntil || (isLive && isLive());
    if (busy || Date.now() - lastSample > 5 * 60000) { try { await sampleHeat(); } catch {} }
    heatTimer = setTimeout(tick, 30000);
  };
  tick();
}
function stopHeat() { clearTimeout(heatTimer); }
const GAME_TYPE = { ets2: 1, ats: 2, promods: 3 };
function heatList(game = 'ets2', min = 0) {
  const m = heat[GAME_TYPE[game] || 1];
  const out = [];
  for (const [k, v] of m) { if (v < min) continue; const [x, y] = k.split(','); out.push([(+x + 0.5) * 1000, (+y + 0.5) * 1000, Math.round(v * 100) / 100]); }
  return out;
}
module.exports = { area, players, locations, friends, checkUpdate, newer, fullmap, startHeat, stopHeat, heatList, touchHeat, GAME_TYPE };
