// Cliente de la API pública de TruckersMP con caché
const BASE = 'https://api.truckersmp.com/v2';
const UA = 'XitoTruckHub/1.0 (+https://github.com)';
const cache = new Map();

async function get(path, ttl = 60000) {
  if (/\/(null|undefined)(\/|$)/.test(path)) throw new Error('Configura tu ID en Ajustes');
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (r.status === 404) throw new Error('No existe en TruckersMP');
  if (!r.ok) throw new Error(`TruckersMP no responde (${r.status})`);
  const j = await r.json();
  if (j.error === true || j.error === 'true') throw new Error(typeof j.response === 'string' ? j.response : 'Error de TruckersMP');
  const v = j.response !== undefined ? j.response : j;
  cache.set(path, { t: Date.now(), v });
  return v;
}

module.exports = {
  player: (id) => get(`/player/${encodeURIComponent(id)}`, 120000),
  bans: (id) => get(`/bans/${encodeURIComponent(id)}`, 300000),
  servers: () => get('/servers', 30000),
  gameTime: () => get('/game_time', 30000),
  events: () => get('/events', 300000),
  vtc: (id) => get(`/vtc/${encodeURIComponent(id)}`, 300000),
  vtcMembers: (id) => get(`/vtc/${encodeURIComponent(id)}/members`, 300000),
  vtcEvents: (id) => get(`/vtc/${encodeURIComponent(id)}/events`, 300000),
  vtcNews: (id) => get(`/vtc/${encodeURIComponent(id)}/news`, 300000),
  rules: () => get('/rules', 3600000),
  version: () => get('/version', 3600000),
  userEvents: (id) => get(`/events/user/${encodeURIComponent(id)}`, 300000),
  vtcPartners: (id) => get(`/vtc/${encodeURIComponent(id)}/partners`, 3600000)
};
