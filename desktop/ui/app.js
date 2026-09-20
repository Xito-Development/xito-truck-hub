/* Xito Truck Hub — interfaz (PC y Android) */
'use strict';

// ---------- entorno ----------
const IS_CAP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const IS_ELECTRON = !!window.hubNative;
const LS = {
  get(k, d) { try { const v = localStorage.getItem('xth.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('xth.' + k, JSON.stringify(v)); } catch {} }
};
const S = {
  base: IS_CAP ? LS.get('hubUrl', null) : location.origin,
  mode: IS_CAP ? LS.get('mode', 'remote') : 'lan',
  pin: IS_CAP ? LS.get('pin', '') : '',
  settings: null, live: null, cur: null, status: { state: 'waiting' }, lan: null,
  connected: false, ws: null, route: 'cabina', maxDist: 0
};

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const n0 = (v) => nf0.format(Math.round(v || 0));
const n1 = (v) => nf1.format(v || 0);
const cur = (g) => (String(g || S.live?.game || '').toLowerCase() === 'ats' ? '$' : '€');
const money = (v, g) => `${v < 0 ? '−' : ''}${n0(Math.abs(v || 0))} ${cur(g)}`;
const pct = (v) => `${Math.round((v || 0) * 100)} %`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// ---------- unidades ----------
const U = {
  get u() { return (IS_CAP ? LS.get('units', null) : null) || S.settings?.units || {}; },
  mph() { return this.u.speed === 'mph'; },
  speed(kmh) { return this.mph() ? kmh * 0.621371 : kmh; },
  speedUnit() { return this.mph() ? 'mph' : 'km/h'; },
  dist(km, dec = 1) { const v = this.mph() ? km * 0.621371 : km; return `${dec ? n1(v) : n0(v)} ${this.mph() ? 'mi' : 'km'}`; },
  distN(km) { return this.mph() ? km * 0.621371 : km; },
  distUnit() { return this.mph() ? 'mi' : 'km'; },
  temp(c) { return this.u.temp === 'f' ? `${n0(c * 9 / 5 + 32)} °F` : `${n0(c)} °C`; },
  vol(l) { return this.u.volume === 'gal' ? `${n0(l * 0.264172)} gal` : `${n0(l)} l`; },
  volN(l) { return this.u.volume === 'gal' ? l * 0.264172 : l; },
  volUnit() { return this.u.volume === 'gal' ? 'gal' : 'l'; },
  mass(kg) { return this.u.weight === 'lb' ? `${n0(kg * 2.20462)} lb` : `${n1(kg / 1000)} t`; }
};
function dur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function gameClock(min) {
  min = Math.max(0, Math.floor(min || 0));
  const d = Math.floor(min / 1440) % 7, h = Math.floor((min % 1440) / 60), m = min % 60;
  return `${DAYS[d]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: s > 3e7 ? 'numeric' : undefined });
}
const fdate = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const OFFENCES = {
  Crash: 'Colisión', Avoid_sleeping: 'No descansar', Wrong_way: 'Sentido contrario', Speeding_camera: 'Radar de velocidad',
  No_lights: 'Sin luces', Red_signal: 'Semáforo en rojo', Avoid_weighting: 'Evitar la báscula', Speeding: 'Exceso de velocidad',
  Illegal_trailer: 'Remolque ilegal', Avoid_Inspection: 'Evitar inspección', Illegal_Border_Crossing: 'Frontera ilegal',
  Hard_Shoulder_Violation: 'Circular por el arcén', Damaged_Vehicle_Usage: 'Vehículo dañado', Generic: 'Infracción', NoValue: 'Infracción'
};
const MARKETS = { cargo_market: 'Mercado de carga', quick_job: 'Trabajo rápido', freight_market: 'Mercado de fletes', external_contracts: 'Contrato externo', external_market: 'World of Trucks', NoValue: '—' };

// ---------- iconos ----------
const P = {
  cabina: '<path d="M12 14l4-4"/><path d="M3.5 17a9 9 0 1 1 17 0"/><circle cx="12" cy="14" r="1.2"/>',
  entregas: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  stats: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/>',
  eventos: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  tmp: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  vtc: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.8c2 .8 3.2 2.6 3.7 5.2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mas: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  fine: '<path d="M12 3l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6"/>',
  toll: '<path d="M4 21V5"/><path d="M4 7h16"/><path d="M8 7v3"/><path d="M13 7v3"/><path d="M18 7v3"/>',
  ferry: '<path d="M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/><path d="M5 14l1-5h12l1 5"/><path d="M9 9V5h6v4"/>',
  train: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12"/><path d="M8 21l2-3"/><path d="M16 21l-2-3"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h4"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  low: '<path d="M4 9c3-2 6-2 9 0v6c-3 2-6 2-9 0z"/><path d="M15 8l5-1"/><path d="M15 12h5"/><path d="M15 16l5 1"/>',
  high: '<path d="M4 9c3-2 6-2 9 0v6c-3 2-6 2-9 0z"/><path d="M15 7h6"/><path d="M15 12h6"/><path d="M15 17h6"/>',
  beacon: '<path d="M6 18h12"/><path d="M8 18v-5a4 4 0 0 1 8 0v5"/><path d="M12 3v2"/><path d="M4.5 6l1.5 1.5"/><path d="M19.5 6L18 7.5"/>',
  park: '<circle cx="12" cy="12" r="8"/><path d="M10 16V8h2.5a2.5 2.5 0 0 1 0 5H10"/>',
  engine: '<path d="M4 10h3l2-3h5l2 3h3v7h-3l-2 2H9l-2-2H4z"/>',
  left: '<path d="M10 5l-7 7 7 7v-4h9V9h-9z"/>',
  right: '<path d="M14 5l7 7-7 7v-4H5V9h9z"/>',
  cruise: '<circle cx="12" cy="12" r="8"/><path d="M12 12l3-3"/><path d="M8 16h8"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  trafico: '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="17" r="1.4"/>',
  mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  convoy: '<circle cx="5" cy="17" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="7" r="2"/><path d="M6.5 15.5l4-2M13.5 10.5l4-2"/>',
  botonera: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  tacho: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>',
  horn: '<path d="M3 10v4h3l7 5V5L6 10z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  recorridos: '<path d="M4 19c3-6 5-2 8-8s5-3 8-7"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="4" r="1.6"/>',
  plug: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>'
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- bus de eventos ----------
const BUS = {};
const on = (e, f) => ((BUS[e] = BUS[e] || new Set()).add(f), () => BUS[e].delete(f));
const emit = (e, d) => BUS[e] && BUS[e].forEach((f) => { try { f(d); } catch (err) { console.error(err); } });

// ---------- API ----------
async function api(path, opts = {}) {
  if (S.mode === 'remote') return Remote.call(opts.method || 'GET', path, opts.body, opts.timeout || 20000);
  if (!S.base) throw new Error('Sin conexión con el PC');
  const ctl = new AbortController();
  let tm;
  // En Android las peticiones nativas ignoran AbortController: el tiempo límite se impone con una carrera
  const timeout = new Promise((_, rej) => { tm = setTimeout(() => { ctl.abort(); rej(Object.assign(new Error('El PC no responde'), { name: 'AbortError' })); }, opts.timeout || 10000); });
  try {
    const r = await Promise.race([fetch(S.base + path, {
      method: opts.method || 'GET', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-hub-pin': S.pin || '' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }), timeout]);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El PC no responde');
    throw e;
  } finally { clearTimeout(tm); }
}
const post = (path, body) => api(path, { method: 'POST', body });

// TruckersMP: a través del PC o directo (móvil sin PC)
const TMP_DIRECT = {
  rules: () => '/rules',
  player: (id) => `/player/${id}`, bans: (id) => `/bans/${id}`, servers: () => '/servers', gametime: () => '/game_time',
  events: () => '/events', vtc: (id) => `/vtc/${id}`, 'vtc/members': (id) => `/vtc/${id}/members`, 'vtc/events': (id) => `/vtc/${id}/events`
};
async function tmp(kind, id) {
  if (S.connected) return api(`/api/tmp/${kind}${id ? `?id=${encodeURIComponent(id)}` : ''}`);
  const sid = id || (kind.startsWith('vtc') ? tmpIds().vtc : tmpIds().player);
  const r = await fetch('https://api.truckersmp.com/v2' + TMP_DIRECT[kind](sid));
  const j = await r.json();
  if (j.error === true || j.error === 'true') throw new Error('TruckersMP no devolvió datos');
  return j.response !== undefined ? j.response : j;
}
function tmpIds() {
  return { player: S.settings?.tmpId || LS.get('tmpId', null), vtc: S.settings?.vtcId || LS.get('vtcId', 92307) };
}

// ---------- tiempo real ----------
// ---------- acceso remoto (desde cualquier lugar, cifrado de extremo a extremo) ----------
const Remote = (() => {
  const BROKERS = ['wss://public:public@public.cloud.shiftr.io', 'wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  let client = null, key = null, topic = '', cid = '', pending = new Map(), hb = null, idx = 0, fails = 0;
  const b64 = { to: (u8) => btoa(String.fromCharCode(...u8)), from: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) };
  async function derive(code) {
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('xth:' + c)));
    topic = 'xth/' + [...h].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(c), 'PBKDF2', false, ['deriveKey']);
    key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('xito-truck-hub'), iterations: 20000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function enc(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64.to(out);
  }
  async function dec(str) {
    const buf = b64.from(str);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function connect(code) {
    disconnect();
    if (!window.mqtt) throw new Error('Falta el módulo de conexión remota');
    await derive(code);
    cid = Math.random().toString(36).slice(2, 10);
    const cl = window.mqtt.connect(LS.get('remoteBroker', '') || BROKERS[idx], { clientId: 'xth-app-' + cid, connectTimeout: 12000, reconnectPeriod: 6000, keepalive: 45, clean: true });
    client = cl;
    cl.on('connect', async () => {
      fails = 0;
      cl.subscribe([`${topic}/pc`, `${topic}/res/${cid}`]);
      const hi = async () => cl.publish(`${topic}/hi`, await enc({ cid, t: 'hi' }));
      hi(); clearInterval(hb); hb = setInterval(hi, 20000);
    });
    cl.on('offline', () => { if (S.mode === 'remote') { S.connected = false; emit('conn'); } if (++fails >= 2) { idx = (idx + 1) % BROKERS.length; setTimeout(() => S.mode === 'remote' && connect(code), 300); } });
    cl.on('message', async (t, payload) => {
      let m; try { m = await dec(payload.toString()); } catch { return; }
      if (t.endsWith('/res/' + cid)) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.status === 200 ? p.ok(m.body) : p.ko(new Error(m.body?.error || 'Error ' + m.status)); } return; }
      if (!S.connected) { S.connected = true; S.wsFails = 0; emit('conn'); }
      S.lastRemote = Date.now();
      onHubMsg(m);
    });
  }
  function disconnect() { clearInterval(hb); if (client) { try { client.end(true); } catch {} client = null; } pending.forEach((p) => p.ko(new Error('Desconectado'))); pending.clear(); }
  function call(method, path, body, timeout) {
    return new Promise(async (ok, ko) => {
      if (!client || !client.connected) return ko(new Error('Sin conexión remota con el PC'));
      const id = Math.random().toString(36).slice(2);
      const tm = setTimeout(() => { pending.delete(id); ko(new Error('El PC no responde')); }, timeout);
      pending.set(id, { ok: (v) => { clearTimeout(tm); ok(v); }, ko: (e) => { clearTimeout(tm); ko(e); } });
      client.publish(`${topic}/req`, await enc({ id, cid, method, path, body }));
    });
  }
  // El PC deja de enviar si no oye al móvil: si en 45 s no llega nada, se marca como desconectado
  setInterval(() => { if (S.mode === 'remote' && S.connected && Date.now() - (S.lastRemote || 0) > 45000) { S.connected = false; emit('conn'); } }, 10000);
  return { connect, disconnect, call };
})();

function connectHub() {
  if (S.mode === 'remote') { const code = LS.get('remoteCode', ''); if (code) Remote.connect(code).catch((e) => toast('Conexión remota', e.message, 'x', 'bad')); return; }
  connectWs();
}

function connectWs() {
  if (!S.base) return;
  try { S.ws && S.ws.close(); } catch {}
  const url = S.base.replace(/^http/, 'ws') + '/ws' + (S.pin ? `?pin=${encodeURIComponent(S.pin)}` : '');
  const ws = new WebSocket(url);
  S.ws = ws;
  ws.onopen = () => { S.connected = true; S.wsFails = 0; emit('conn'); };
  ws.onclose = () => {
    if (S.ws !== ws) return;
    const was = S.connected;
    S.connected = false; if (was) emit('conn');
    S.wsFails = (S.wsFails || 0) + 1;
    // En el móvil: si el PC responde pero rechaza el PIN, se pide de nuevo
    if (IS_CAP && S.wsFails === 3) api('/api/state', { timeout: 4000 }).catch((e) => {
      if (e.message === 'PIN incorrecto' && !$('.modal-back')) { toast('El PIN del PC ha cambiado', 'Vuelve a escribirlo para conectar.', 'phone', 'bad'); connectScreen(); }
    });
    setTimeout(() => { if (S.ws === ws) connectWs(); }, Math.min(15000, 2000 + S.wsFails * 1000));
  };
  ws.onmessage = (m) => { let msg; try { msg = JSON.parse(m.data); } catch { return; } onHubMsg(msg); };
}


// Mensajes en tiempo real del PC (llegan por WebSocket local o por el acceso remoto)
function onHubMsg(msg) {
  if (msg.t === 'hello') {
    S.status = msg.status || S.status; S.live = msg.live; S.settings = msg.settings; S.cur = msg.current; S.traffic = msg.traffic;
    applyTheme(); emit('status'); emit('tel'); emit('traffic');
  } else if (msg.t === 'tel') {
    S.live = msg.d; S.curLive = msg.cur; if (msg.ses) S.ses = msg.ses; if (msg.tacho) S.tacho = msg.tacho; emit('tel');
  } else if (msg.t === 'status') {
    S.status = msg.d; emit('status');
  } else if (msg.t === 'ev') {
    eventToast(msg.d); emit('ev', msg.d);
  } else if (msg.t === 'job') {
    if (msg.d.phase !== 'started') { S.navRoute = null; S.viaPassed = new Set(); }
    if (msg.d.phase === 'started') { S.maxDist = 0; toast('Nuevo trabajo', `${msg.d.job.fromCity} → ${msg.d.job.toCity} · ${msg.d.job.cargo}`, 'entregas'); }
    emit('job', msg.d);
  } else if (msg.t === 'route') {
    S.navRoute = msg.d; emit('route');
  } else if (msg.t === 'traffic') {
    S.traffic = msg.d; emit('traffic');
  } else if (msg.t === 'alert') {
    const a = msg.d;
    if (a.kind === 'convoy') { S.convoyFeed = [a, ...(S.convoyFeed || [])].slice(0, 30); }
    const icon = a.achievement ? 'star' : a.id.startsWith('rest') ? 'calendar' : a.id === 'fuel' ? 'fuel' : a.id === 'speed' ? 'cabina' : a.id === 'damage' ? 'fine' : 'trafico';
    toast(a.title, a.text, icon, a.level === 'bad' ? 'bad' : a.level === 'good' ? 'good' : a.level === 'info' ? 'alt' : ''); emit('alert', a);
    if (IS_CAP) { const Hp = window.Capacitor?.Plugins?.Haptics; if (Hp) (a.level === 'bad' ? Hp.notification({ type: 'ERROR' }) : Hp.impact({ style: 'LIGHT' })).catch(() => {}); }
    sysNotify(a.title, a.text);
    if (IS_CAP && window.HubSound) HubSound.alert(a, { alerts: { ...(S.settings?.alerts || {}), ...LS.get('mobileSound', {}) } }, 'movil');
  } else if (msg.t === 'settings') {
    S.settings = msg.settings; applyTheme(); emit('settings');
  }
  if (msg.t === 'game') { S.game = msg.d; emit('game'); }
  if (msg.t === 'convoy') { S.convoy = msg.d; emit('convoy'); }
  if (msg.t === 'laliga') { S.laliga = msg.d; renderLaliga(); }
  if (msg.t === 'update') emit('update', msg.d);
  if (msg.t === 'hello' && msg.laliga) { S.laliga = msg.laliga; renderLaliga(); }
  if (msg.t === 'hello') { if (msg.convoy) { S.convoy = msg.convoy; emit('convoy'); } if (msg.tacho) S.tacho = msg.tacho; }
  if (msg.t === 'hello' && msg.game) { S.game = msg.game; emit('game'); }
}

// ---------- temas ----------
const THEMES = [
  { id: 'autopista', name: 'Autopista nocturna', c: ['#0e1522', '#172237', '#ffb547', '#7aa7ff'] },
  { id: 'costa', name: 'Costa', c: ['#05202a', '#0b303b', '#45d6c8', '#ff9a76'] },
  { id: 'neon', name: 'Neón', c: ['#120d22', '#1c1533', '#ff5bd6', '#43e0ff'] },
  { id: 'grafito', name: 'Grafito', c: ['#141518', '#1d1f24', '#9db4ff', '#f5c26b'] },
  { id: 'amanecer', name: 'Amanecer', c: ['#f7f2fb', '#ffffff', '#7b5cff', '#ff8a70'] },
  { id: 'niebla', name: 'Niebla', c: ['#eef2ef', '#ffffff', '#2e8b67', '#d97706'] }
];
function currentTheme() {
  const t = (IS_CAP ? LS.get('theme', null) : null) || S.settings?.theme || LS.get('theme', 'autopista');
  if (t === 'alboran') return 'costa'; // nombre antiguo del tema
  return THEMES.some((x) => x.id === t) ? t : 'autopista';
}
// Ajusta la barra de título de Windows y la barra de estado del móvil al tema
// Apariencia: acento, densidad, redondeo, tamaño, animaciones…
function appearance() { return { ...(S.settings?.appearance || {}), ...(IS_CAP ? LS.get('appearance', {}) : {}) }; }
function applyAppearance() {
  const a = appearance(), root = document.documentElement, st = root.style;
  if (a.accent && /^#[0-9a-f]{6}$/i.test(a.accent)) {
    const r = parseInt(a.accent.slice(1, 3), 16), g = parseInt(a.accent.slice(3, 5), 16), b = parseInt(a.accent.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    st.setProperty('--accent', a.accent); st.setProperty('--accent-soft', `rgba(${r},${g},${b},.14)`);
    st.setProperty('--accent-ink', lum > 0.6 ? '#1a1300' : '#ffffff'); st.setProperty('--glow', `rgba(${r},${g},${b},.10)`);
  } else ['--accent', '--accent-soft', '--accent-ink', '--glow'].forEach((v) => st.removeProperty(v));
  st.setProperty('--rs', String(clamp(+a.radius || 1, 0, 1.6)));
  st.setProperty('--fs', String(clamp(+a.fontScale || 1, 0.8, 1.35)));
  root.dataset.density = a.density || 'normal';
  root.classList.toggle('no-motion', a.motion === false);
  root.classList.toggle('no-glow', a.glow === false);
  root.classList.toggle('compact-nav', !!a.compactNav);
  const lang = (IS_CAP ? LS.get('language', null) : null) || S.settings?.language || LS.get('language', 'es');
  if (window.I18N && I18N.lang !== lang) I18N.set(lang);
  emit('theme');
}
function syncChrome() {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg').trim(), fg = cs.getPropertyValue('--text').trim();
  if (IS_ELECTRON) window.hubNative.setTheme(bg, fg);
  const SB = IS_CAP && window.Capacitor?.Plugins?.StatusBar;
  if (SB) {
    SB.setOverlaysWebView?.({ overlay: false }).catch?.(() => {});
    const light = ['amanecer', 'niebla'].includes(document.documentElement.dataset.theme);
    SB.setStyle({ style: light ? 'LIGHT' : 'DARK' }).catch(() => {});
    SB.setBackgroundColor({ color: bg.length === 4 ? '#' + [...bg.slice(1)].map((c) => c + c).join('') : bg }).catch(() => {});
  }
  const meta = document.querySelector('meta[name=theme-color]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.content = bg;
}
function applyTheme(animFrom) {
  const t = currentTheme();
  if (document.documentElement.dataset.theme === t) { applyAppearance(); syncChrome(); return; }
  const set = () => { document.documentElement.dataset.theme = t; applyAppearance(); syncChrome(); };
  if (animFrom && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const { x, y } = animFrom;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(set);
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.3,.8,.2,1)', pseudoElement: '::view-transition-new(root)' }
    )).catch(() => {});
  } else set();
}
async function setTheme(id, ev) {
  LS.set('theme', id);
  if (!IS_CAP && S.connected) { S.settings = { ...S.settings, theme: id }; post('/api/settings', { theme: id }).catch(() => {}); }
  applyTheme(ev ? { x: ev.clientX, y: ev.clientY } : null);
  $$('.theme-opt').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
}

// ---------- avisos ----------
function toast(title, sub, icon = 'eventos', kind = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ico ${kind}">${ic(icon)}</span><div><b>${esc(title)}</b><small>${esc(sub || '')}</small></div>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200);
}

// ---------- ventana de confirmación (sustituye a confirm/prompt, que no existen en Electron) ----------
function askInput({ title, text, placeholder = '', ok = 'Aceptar', value = '' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:440px"><h2>${esc(title)}</h2><p class="lead">${esc(text)}</p>
      <input class="input" id="aiIn" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off">
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-no>Cancelar</button><button class="btn primary" data-yes>${esc(ok)}</button></div></div>`;
    document.body.appendChild(back);
    const inp = back.querySelector('#aiIn'); inp.focus();
    const done = (v) => { back.remove(); resolve(v); };
    back.querySelector('[data-no]').onclick = () => done(null);
    back.querySelector('[data-yes]').onclick = () => done(inp.value.trim() || null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); };
  });
}
function askConfirm({ title, text, ok = 'Aceptar', danger = false, typeWord = null }) {
  return new Promise((resolve) => {
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" style="max-width:440px"><h2>${esc(title)}</h2><p class="lead">${esc(text)}</p>
      ${typeWord ? `<input class="input" id="cfWord" placeholder="Escribe ${esc(typeWord)}" autocomplete="off" style="margin-bottom:6px">` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes ${typeWord ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    document.body.appendChild(back);
    const done = (v) => { back.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', key);
    back.querySelector('[data-no]').onclick = () => done(false);
    back.onclick = (e) => { if (e.target === back) done(false); };
    const yes = back.querySelector('[data-yes]');
    yes.onclick = () => done(true);
    const w = back.querySelector('#cfWord');
    if (w) { w.oninput = () => { yes.disabled = w.value.trim().toUpperCase() !== typeWord; }; w.focus(); } else yes.focus();
  });
}
function eventToast(e) {
  if (e.type === 'job_delivered') sysNotify('Entrega completada', `+${money(e.revenue)} · ${n0(e.xp)} XP`);
  else if (e.type === 'fined') sysNotify('Multa', `${OFFENCES[e.offence] || 'Infracción'} · ${money(-e.amount)}`);
  const snd = { fined: ['Multa', OFFENCES[e.offence] || 'Infracción', 'bad'], job_delivered: ['Entrega completada', '', 'good'], job_cancelled: ['Trabajo cancelado', '', 'bad'] }[e.type];
  if (snd && IS_CAP && window.HubSound) HubSound.alert({ title: snd[0], text: snd[1], level: snd[2] }, { alerts: S.settings?.alerts }, 'movil');
  switch (e.type) {
    case 'job_delivered': toast('Entrega completada', `${money(e.revenue)} · ${n0(e.xp)} XP · ${n0(e.distanceKm)} km`, 'check', 'good'); break;
    case 'job_cancelled': toast('Trabajo cancelado', `Penalización ${money(-Math.abs(e.penalty || 0))}`, 'x', 'bad'); break;
    case 'fined': toast(`Multa: ${OFFENCES[e.offence] || 'Infracción'}`, money(-e.amount), 'fine', 'bad'); break;
    case 'tollgate': toast('Peaje pagado', money(-e.amount), 'toll', 'alt'); break;
    case 'ferry': toast('Ferry', `${e.from} → ${e.to} · ${money(-e.amount)}`, 'ferry', 'alt'); break;
    case 'train': toast('Tren', `${e.from} → ${e.to} · ${money(-e.amount)}`, 'train', 'alt'); break;
    case 'refuel': toast('Repostaje', `${n0(e.liters)} litros`, 'fuel'); break;
  }
}

// ---------- hoja lateral ----------
function openSheet(html) {
  closeSheet(true);
  const back = document.createElement('div'); back.className = 'sheet-back';
  const sh = document.createElement('aside'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog');
  sh.innerHTML = `<div class="row between" style="margin-bottom:6px"><span></span><button class="btn ghost" data-close aria-label="Cerrar">${ic('x')}</button></div>${html}`;
  document.body.append(back, sh);
  requestAnimationFrame(() => { back.classList.add('show'); sh.classList.add('show'); });
  const close = () => closeSheet();
  back.onclick = close; sh.querySelector('[data-close]').onclick = close;
  sh.tabIndex = -1; sh.focus({ preventScroll: true });
  return sh;
}
// Botón «Jugar»: abre el launcher de TruckersMP (o el juego en Steam)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-launch]'); if (!b) return;
  b.disabled = true;
  try {
    const r = await post('/api/launch', { target: b.dataset.launch });
    toast(r.how === 'download' ? 'No encuentro el launcher' : 'Abriendo…', r.how === 'download' ? 'Te llevo a la web de TruckersMP para descargarlo.' : r.how === 'launcher' ? 'TruckersMP Launcher' : 'Steam', 'play', r.how === 'download' ? '' : 'good');
  } catch (err) { toast('No se pudo abrir', err.message, 'x', 'bad'); }
  setTimeout(() => (b.disabled = false), 4000);
});
// Atajos: Ctrl + 1…9 cambian de sección y «/» busca
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) { const n = NAV[+e.key - 1]; if (n) { e.preventDefault(); go(n.id); } return; }
  if (e.key === '/' && !e.ctrlKey) { const f = $('#jobQ') || $('#mapSearch'); if (f) { e.preventDefault(); f.focus(); } }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.sheet.show') && !$('.modal-back')) closeSheet(); });
function closeSheet(instant) {
  $$('.sheet, .sheet-back').forEach((el) => {
    if (instant) return el.remove();
    el.classList.remove('show'); setTimeout(() => el.remove(), 450);
  });
}

// ---------- navegación ----------
const NAV = [
  { id: 'cabina', label: 'Cabina' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'entregas', label: 'Entregas' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'recorridos', label: 'Mis recorridos' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'trafico', label: 'Tráfico' },
  { id: 'convoy', label: 'Convoy' },
  { id: 'botonera', label: 'Botonera' },
  { id: 'tmp', label: 'TruckersMP' },
  { id: 'vtc', label: 'Mi VTC' },
  { id: 'ajustes', label: 'Ajustes' }
];
const MOB_MAIN = ['cabina', 'mapa', 'botonera', 'stats'];
let cleanup = null;

function buildNav() {
  const mb = $('#mbar'); if (mb) { mb.querySelector('.brand-mark').innerHTML = ic('truck'); mb.querySelector('.mbar-btn').innerHTML = ic('ajustes'); }
  $('#rail').innerHTML = `
    <div class="brand"><span class="brand-mark">${ic('truck')}</span><span class="brand-name">Xito Truck Hub<small>Xito Development</small></span></div>
    ${NAV.map((n) => `<button class="nav-btn" data-go="${n.id}">${ic(n.id)}<span>${n.label}</span></button>`).join('')}
    <div class="rail-foot"><div class="conn"><span class="dot" id="railDot"></span><span id="railConn">Conectando…</span></div>
      <button class="btn primary play-mini hidden" id="railPlay" data-launch="tmp">${ic('play')}<span>Jugar</span></button></div>`;
  $('#mobnav').innerHTML = MOB_MAIN.map((id) => `<button data-go="${id}">${ic(id)}<span>${NAV.find((n) => n.id === id).label.replace('Estadísticas', 'Stats')}</span></button>`).join('')
    + `<button data-more>${ic('mas')}<span>Más</span></button>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { e.preventDefault(); closeSheet(); go(b.dataset.go); }
    if (e.target.closest('[data-more]')) openMore();
  });
}
function openMore() {
  const extra = NAV.filter((n) => !MOB_MAIN.includes(n.id));
  openSheet(`<h2 style="font-size:22px;margin-bottom:12px">Más</h2><div class="list">${extra.map((n) =>
    `<button class="item" data-go="${n.id}"><span class="ico">${ic(n.id)}</span><span class="grow"><span class="t">${n.label}</span></span></button>`).join('')}</div>`);
}
function markNav() {
  $$('[data-go]').forEach((b) => { if (b.dataset.go === S.route) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const more = $('[data-more]');
  if (more) { if (!MOB_MAIN.includes(S.route)) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
}
function go(route, push = true) {
  if (!VIEWS[route]) route = 'cabina';
  if (S.closeDash) S.closeDash();
  S.route = route;
  if (push) history.replaceState(null, '', '#' + route);
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const v = $('#view');
  v.classList.remove('view-enter'); void v.offsetWidth; v.classList.add('view-enter');
  $('#main').scrollTop = 0;
  cleanup = VIEWS[route](v) || null;
  markNav();
  const mt = $('#mbarTitle'); if (mt) mt.textContent = (NAV.find((n) => n.id === route) || {}).label || '';
}
function updateConn() {
  const mc = $('#mbarConn');
  if (mc) {
    const st = S.status?.state;
    mc.querySelector('.dot').className = 'dot ' + (!S.connected ? '' : st === 'connected' ? 'on' : 'wait');
    mc.querySelector('span:last-child').textContent = !S.connected ? 'Sin PC' : st === 'connected' ? 'En ruta' : 'PC';
  }
  const dot = $('#railDot'), txt = $('#railConn');
  if (!dot) return;
  const st = S.status?.state;
  if (!S.connected) { dot.className = 'dot'; txt.textContent = IS_CAP ? 'PC desconectado' : 'Iniciando…'; return; }
  if (st === 'connected') { dot.className = 'dot on'; txt.textContent = S.status.msg === 'Modo demostración' ? 'Demostración activa' : 'Juego conectado'; }
  else { dot.className = 'dot wait'; txt.textContent = 'Esperando al juego'; }
}
on('conn', updateConn); on('status', updateConn);
on('game', () => { const b = $('#railPlay'); if (b) b.classList.toggle('hidden', !!S.game?.running || !S.connected || IS_CAP); if (S.route === 'cabina' && $('.play-card')) go('cabina', false); });

// ---------- motor de animación de valores en directo ----------
const smooth = { speed: 0, rpm: 0, lane: 0 };
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  const t = S.live?.truck;
  const target = t ? Math.abs(U.speed(t.speed)) : 0;
  smooth.speed += (target - smooth.speed) * Math.min(1, dt * 7);
  smooth.rpm += ((t?.rpm || 0) - smooth.rpm) * Math.min(1, dt * 8);
  const spd = $('#spd');
  if (spd) {
    spd.textContent = Math.round(smooth.speed);
    const rp = $('#rpmBar'); if (rp) rp.style.width = clamp(smooth.rpm / (t?.rpmMax || 2500), 0, 1) * 100 + '%';
    const lanes = $('#lanes');
    if (lanes) { smooth.lane = (smooth.lane + smooth.speed * dt * 9) % 34; lanes.style.backgroundPosition = `0 ${smooth.lane}px`; }
  }
  const ds = $('#dSpd'); if (ds) ds.textContent = Math.round(smooth.speed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- vistas ----------
const VIEWS = {};

function notConnectedCard() {
  if (IS_CAP && !S.connected) return `<div class="card empty">${ic('phone')}<b>Sin conexión con el PC</b>Abre Xito Truck Hub en tu ordenador y comprueba que estás en la misma Wi‑Fi.<div style="margin-top:16px"><button class="btn primary" data-go="ajustes">Revisar conexión</button></div></div>`;
  const running = S.game?.running;
  return `<div class="card empty play-card">${ic('truck')}<b>${running ? 'El juego está abierto' : 'Euro Truck Simulator 2 está cerrado'}</b>${running ? 'Carga tu perfil y conduce: la cabina se llenará sola. Si no aparece nada, instala el plugin de telemetría.' : 'Abre TruckersMP y conduce: la cabina se llenará sola.'}
    <div class="row" style="justify-content:center;margin-top:20px;gap:10px;flex-wrap:wrap">
      ${!running && S.connected ? `<button class="btn primary play-btn" data-launch="tmp">${ic('play')}Jugar a TruckersMP</button><button class="btn" data-launch="ets2">Un jugador (Steam)</button>` : ''}
      <button class="btn" data-go="ajustes">${ic('plug')}Plugin</button>${IS_CAP ? '' : `<button class="btn ghost" id="demoBtn">Modo demostración</button>`}</div>
    ${S.laliga?.blocked ? '<p class="bad" style="margin-top:14px;font-weight:600">⚽ Ahora mismo TruckersMP puede no funcionar en España por los bloqueos del fútbol.</p>' : ''}
    ${!running && S.connected ? '<div class="srv-mini" id="srvMini"></div>' : ''}</div>`;
}

VIEWS.cabina = (root) => {
  let jobKey = null, lastLimit = -1;
  const meter = (id, label, kind = '') =>
    `<div class="meter"><div class="row"><span class="muted">${label}</span><b id="${id}T">—</b></div><div class="bar ${kind}" id="${id}B"><i id="${id}" style="width:0"></i></div></div>`;
  const setM = (id, val, max, txt, bad) => {
    const i = $('#' + id); if (!i) return;
    i.style.width = clamp(max ? val / max : 0, 0, 1) * 100 + '%';
    $('#' + id + 'T').textContent = txt;
    if (bad !== undefined) $('#' + id + 'B').classList.toggle('bad', !!bad);
  };
  const LAMPS = [['lLeft', 'left', 'Intermitente izquierdo', 'blink'], ['lLow', 'low', 'Luces de cruce', 'blue'], ['lHigh', 'high', 'Luces largas', 'blue'],
    ['lBeacon', 'beacon', 'Rotativos', ''], ['lPark', 'park', 'Freno de mano', 'red'], ['lEng', 'engine', 'Freno motor / retarder', ''],
    ['lCruise', 'cruise', 'Control de crucero', 'blue'], ['lRight', 'right', 'Intermitente derecho', 'blink']];
  const draw = () => {
    jobKey = null; lastLimit = -1;
    const live = S.live && S.live.sdk && S.status?.state === 'connected';
    if (!live) {
      root.innerHTML = `<div class="head"><div><h1>Cabina</h1><p>Tu camión en directo</p></div></div>${notConnectedCard()}`;
      if ($('#srvMini')) tmp('servers').then((list) => {
        const box = $('#srvMini'); if (!box) return;
        box.innerHTML = list.filter((x) => x.game === 'ETS2' && x.online !== false).slice(0, 5).map((x) => `<div class="srv-chip"><b>${esc(x.shortname || x.name)}</b><span>${n0(x.players)}/${n0(x.maxplayers)}${x.queue ? ` · cola ${x.queue}` : ''}</span><i style="width:${Math.min(100, (x.players / x.maxplayers) * 100)}%"></i></div>`).join('');
      }).catch(() => {});
      const d = $('#demoBtn'); if (d) d.onclick = async () => { d.disabled = true; await post('/api/settings', { demo: true }).catch((e) => toast('No se pudo activar', e.message, 'x', 'bad')); };
      root.dataset.mode = 'empty';
      return;
    }
    root.dataset.mode = 'live';
    const ck = appearance().cockpit || {};
    root.innerHTML = `
      <div class="head"><div><h1 id="truckName">Cabina</h1><p id="truckSub"></p></div>
        <div class="row wrap"><button class="pill" id="trafPill" data-go="trafico" style="cursor:pointer">Tráfico…</button><span class="pill acc" id="clock"></span><span class="pill" id="rest"></span>
        <button class="btn" id="dashBtn" style="padding:6px 12px">${ic('cabina')}Salpicadero</button></div></div>
      <div class="cockpit ${ck.hero === false || ck.job === false ? 'single' : ''}">
        <section class="card hero ${ck.hero === false ? 'hidden' : ''}">
          <div class="hero-top">
            <div class="speed" id="speedBox"><span class="v" id="spd">0</span><span class="u">${U.speedUnit()}</span></div>
            <div class="limit none" id="limit">–</div>
          </div>
          <div class="hero-meta">
            <div><span class="gear" id="gear">N</span></div>
            <div>Crucero<b id="cruise">—</b></div>
            <div>Autonomía<b id="range">—</b></div>
            <div>Cuentakilómetros<b id="odo">—</b></div>
          </div>
          <div class="rpm"><div class="row between muted" style="font-size:13px;margin-bottom:6px"><span>Régimen</span><span id="rpmTxt"></span></div><div class="bar"><i id="rpmBar" style="width:0;transition:none"></i></div></div>
          <div class="road" id="road"><div class="lanes"><i id="lanes"></i></div></div>
        </section>
        <section class="card ${ck.job === false ? 'hidden' : ''}" id="jobCard"></section>
      </div>
      <div class="grid g3" style="margin-top:16px" id="extraRow">
        <section class="card ${ck.session === false ? 'hidden' : ''}" id="sesCard"><h2>Sesión de hoy <span class="pill" id="sesTime"></span></h2><div class="grid g4 keep" style="gap:12px" id="sesBody"></div></section>
        <section class="card ${ck.goals === false ? 'hidden' : ''}" id="goalCard"><h2>Objetivos</h2><div id="goalBody" class="stack"></div></section>
        <section class="card ${ck.tacho === false || S.tacho?.enabled === false ? 'hidden' : ''}" id="tachoCard"><h2>Tacógrafo <span class="pill" id="tachoState"></span></h2><div class="stack" id="tachoBody"></div></section>
      </div>
      <div class="grid g3" style="margin-top:16px">
        <section class="card ${ck.tanks === false ? 'hidden' : ''}"><h2>Depósitos</h2><div class="meters">${meter('mFuel', 'Combustible')}${meter('mAd', 'AdBlue', 'alt')}${meter('mCons', 'Consumo', 'alt')}${meter('mAir', 'Aire', 'alt')}</div></section>
        <section class="card ${ck.damage === false ? 'hidden' : ''}"><h2>Estado del vehículo</h2><div class="meters">${meter('dEng', 'Motor', 'bad')}${meter('dTra', 'Transmisión', 'bad')}${meter('dCab', 'Cabina', 'bad')}${meter('dCha', 'Chasis', 'bad')}${meter('dWhe', 'Ruedas', 'bad')}${meter('dTrl', 'Remolque', 'bad')}</div></section>
        <section class="card ${ck.controls === false ? 'hidden' : ''}"><h2>Mandos</h2><div class="lamps">${LAMPS.map(([id, icon, title]) => `<span class="lamp" id="${id}" title="${title}" aria-label="${title}">${ic(icon)}</span>`).join('')}</div>
          <div class="meters" style="margin-top:18px">${meter('tWat', 'Agua', 'alt')}${meter('tOil', 'Aceite', 'alt')}</div></section>
      </div>`;
    $('#dashBtn').onclick = openDash;
    if (ck.session === false && ck.goals === false && ck.tacho === false) $('#extraRow').classList.add('hidden');
    loadGoals();
    update();
  };
  const loadGoals = async () => {
    const box = $('#goalBody'); if (!box || !S.connected) return;
    try {
      const g = await api('/api/goals');
      box.innerHTML = g.length ? g.map((x) => `<div class="meter"><div class="row"><span class="muted">${esc(x.name)}</span><b>${x.unit === 'money' ? money(x.value) : x.unit === 'km' ? U.dist(x.value, 0) : n0(x.value)} <span class="muted" style="font-weight:500">/ ${x.unit === 'money' ? money(x.goal) : x.unit === 'km' ? U.dist(x.goal, 0) : n0(x.goal)}</span></b></div>
        <div class="bar ${x.progress >= 1 ? 'good-bar' : ''}"><i style="width:${x.progress * 100}%"></i></div></div>`).join('') : '<p class="muted">Configura tus objetivos en Ajustes.</p>';
    } catch {}
  };
  const drawJob = (j) => {
    const jc = $('#jobCard');
    if (!j || !j.onJob) {
      jc.innerHTML = `<h2>Trabajo actual</h2><div class="empty" style="padding:30px 10px">${ic('entregas')}<b>Sin trabajo activo</b>Acepta una carga en el mercado para empezar a registrarla.</div>`;
      return;
    }
    jc.innerHTML = `<h2>Trabajo actual <span class="pill acc">${esc(MARKETS[j.market] || 'Trabajo')}</span></h2>
      <div class="route"><div><div class="city">${esc(j.fromCity)}</div><div class="comp">${esc(j.fromCompany)}</div></div>
        <span class="muted">${ic('truck')}</span>
        <div class="to"><div class="city">${esc(j.toCity)}</div><div class="comp">${esc(j.toCompany)}</div></div></div>
      <div class="route-line"><i id="jProgI"></i><b id="jProgB"></b></div>
      <div class="row between muted" style="font-size:13px"><span id="jLeft"></span><span id="jEta"></span></div>
      <div class="grid g2" style="margin-top:18px;gap:14px">
        <div class="kpi"><span class="v">${money(j.income)}</span><span class="l">Pago previsto</span></div>
        <div class="kpi"><span class="v">${n1(j.mass / 1000)}<small>t</small></span><span class="l">${esc(j.cargo)}</span></div>
        <div class="kpi"><span class="v" id="jDmg">0 %</span><span class="l">Daño de la carga</span></div>
        <div class="kpi"><span class="v"><span id="jKm">0</span><small>${U.distUnit()}</small></span><span class="l">Recorridos en este trabajo</span></div>
      </div>
      <div class="row between muted" style="margin-top:16px;font-size:13px"><span id="jDead"></span><span class="bad" id="jFines"></span></div>
      <div class="score-live" id="jScore"></div>
      <button class="route-hint hidden" id="jRoute" data-go="mapa"></button>`;
  };
  const trafPill = () => {
    const el = $('#trafPill'); if (!el) return;
    const n = S.traffic;
    if (!n) { el.textContent = 'Tráfico: sin datos'; el.className = 'pill'; return; }
    const L = TRAF[n.level] || TRAF.low;
    el.className = 'pill ' + L[1];
    el.textContent = n.online === false && !S.settings?.demo ? 'No estás en TruckersMP' : `Tráfico ${L[0].toLowerCase()} · ${n.around} cerca`;
  };
  const update = () => {
    const d = S.live; if (!d) return;
    const live = d.sdk && S.status?.state === 'connected';
    if ((root.dataset.mode === 'live') !== !!live) return draw();
    if (!live) return;
    const t = d.truck, j = d.job, n = d.nav;
    $('#truckName').textContent = [t.brand, t.name].filter(Boolean).join(' ') || 'Cabina';
    $('#truckSub').textContent = [t.plate, d.trailer?.attached ? `Remolque ${d.trailer.name || ''}`.trim() : 'Sin remolque', d.paused ? 'Pausa' : ''].filter(Boolean).join(' · ');
    $('#clock').textContent = gameClock(d.gameTime);
    $('#rest').textContent = d.restStop > 0 ? `Descanso en ${dur(d.restStop * 60)}` : 'Descanso: ya';
    $('#rest').className = 'pill' + (d.restStop > 0 && d.restStop <= 60 ? ' warn' : '');
    const lim = Math.round(n.limit || 0);
    const limEl = $('#limit');
    limEl.textContent = lim > 0 ? lim : '–';
    limEl.classList.toggle('none', lim <= 0);
    if (lim !== lastLimit && lim > 0) { limEl.classList.remove('pop'); void limEl.offsetWidth; limEl.classList.add('pop'); }
    lastLimit = lim;
    $('#speedBox').classList.toggle('over', lim > 0 && t.speed > lim + 3);
    $('#gear').textContent = gearLabel(t);
    $('#cruise').textContent = t.cruise ? `${Math.round(U.speed(t.cruiseSpeed))} ${U.speedUnit()}` : 'Apagado';
    $('#range').textContent = U.dist(t.fuelRange, 0);
    $('#odo').textContent = U.dist(t.odometer, 0);
    renderTacho();
    const ses = S.ses, sb = $('#sesBody');
    if (ses && sb) {
      $('#sesTime').textContent = dur(ses.driveSec);
      sb.innerHTML = `<div class="kpi"><span class="v" style="font-size:26px">${U.dist(ses.km, 0)}</span><span class="l">Recorridos</span></div>
        <div class="kpi"><span class="v" style="font-size:26px">${n0(ses.jobs)}</span><span class="l">Entregas</span></div>
        <div class="kpi"><span class="v" style="font-size:26px">${money(ses.revenue)}</span><span class="l">Ingresos</span></div>
        <div class="kpi"><span class="v ${ses.fines ? 'bad' : ''}" style="font-size:26px">${n0(ses.fines)}</span><span class="l">Multas</span></div>`;
    }
    $('#rpmTxt').textContent = `${n0(t.rpm)} rpm`;
    trafPill();

    // trabajo: la tarjeta solo se reconstruye cuando cambia el trabajo
    const key = j && j.onJob ? [j.fromCity, j.toCity, j.cargo, j.income].join('|') : 'none';
    if (key !== jobKey) { jobKey = key; S.maxDist = 0; drawJob(j); }
    if (j && j.onJob) {
      if (n.distance > S.maxDist) S.maxDist = n.distance;
      const total = Math.max(S.curLive?.startDistance || 0, S.maxDist, n.distance, 1);
      const prog = clamp(1 - n.distance / total, 0, 1);
      $('#jProgI').style.width = prog * 100 + '%'; $('#jProgB').style.left = prog * 100 + '%';
      $('#jLeft').textContent = `${U.dist(n.distance / 1000)} restantes`;
      $('#jEta').textContent = n.time > 0 ? `≈ ${dur(n.time)}` : '';
      $('#jDmg').textContent = pct(j.cargoDamage);
      $('#jKm').textContent = n1(U.distN(S.curLive?.drivenKm || 0));
      $('#jDead').textContent = j.deadline > 0 ? `Entrega antes de ${gameClock(j.deadline)}` : 'Sin límite de tiempo';
      const sc = S.curLive?.score, se = $('#jScore');
      if (se) se.innerHTML = sc ? `<span class="grade g-${sc.grade.replace('+', 'p')}">${sc.grade}</span><div><b>Nota de conducción: ${sc.score}</b><small>${sc.mode === 'real' ? 'Viaje Real' : 'Modo Carrera'}${sc.penalties.length ? ' · ' + esc(sc.penalties.slice(0, 2).map((p) => `${p.name} −${p.points}`).join(' · ')) : ' · sin penalizaciones'}</small></div>` : '';
      const rh = $('#jRoute'), nv = nextVia();
      if (rh) {
        const via = (S.navRoute?.popular?.via || []).map((v) => v.name);
        rh.classList.toggle('hidden', !S.navRoute);
        if (S.navRoute) rh.innerHTML = `${ic('trafico')}<span><b>Ruta más concurrida</b>${nv ? `Siguiente: ${esc(nv.name)} · ${U.dist(nv.km, 0)} en línea recta` : via.length ? esc(via.join(' → ')) : 'Sigue tu GPS'}</span>${ic('mapa')}`;
      }
      $('#jFines').textContent = S.curLive?.fines ? `${S.curLive.fines} multa${S.curLive.fines > 1 ? 's' : ''}` : '';
    }
    setM('mFuel', t.fuel, t.fuelCap, U.vol(t.fuel), t.warn.fuel);
    setM('mAd', t.adblue, t.adblueCap || 1, U.vol(t.adblue), t.warn.adblue);
    setM('mCons', t.fuelAvg, 0.6, `${n1(t.fuelAvg * 100)} l/100`);
    setM('mAir', t.air, 150, `${n0(t.air)} psi`, t.warn.air);
    const dm = t.damage, tdm = d.trailer?.attached ? d.trailer.damage : null;
    setM('dEng', dm.engine, 1, pct(dm.engine)); setM('dTra', dm.transmission, 1, pct(dm.transmission));
    setM('dCab', dm.cabin, 1, pct(dm.cabin)); setM('dCha', dm.chassis, 1, pct(dm.chassis)); setM('dWhe', dm.wheels, 1, pct(dm.wheels));
    const trl = tdm ? Math.max(tdm.body, tdm.chassis, tdm.wheels) : 0;
    setM('dTrl', trl, 1, tdm ? pct(trl) : '—');
    const L = t.lights;
    const st = { lLeft: L.left || L.hazard, lLow: L.low, lHigh: L.high, lBeacon: L.beacon, lPark: t.parking, lEng: t.engineBrake || t.retarder > 0, lCruise: t.cruise, lRight: L.right || L.hazard };
    for (const [id, , title, cls] of LAMPS) {
      const el = $('#' + id); const onv = !!st[id];
      el.className = 'lamp' + (onv ? ' on ' + cls : '');
      el.setAttribute('aria-label', title + (onv ? ' encendido' : ''));
    }
    setM('tWat', t.waterTemp, 120, U.temp(t.waterTemp), t.warn.water);
    setM('tOil', t.oilTemp, 130, U.temp(t.oilTemp), t.warn.oil);
  };
  draw();
  const gi = setInterval(loadGoals, 60000);
  const offs = [on('tel', update), on('status', () => draw()), on('conn', () => draw()), on('traffic', trafPill), on('job', (d) => d.phase === 'delivered' && loadGoals()), on('settings', () => draw())];
  return () => { clearInterval(gi); offs.forEach((f) => f()); };
};
function renderTacho() {
  const T = S.tacho, box = $('#tachoBody'); if (!T || !box) return;
  const b = T.block / T.blockMax, d = T.day / T.dayMax;
  const left = Math.max(0, T.blockMax - T.block);
  $('#tachoState').textContent = b >= 1 ? 'Pausa obligatoria' : b > 0.94 ? 'Pausa pronto' : 'En regla';
  $('#tachoState').className = 'pill ' + (b >= 1 || d >= 1 ? 'bad' : b > 0.94 || d > 0.94 ? 'warn' : 'good');
  box.innerHTML = `<div class="meter"><div class="row"><span class="muted">Conducción seguida</span><b>${dur(T.block)} / ${dur(T.blockMax)}</b></div><div class="bar ${b >= 1 ? 'bad' : ''}"><i style="width:${Math.min(1, b) * 100}%"></i></div></div>
    <div class="meter"><div class="row"><span class="muted">Hoy</span><b>${dur(T.day)} / ${dur(T.dayMax)}</b></div><div class="bar alt ${d >= 1 ? 'bad' : ''}"><i style="width:${Math.min(1, d) * 100}%"></i></div></div>
    <p class="muted" style="font-size:13px">${b >= 1 ? `Descansa ${dur(T.breakLeft)} para reiniciar` : `Puedes conducir ${dur(left)} más antes de la pausa${T.brk ? ` · pausa acumulada ${dur(T.brk)}` : ''}`}</p>`;
}
// Aviso fijo mientras LaLiga bloquea Cloudflare en España (hayahora.futbol)
function renderLaliga() {
  let el = $('#lalBanner');
  const on = S.laliga?.blocked && S.settings?.alerts?.laliga !== false && S.lalHidden !== (S.laliga?.since || true);
  if (!on) { if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 350); } return; }
  if (!el) { el = document.createElement('div'); el.id = 'lalBanner'; el.className = 'lal-banner'; document.body.appendChild(el); }
  const since = S.laliga.since ? new Date(S.laliga.since).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML = `<span class="lal-ball">⚽</span><div><b>TruckersMP caído temporalmente en España</b><small>Hay fútbol: LaLiga está bloqueando IPs de Cloudflare${since ? ' desde las ' + since : ''}. Volverá cuando termine el bloqueo.</small></div>
    <a class="btn ghost" href="https://hayahora.futbol/" target="_blank" rel="noopener">Ver estado</a><button class="btn ghost lal-x" aria-label="Ocultar">${ic('x')}</button>`;
  el.querySelector('.lal-x').onclick = () => { S.lalHidden = S.laliga.since || true; el.remove(); };
}
// Siguiente ciudad de la ruta recomendada que aún no has pasado
function nextVia() {
  const R = S.navRoute, t = S.live?.truck;
  if (!R || !t || !(t.x || t.z)) return null;
  const via = (R.popular || R.fastest)?.via || [];
  S.viaPassed = S.viaPassed || new Set();
  for (const v of via) if (Math.hypot(v.x - t.x, v.y - t.z) < 2500) S.viaPassed.add(v.name);
  const rest = via.filter((v) => !S.viaPassed.has(v.name));
  if (!rest.length) return null;
  const v = rest[0];
  return { name: v.name, km: Math.hypot(v.x - t.x, v.y - t.z) / 1000, left: rest.length };
}
const gearTxt = (g) => (g > 0 ? String(g) : g < 0 ? 'R' + Math.abs(g) : 'N');
// Marcha como la muestra el salpicadero del juego: A12 (automática), 8 (manual), R1, N
function gearLabel(t) {
  let g = t.gear;
  if (!g && t.gearSel) g = t.gearSel;
  if (g < 0) return 'R' + Math.abs(g);
  if (!g) return 'N';
  return (/auto|arcade/i.test(t.shifter || '') ? 'A' : '') + g;
}

// ---------- modo salpicadero (pantalla completa, ideal para el móvil en el soporte) ----------
async function openDash() {
  if ($('.dash')) return;
  const el = document.createElement('div');
  el.className = 'dash';
  el.innerHTML = `<button class="btn ghost dash-close" aria-label="Cerrar salpicadero">${ic('x')}</button>
    <div class="dash-top"><span class="pill acc" id="dClock"></span><span class="pill" id="dTraf"></span></div>
    <div class="dash-main"><div class="dash-speed" id="dSpeedBox"><span class="v" id="dSpd">0</span><span class="u">${U.speedUnit()}</span></div>
      <div class="dash-side"><div class="limit none" id="dLim">–</div><div class="gear" id="dGear">N</div></div></div>
    <div class="dash-job" id="dJob"></div>
    <div class="dash-keys">${[['blinkLeft', 'left'], ['lights', 'low'], ['hazard', 'fine'], ['horn', 'horn', 1], ['blinkRight', 'right']].map(([k, i, h]) => `<button class="kb-btn" data-dk="${k}" ${h ? 'data-hold="1"' : ''}>${ic(i)}</button>`).join('')}</div>
    <div class="dash-bars"><div><span>Combustible</span><div class="bar"><i id="dFuel"></i></div></div><div><span>Daños</span><div class="bar bad"><i id="dDmg"></i></div></div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  S.dashOpen = true;
  try { await (document.documentElement.requestFullscreen?.() || Promise.resolve()); } catch {}
  keepAwake(true);
  const upd = () => {
    const d = S.live; if (!d || !d.sdk) return;
    const t = d.truck, n = d.nav, j = d.job, lim = Math.round(n.limit || 0);
    $('#dClock').textContent = gameClock(d.gameTime);
    const tf = S.traffic, TL = tf ? (TRAF[tf.level] || TRAF.low) : null; $('#dTraf').textContent = TL ? `Tráfico ${TL[0].toLowerCase()}` : ''; $('#dTraf').className = 'pill ' + (TL ? TL[1] : 'hidden');
    $('#dLim').textContent = lim > 0 ? lim : '–'; $('#dLim').classList.toggle('none', lim <= 0);
    $('#dSpeedBox').classList.toggle('over', lim > 0 && t.speed > lim + 3);
    $('#dGear').textContent = gearLabel(t);
    $('#dJob').innerHTML = j && j.onJob ? `<b>${esc(j.toCity)}</b><span>${U.dist(n.distance / 1000)} · ≈ ${dur(n.time)}</span>` : '<span>Sin trabajo activo</span>';
    $('#dFuel').style.width = clamp(t.fuel / (t.fuelCap || 1), 0, 1) * 100 + '%';
    const L = t.lights || {}, dk = { blinkLeft: L.left && !L.hazard, blinkRight: L.right && !L.hazard, lights: L.low, hazard: L.hazard };
    $$('[data-dk]').forEach((b) => b.classList.toggle('on', !!dk[b.dataset.dk]));
    $('#dDmg').style.width = Math.max(t.damage.engine, t.damage.transmission, t.damage.cabin, t.damage.chassis, t.damage.wheels) * 100 + '%';
  };
  upd();
  const offs = [on('tel', upd), on('traffic', upd)];
  const close = () => {
    offs.forEach((f) => f()); S.dashOpen = false; keepAwake(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    el.classList.remove('show'); setTimeout(() => el.remove(), 350);
    S.closeDash = null;
  };
  S.closeDash = close;
  el.querySelector('.dash-close').onclick = close;
  $$('[data-dk]', el).forEach((b) => {
    const send = (a) => { post('/api/keys', { action: b.dataset.dk, a }).catch(() => {}); haptic(); };
    if (b.dataset.hold) { b.onpointerdown = (e) => { e.preventDefault(); b.classList.add('press'); send('down'); }; b.onpointerup = b.onpointercancel = () => { if (b.classList.contains('press')) { b.classList.remove('press'); send('up'); } }; }
    else b.onclick = () => { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160); send('tap'); };
  });
  el.querySelector('.dash-close').focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.closeDash) S.closeDash(); });
// Al salir de pantalla completa con Esc también se cierra el salpicadero
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S.closeDash) S.closeDash(); });
function keepAwake(on) {
  const K = window.Capacitor?.Plugins?.KeepAwake;
  if (K) (on ? K.keepAwake() : K.allowSleep()).catch(() => {});
  else if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => (S.wakeLock = l)).catch(() => {});
  else if (!on && S.wakeLock) { S.wakeLock.release().catch(() => {}); S.wakeLock = null; }
}

// ---------- Entregas ----------
function jobRow(j) {
  const st = j.status === 'delivered' ? ['good', 'check'] : j.status === 'cancelled' ? ['bad', 'x'] : ['', 'entregas'];
  const dmg = j.cargoDamage || 0;
  return `<button class="item" data-job="${j.id}">
    ${j.grade ? `<span class="grade sm g-${j.grade.replace('+', 'p')}" title="Nota ${j.score}">${j.grade}</span>` : `<span class="ico ${st[0]}">${ic(st[1])}</span>`}
    <span class="grow"><span class="t">${esc(j.fromCity)} → ${esc(j.toCity)}${j.rating ? ` <span class="acc-txt">${'★'.repeat(j.rating)}</span>` : ''}${j.note ? ` <span class="muted" title="Tiene nota">${ic('note', 'inline-ic')}</span>` : ''}</span><span class="s">${esc(j.cargo)} · ${U.mass(j.mass || 0)} · ${U.dist(j.distanceKm || j.drivenKm || 0, 0)} · ${ago(j.endedAt)}</span></span>
    <span class="stack" style="align-items:flex-end;gap:3px"><b class="num ${j.revenue < 0 ? 'bad' : ''}" style="font-size:19px">${money(j.revenue || 0, j.game)}</b>${j.mode ? `<span class="pill ${j.mode === 'real' ? 'good' : 'warn'}">${j.mode === 'real' ? 'Real' : 'Carrera'}</span>` : ''}
    <span class="pill ${dmg > 0.05 ? 'bad' : dmg > 0.01 ? 'warn' : 'good'}">${pct(dmg)} daño</span></span></button>`;
}
function jobDetail(j) {
  const S2 = { delivered: ['Entregado', 'good'], cancelled: ['Cancelado', 'bad'], interrupted: ['Interrumpido', 'warn'] }[j.status] || ['—', ''];
  const f = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  openSheet(`
    <span class="pill ${S2[1]}">${S2[0]}</span>
    <h2 style="font-size:26px;margin:10px 0 2px">${esc(j.fromCity)} → ${esc(j.toCity)}</h2>
    <p class="muted">${esc(j.fromCompany)} → ${esc(j.toCompany)}</p>
    <canvas class="route-mini hidden" id="routeMini" aria-label="Recorrido del trabajo"></canvas>
    ${j.score != null ? `<div class="score-live" style="margin-top:16px"><span class="grade g-${j.grade.replace('+', 'p')}">${j.grade}</span><div><b>Nota de conducción: ${j.score} / 100</b><small>${j.mode === 'real' ? 'Viaje Real: respetaste los límites' : 'Modo Carrera: demasiado tiempo por encima del límite'} · exceso ${j.speedingPct || 0} % del tiempo</small></div></div>
      ${j.penalties?.length ? `<div class="chips" style="margin-top:10px">${j.penalties.map((p) => `<span class="pill bad">${esc(p.name)} −${p.points}</span>`).join('')}</div>` : ''}` : ''}
    <div class="grid g2" style="margin-top:20px">
      <div class="kpi"><span class="v ${j.revenue < 0 ? 'bad' : ''}">${money(j.revenue || 0, j.game)}</span><span class="l">Ingresos</span></div>
      <div class="kpi"><span class="v">${n0(j.xp || 0)}</span><span class="l">Experiencia</span></div>
    </div>
    <div class="detail">
      ${f('Carga', `${esc(j.cargo)} · ${n1((j.mass || 0) / 1000)} t`)}
      ${f('Mercado', esc(MARKETS[j.market] || '—'))}
      ${f('Distancia del trabajo', j.distanceKm ? `${n0(j.distanceKm)} km` : '—')}
      ${j.net != null ? f('Beneficio neto', `<span class="${j.net < 0 ? 'bad' : 'good'}">${money(j.net, j.game)}</span>`) : ''}
      ${j.fuelCost != null ? f('Coste de combustible', money(-j.fuelCost, j.game)) : ''}
      ${f('Ganancia por km', j.revenue > 0 && (j.distanceKm || j.drivenKm) ? `${n1(j.revenue / (j.distanceKm || j.drivenKm))} ${cur(j.game)}/km` : '—')}
      ${f('Recorrido real', `${n1(j.drivenKm || 0)} km`)}
      ${f('Daño de la carga', pct(j.cargoDamage))}
      ${f('Combustible', `${n0(j.fuelUsed || 0)} l`)}
      ${f('Velocidad máxima', `${n0(j.maxSpeed || 0)} km/h`)}
      ${f('Velocidad media', `${n0(j.avgSpeed || 0)} km/h`)}
      ${f('Tiempo con exceso', dur(j.speedingSec))}
      ${f('Duración real', dur((j.realMinutes || 0) * 60))}
      ${f('Duración en el juego', j.gameMinutes ? dur(j.gameMinutes * 60) : '—')}
      ${f('Multas', j.fines?.length ? `${j.fines.length} · ${money(-(j.finesTotal || 0), j.game)}` : 'Ninguna')}
      ${f('Peajes', money(-(j.tolls || 0), j.game))}
      ${f('Camión', esc(j.truck || '—'))}
      ${f('Remolque', esc(j.trailer || '—'))}
      ${f('Inicio', fdate(j.startedAt))}
      ${f('Fin', fdate(j.endedAt))}
    </div>
    ${j.fines?.length ? `<h3 style="margin:22px 0 8px;font-size:16px">Multas durante el trabajo</h3><div class="list">${j.fines.map((x) =>
      `<div class="item"><span class="ico bad">${ic('fine')}</span><span class="grow"><span class="t">${esc(OFFENCES[x.offence] || x.offence)}</span></span><b class="bad num">${money(-x.amount, j.game)}</b></div>`).join('')}</div>` : ''}
    ${j.partial ? '<p class="muted" style="margin-top:18px;font-size:13px">El HUB se abrió con este trabajo ya empezado: algunos datos solo cubren una parte del viaje.</p>' : ''}
    <h3 style="margin:22px 0 8px;font-size:16px">Tu valoración</h3>
    <div class="stars" id="jobStars">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" aria-label="${n} estrellas" class="${n <= (j.rating || 0) ? 'on' : ''}">${ic('star')}</button>`).join('')}</div>
    <textarea class="input" id="jobNote" rows="3" placeholder="Añade una nota (convoy, incidencias, con quién fuiste…)" style="margin-top:10px;resize:vertical">${esc(j.note || '')}</textarea>
    <div class="row" style="margin-top:24px"><button class="btn danger" id="delJob">Eliminar del historial</button></div>`);
  const drawMini = (path) => { const mini = $('#routeMini'); if (!mini || !window.drawRouteMini || !(path?.length > 1)) return; mini.classList.remove('hidden'); requestAnimationFrame(() => drawRouteMini(mini, path, String(j.game).toLowerCase() === 'ats' ? 'ats' : 'ets2')); };
  if (j.path?.length > 1) drawMini(j.path);
  else if (S.connected) api(`/api/map/trail?job=${encodeURIComponent(j.id)}`).then((r) => { j.path = r.path; drawMini(r.path); }).catch(() => {});
  const saveJob = (patch) => S.connected && post('/api/jobs/update', { id: j.id, ...patch }).then((r) => Object.assign(j, r)).catch(() => {});
  $('#jobStars').onclick = (e) => {
    const b = e.target.closest('[data-star]'); if (!b) return;
    const n = +b.dataset.star === j.rating ? 0 : +b.dataset.star;
    $$('#jobStars button').forEach((x) => x.classList.toggle('on', +x.dataset.star <= n)); saveJob({ rating: n });
  };
  let nt; $('#jobNote').oninput = (e) => { clearTimeout(nt); nt = setTimeout(() => saveJob({ note: e.target.value }), 600); };
  $('#delJob').onclick = async () => {
    if (!(await askConfirm({ title: 'Eliminar trabajo', text: 'Se quitará del historial y de las estadísticas.', ok: 'Eliminar', danger: true }))) return;
    await post('/api/jobs/delete', { id: j.id }); closeSheet(); go('entregas', false);
  };
}
VIEWS.entregas = (root) => {
  let status = '', q = '', items = [], total = 0, reqId = 0;
  const PAGE = 100;
  root.innerHTML = `<div class="head"><div><h1>Entregas</h1><p id="jobCount">Tu historial de trabajos</p></div>
    <div class="row wrap"><div class="chips" id="jobChips">
      <button class="chip" data-s="" aria-pressed="true">Todas</button><button class="chip" data-s="delivered" aria-pressed="false">Entregadas</button><button class="chip" data-s="cancelled" aria-pressed="false">Canceladas</button></div>
      <input class="input" id="jobQ" type="search" placeholder="Buscar ciudad, carga o empresa" aria-label="Buscar entregas" style="width:min(260px,100%)">
      ${IS_CAP ? '' : `<a class="btn" id="csvBtn" href="/api/jobs.csv" download>Exportar a Excel</a>`}</div></div>
    <section class="card" style="padding:10px 14px"><div class="list" id="jobList">${'<div class="skeleton" style="height:52px;margin:8px 0"></div>'.repeat(5)}</div>
    <div class="row" style="justify-content:center"><button class="btn ghost hidden" id="moreJobs">Cargar más</button></div></section>`;
  const load = async (append = false) => {
    if (!S.connected) { $('#jobList').innerHTML = notConnectedCard(); $('#moreJobs').classList.add('hidden'); return; }
    const my = ++reqId;
    try {
      const r = await api(`/api/jobs?limit=${PAGE}&offset=${append ? items.length : 0}&status=${status}&q=${encodeURIComponent(q)}`);
      if (my !== reqId || !$('#jobList')) return; // llegó tarde una búsqueda anterior
      items = append ? items.concat(r.items) : r.items; total = r.total;
      $('#jobCount').textContent = `${n0(total)} trabajo${total === 1 ? '' : 's'} registrado${total === 1 ? '' : 's'}`;
      $('#jobList').innerHTML = items.length ? items.map(jobRow).join('')
        : `<div class="empty">${ic('entregas')}<b>${q || status ? 'Nada coincide con el filtro' : 'Todavía no hay entregas'}</b>${q || status ? 'Prueba con otra búsqueda.' : 'Cuando completes un trabajo en el juego aparecerá aquí con todos sus datos.'}</div>`;
      $('#moreJobs').classList.toggle('hidden', items.length >= total);
    } catch (e) { if (my === reqId) $('#jobList').innerHTML = `<div class="empty"><b>No se pudo cargar el historial</b>${esc(e.message)}</div>`; }
  };
  $('#jobChips').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; status = c.dataset.s; $$('#jobChips .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); load(); };
  let tq; $('#jobQ').oninput = (e) => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  $('#jobList').onclick = (e) => { const b = e.target.closest('[data-job]'); if (b) { const j = items.find((x) => x.id === b.dataset.job); if (j) jobDetail(j); } };
  $('#moreJobs').onclick = () => load(true);
  load();
  const offs = [on('job', (d) => d.phase !== 'started' && load()), on('conn', () => load())];
  return () => { clearTimeout(tq); offs.forEach((f) => f()); };
};

// ---------- Estadísticas ----------
function barChart(days, key, fmt) {
  const W = 700, H = 220, pad = 30, bw = (W - pad) / Math.max(1, days.length);
  const max = Math.max(1, ...days.map((d) => d[key] || 0));
  const every = days.length > 14 ? 5 : 1;
  const bars = days.map((d, i) => {
    const h = ((d[key] || 0) / max) * (H - 40);
    return `<rect class="b" x="${pad + i * bw + 2}" y="${H - 20 - h}" width="${Math.max(2, bw - 5)}" height="${Math.max(0, h)}" rx="4"><title>${esc(d.label)}: ${fmt(d[key] || 0)}</title></rect>`;
  }).join('');
  const labels = days.map((d, i) => (i % every === 0 || i === days.length - 1) ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(d.label)}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico del periodo">
    <line x1="${pad}" x2="${W}" y1="${H - 20}" y2="${H - 20}"/><text x="0" y="14">${fmt(max)}</text>${bars}${labels}</svg>`;
}
function hbars(list, fmt = (v) => n0(v)) {
  if (!list.length) return '<p class="muted">Sin datos todavía.</p>';
  const max = Math.max(...list.map((x) => x.value));
  return list.map((x) => `<div class="hbar"><span>${esc(x.name)}</span><b class="num">${fmt(x.value)}</b><div class="bar"><i style="width:${(x.value / max) * 100}%"></i></div></div>`).join('');
}
const gradeOf = (sc) => (sc >= 95 ? 'A+' : sc >= 88 ? 'A' : sc >= 78 ? 'B' : sc >= 65 ? 'C' : sc >= 50 ? 'D' : 'E');
function calendarHtml(cal) {
  if (!cal || !cal.length) return '';
  const max = Math.max(1, ...cal.map((c) => c[1]));
  const first = new Date(cal[0][0] + 'T12:00:00'); const pad = (first.getDay() + 6) % 7;
  const cells = Array(pad).fill('<i class="cal-e"></i>').concat(cal.map(([d, km, jobs]) => {
    const lv = km <= 0 ? 0 : Math.min(4, 1 + Math.floor((km / max) * 4));
    return `<i class="cal-${lv}" title="${new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${U.dist(km, 0)} · ${jobs} entregas"></i>`;
  }));
  const active = cal.filter((c) => c[1] > 0).length;
  let streak = 0; for (let i = cal.length - 1; i >= 0 && cal[i][1] > 0; i--) streak++;
  return `<section class="card" style="margin-top:16px"><h2>Tu actividad del último año <span class="row" style="gap:6px"><span class="pill">${active} días conduciendo</span><span class="pill acc">Racha: ${streak} día${streak === 1 ? '' : 's'}</span></span></h2>
    <div class="cal-wrap"><div class="cal">${cells.join('')}</div></div>
    <div class="row muted" style="font-size:12px;justify-content:flex-end;gap:4px;margin-top:8px">Menos <i class="cal-0 cal-k"></i><i class="cal-1 cal-k"></i><i class="cal-2 cal-k"></i><i class="cal-3 cal-k"></i><i class="cal-4 cal-k"></i> Más</div></section>`;
}
function achGrid(list) {
  return `<div class="ach">${list.map((a) => `<div class="ach-item ${a.done ? 'done' : ''}"><span class="ico">${ic(a.done ? 'star' : 'shield')}</span>
    <div style="flex:1;min-width:0"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${a.done ? '' : `<div class="bar"><i style="width:${a.progress * 100}%"></i></div>`}</div></div>`).join('')}</div>`;
}
VIEWS.stats = (root) => {
  let metric = 'km', range = LS.get('statsRange', '30');
  const RANGES = { '7': '7 días', '30': '30 días', '365': '12 meses', all: 'Todo' };
  root.innerHTML = `<div class="head"><div><h1>Estadísticas</h1><p>Todo lo que has hecho en la carretera</p></div>
    <div class="chips" id="rangeChips">${Object.entries(RANGES).map(([k, v]) => `<button class="chip" data-r="${k}" aria-pressed="${k === range}">${v}</button>`).join('')}</div></div>
    <div id="st">${'<div class="skeleton" style="height:120px;margin-bottom:16px;border-radius:22px"></div>'.repeat(3)}</div>`;
  $('#rangeChips').onclick = (e) => { const c = e.target.closest('[data-r]'); if (!c) return; range = c.dataset.r; LS.set('statsRange', range); $$('#rangeChips .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); load(); };
  let req = 0;
  const load = async () => {
    const my = ++req;
    let s, offline = false;
    if (!S.connected) { s = LS.get('cache.stats.' + range, null); offline = true; if (!s) { $('#st').innerHTML = notConnectedCard(); return; } }
    else { try { s = await api(`/api/stats?range=${range}`); LS.set('cache.stats.' + range, { ...s, cachedAt: Date.now() }); } catch (e) { s = LS.get('cache.stats.' + range, null); offline = true; if (!s) { if ($('#st')) $('#st').innerHTML = `<div class="card empty"><b>No se pudieron calcular</b>${esc(e.message)}</div>`; return; } } }
    if (my !== req || !$('#st')) return;
    const T = s.totals, R = s.rank;
    if (offline && s.cachedAt) setTimeout(() => { const st = $('#st'); if (st && !$('#offNote')) st.insertAdjacentHTML('afterbegin', `<p class="muted" id="offNote" style="margin-bottom:12px">Sin conexión con el PC · datos guardados el ${new Date(s.cachedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>`); });
    const rec = (label, j, v) => j ? `<button class="item" data-rec="${j.id}"><span class="ico">${ic('star')}</span><span class="grow"><span class="t">${label}</span><span class="s">${esc(j.fromCity)} → ${esc(j.toCity)}</span></span><b class="num" style="font-size:19px">${v}</b></button>` : '';
    const fm = { km: (v) => `${n0(v)} km`, revenue: (v) => money(v), jobs: (v) => n0(v), xp: (v) => `${n0(v)} XP` };
    const achDone = s.achievements.filter((a) => a.done).length;
    const period = range === 'all' ? 'en total' : `en ${RANGES[range].replace('12 meses', 'el último año').replace(/^(\d+) días$/, 'los últimos $1 días')}`;
    $('#st').innerHTML = `
      <div class="grid g3">
        <section class="card span2"><div class="rank"><span class="rank-badge">${R.level}</span><div style="flex:1">
          <div class="muted" style="font-size:14px">Tu rango</div><div style="font-size:26px;font-weight:700;line-height:1.15">${R.name}</div>
          <div class="bar" style="margin:12px 0 6px"><i style="width:${R.progress * 100}%"></i></div>
          <div class="muted" style="font-size:13px">${R.next ? `Te faltan ${n0((1 - R.progress) * (R.next - R.from))} km para ${R.nextName}` : 'Rango máximo alcanzado'}</div></div></div></section>
        ${s.driver ? `<section class="card span2 driver-card"><div class="rank"><span class="rank-badge alt">${s.driver.level}</span><div style="flex:1">
          <div class="muted" style="font-size:14px">Nivel de conductor · según tus notas de conducción</div><div style="font-size:24px;font-weight:700;line-height:1.15">${esc(s.driver.name)}</div>
          <div class="bar alt" style="margin:12px 0 6px"><i style="width:${s.driver.progress * 100}%"></i></div>
          <div class="muted" style="font-size:13px">${n0(s.driver.points)} puntos${s.driver.next ? ` · ${n0(s.driver.next - s.driver.points)} para subir` : ''}</div></div>
          <div class="stack" style="align-items:flex-end;gap:6px">${T.avgScore != null ? `<span class="grade g-${gradeOf(T.avgScore).replace('+', 'p')}">${gradeOf(T.avgScore)}</span><small class="muted">Nota media ${T.avgScore}</small>` : ''}</div></div>
          <div class="row wrap" style="gap:8px;margin-top:14px"><span class="pill good">Real: ${n0(T.real)} entregas · ${U.dist(T.realKm, 0)}</span><span class="pill warn">Carrera: ${n0(T.race)} entregas · ${U.dist(T.raceKm, 0)}</span></div></section>` : ''}
        <section class="card"><div class="kpi"><span class="v">${n0(U.distN(T.km))}<small>${U.distUnit()}</small></span><span class="l">Conducidos ${period}</span></div>
          <div class="kpi" style="margin-top:12px"><span class="v">${dur(T.driveSec)}</span><span class="l">Al volante</span></div></section>
      </div>
      <div class="grid g4 keep" style="margin-top:16px">
        <section class="card kpi"><span class="v">${money(T.revenue)}</span><span class="l">Ingresos · ${n1(T.perKm)} ${cur()}/km</span></section>
        <section class="card kpi"><span class="v">${n0(T.delivered)}</span><span class="l">Entregas · ${n0(T.cancelled)} canceladas</span></section>
        <section class="card kpi"><span class="v ${T.net < 0 ? 'bad' : ''}">${money(T.net || 0)}</span><span class="l">Beneficio neto · ${money(-(T.fuelCost || 0))} en combustible</span></section>
        <section class="card kpi"><span class="v">${n0(T.perfect)}</span><span class="l">Entregas perfectas</span></section>
        <section class="card kpi"><span class="v">${n0(T.fuel)}<small>l</small></span><span class="l">Combustible · ${n1(T.consumption)} l/100 km</span></section>
        <section class="card kpi"><span class="v">${n1(T.mass)}<small>t</small></span><span class="l">Carga transportada</span></section>
        <section class="card kpi"><span class="v ${T.finesTotal ? 'bad' : ''}">${money(-T.finesTotal)}</span><span class="l">${n0(T.finesCount)} multas · ${money(-T.tolls)} en peajes</span></section>
        <section class="card kpi"><span class="v">${pct(T.avgDamage)}</span><span class="l">Daño medio de la carga</span></section>
      </div>
      ${calendarHtml(s.calendar)}
      <section class="card" style="margin-top:16px"><h2>${range === '7' || range === '30' ? 'Día a día' : 'Mes a mes'} <span class="chips" id="metric">
        ${Object.entries({ km: 'Kilómetros', revenue: 'Ingresos', jobs: 'Entregas', xp: 'XP' }).map(([k, v]) => `<button class="chip" data-m="${k}" aria-pressed="${k === metric}">${v}</button>`).join('')}</span></h2>
        <div id="chart">${barChart(s.days, metric, fm[metric])}</div></section>
      <section class="card" style="margin-top:16px"><h2>Logros <span class="pill acc">${achDone} de ${s.achievements.length}</span></h2>${achGrid(s.achievements)}</section>
      <div class="grid g3" style="margin-top:16px">
        <section class="card"><h2>Destinos favoritos</h2>${hbars(s.top.cities)}</section>
        <section class="card"><h2>Cargas más habituales</h2>${hbars(s.top.cargos)}</section>
        <section class="card"><h2>Empresas de origen</h2>${hbars(s.top.companies)}</section>
      </div>
      ${s.fleet?.length ? `<section class="card" style="margin-top:16px"><h2>Mis camiones <span class="pill">${s.fleet.length}</span></h2><div class="list">${s.fleet.slice(0, 8).map((f) => `<div class="item"><span class="ico">${ic('truck')}</span>
        <span class="grow"><span class="t">${esc(f.truck || f.key)}${f.plate ? ` <span class="pill">${esc(f.plate)}</span>` : ''}</span><span class="s">${n0(f.jobs)} entregas · ${U.dist(f.km, 0)} · ${n1(f.consumption)} l/100 km · último uso ${ago(f.last)}</span></span>
        ${f.avgScore != null ? `<span class="grade sm g-${gradeOf(f.avgScore).replace('+', 'p')}">${gradeOf(f.avgScore)}</span>` : ''}<b class="num" style="font-size:18px">${money(f.revenue)}</b></div>`).join('')}</div></section>` : ''}
      <div class="grid g2" style="margin-top:16px">
        <section class="card"><h2>Récords</h2><div class="list" id="recs">
          ${rec('Viaje más largo', s.records.longest, `${n0(s.records.longest?.distanceKm || s.records.longest?.drivenKm)} km`)}
          ${rec('Entrega mejor pagada', s.records.richest, money(s.records.richest?.revenue))}
          ${rec('Carga más pesada', s.records.heaviest, `${n1((s.records.heaviest?.mass || 0) / 1000)} t`)}
          ${rec('Velocidad máxima', s.records.fastest, `${n0(s.records.fastest?.maxSpeed)} km/h`)}
          ${s.records.longest ? '' : '<p class="muted">Completa entregas para batir tus récords.</p>'}</div></section>
        <section class="card"><h2>Multas por motivo</h2>${hbars(s.top.offences.map((o) => ({ ...o, name: OFFENCES[o.name] || o.name })))}
          ${s.top.trucks.length ? `<h2 style="margin-top:18px">Camiones más usados</h2>${hbars(s.top.trucks)}` : ''}</section>
      </div>`;
    $('#metric').onclick = (e) => { const c = e.target.closest('[data-m]'); if (!c) return; metric = c.dataset.m; $$('#metric .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); $('#chart').innerHTML = barChart(s.days, metric, fm[metric]); };
    $('#recs').onclick = (e) => { const b = e.target.closest('[data-rec]'); if (!b) return; const j = Object.values(s.records).find((x) => x && x.id === b.dataset.rec); if (j) jobDetail(j); };
  };
  load();
  const offs = [on('job', (d) => d.phase !== 'started' && load()), on('conn', load)];
  return () => offs.forEach((f) => f());
};

// ---------- Recorridos: por dónde has ido (también sin conexión en el móvil) ----------
VIEWS.recorridos = (root) => {
  const render = (J, offline) => {
    const T = J.totals || {}, H = J.hist;
    const spMax = H ? Math.max(1, ...H.speed) : 1;
    const hrMax = H ? Math.max(1, ...H.hours.flat()) : 1;
    root.innerHTML = `<div class="head"><div><h1>Mis recorridos</h1><p>${offline ? `Datos guardados el ${new Date(J.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · sin conexión con el PC` : 'Por dónde has ido, a qué velocidad y con qué camiones'}</p></div></div>
      <section class="card" style="padding:12px"><canvas class="route-mini big" id="trailMap" aria-label="Mapa de todos tus recorridos"></canvas>
        <div class="row wrap between" style="margin-top:10px"><span class="muted" style="font-size:13px">${n0((J.trail || []).filter(Boolean).length)} puntos registrados</span>${!offline ? `<button class="btn ghost" data-go="mapa">${ic('mapa')}Abrir en el mapa</button>` : ''}</div></section>
      <div class="grid g4 keep" style="margin-top:16px">
        <section class="card kpi"><span class="v">${n0(U.distN(T.km || 0))}<small>${U.distUnit()}</small></span><span class="l">Recorridos en total</span></section>
        <section class="card kpi"><span class="v">${dur(T.driveSec)}</span><span class="l">Al volante</span></section>
        <section class="card kpi"><span class="v">${n0(U.speed(J.speed?.avg || 0))}<small>${U.speedUnit()}</small></span><span class="l">Velocidad media · máx. ${n0(U.speed(J.speed?.max || 0))}</span></section>
        <section class="card kpi"><span class="v">${n0(J.cityCount || 0)}</span><span class="l">Ciudades · ${(J.countries || []).length} países</span></section>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <section class="card"><h2>¿A qué velocidad conduces?</h2>${H ? `<div class="spd-hist">${H.speed.map((v, i) => `<div title="${i * 10}-${i * 10 + 10} km/h: ${dur(v)}"><i style="height:${(v / spMax) * 100}%"></i><span>${i % 2 === 0 ? i * 10 : ''}</span></div>`).join('')}</div><p class="muted" style="font-size:12px;margin-top:6px">Tiempo al volante por tramos de 10 km/h</p>` : '<p class="muted">Se irá llenando a medida que conduzcas.</p>'}</section>
        <section class="card"><h2>¿Cuándo conduces?</h2>${H ? `<div class="hr-grid">${H.hours.map((row, d) => `<span class="hr-d">${['L', 'M', 'X', 'J', 'V', 'S', 'D'][d]}</span>${row.map((v, h) => `<i title="${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][d]} ${h}:00 · ${dur(v)}" style="opacity:${v ? 0.2 + (v / hrMax) * 0.8 : 0.06}"></i>`).join('')}`).join('')}</div><div class="hr-axis"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>` : '<p class="muted">Se irá llenando a medida que conduzcas.</p>'}</section>
        <section class="card"><h2>Países</h2>${hbars((J.countries || []).slice(0, 10))}</section>
        <section class="card"><h2>Ciudades más visitadas</h2>${hbars((J.cities || []).slice(0, 10))}</section>
        <section class="card"><h2>Camiones usados</h2>${(J.fleet || []).length ? `<div class="list">${J.fleet.slice(0, 8).map((f) => `<div class="item"><span class="ico">${ic('truck')}</span><span class="grow"><span class="t">${esc(f.truck || f.key)}</span><span class="s">${n0(f.jobs)} entregas · ${U.dist(f.km, 0)}${f.plate ? ' · ' + esc(f.plate) : ''}</span></span>${f.avgScore != null ? `<span class="grade sm g-${gradeOf(f.avgScore).replace('+', 'p')}">${gradeOf(f.avgScore)}</span>` : ''}</div>`).join('')}</div>` : '<p class="muted">Aún no hay entregas.</p>'}</section>
        <section class="card"><h2>Viajes más largos</h2>${(J.longest || []).length ? `<div class="list">${J.longest.map((l, i) => `<div class="item"><span class="ico">${i + 1}</span><span class="grow"><span class="t">${esc(l.from)} → ${esc(l.to)}</span><span class="s">${ago(l.at)}</span></span><b class="num">${U.dist(l.km || 0, 0)}</b></div>`).join('')}</div>` : '<p class="muted">Aún no hay entregas.</p>'}</section>
      </div>`;
    const cv = $('#trailMap');
    if (cv && window.drawRouteMini && (J.trail || []).filter(Boolean).length > 1) requestAnimationFrame(() => drawRouteMini(cv, J.trail, 'ets2', { noEnds: true }));
    else if (cv) cv.outerHTML = `<div class="empty" style="padding:40px 10px">${ic('recorridos')}<b>Aún no hay recorridos</b>Conduce y aquí se irá dibujando todo lo que recorras, carretera a carretera.</div>`;
  };
  const load = async () => {
    const cached = LS.get('cache.journeys', null);
    if (!S.connected) {
      if (cached) return render(cached, true);
      root.innerHTML = `<div class="head"><div><h1>Mis recorridos</h1><p>Por dónde has ido</p></div></div>${notConnectedCard()}`; return;
    }
    if (cached) render(cached, false); else root.innerHTML = `<div class="head"><div><h1>Mis recorridos</h1></div></div>${sk(300)}`;
    try { const J = await api(`/api/journeys?max=${S.mode === 'remote' ? 2500 : 8000}`, { timeout: 30000 }); try { LS.set('cache.journeys', J); } catch { const J2 = { ...J, trail: (J.trail || []).filter((_, i) => i % 3 === 0) }; LS.set('cache.journeys', J2); } render(J, false); }
    catch (e) { if (!cached) root.innerHTML = `<div class="card empty"><b>No se pudieron cargar</b>${esc(e.message)}</div>`; }
  };
  load();
  const offs = [on('conn', load), on('job', (d) => d.phase === 'delivered' && load())];
  return () => offs.forEach((f) => f());
};

// ---------- Eventos ----------
const EV = {
  fined: ['Multa', 'fine', 'bad'], tollgate: ['Peaje', 'toll', 'alt'], ferry: ['Ferry', 'ferry', 'alt'], train: ['Tren', 'train', 'alt'],
  refuel: ['Repostaje', 'fuel', ''], job_delivered: ['Entrega', 'check', 'good'], job_cancelled: ['Cancelación', 'x', 'bad']
};
VIEWS.eventos = (root) => {
  let type = '', items = [];
  root.innerHTML = `<div class="head"><div><h1>Eventos</h1><p>Multas, peajes, ferris, repostajes y entregas</p></div>
    <div class="chips" id="evChips">${[['', 'Todo'], ['fined', 'Multas'], ['tollgate', 'Peajes'], ['ferry', 'Ferry'], ['train', 'Tren'], ['refuel', 'Repostajes'], ['job_delivered', 'Entregas']]
      .map(([k, v]) => `<button class="chip" data-t="${k}" aria-pressed="${k === ''}">${v}</button>`).join('')}</div></div>
    <section class="card" style="padding:10px 14px"><div class="list" id="evList">${'<div class="skeleton" style="height:48px;margin:8px 0"></div>'.repeat(5)}</div></section>`;
  const render = () => {
    const f = items.filter((e) => !type || e.type === type);
    $('#evList').innerHTML = f.length ? f.slice(0, 400).map((e) => {
      const m = EV[e.type] || ['Evento', 'eventos', ''];
      const title = e.type === 'fined' ? (OFFENCES[e.offence] || 'Multa') : m[0];
      const sub = [e.text, ago(e.at)].filter(Boolean).join(' · ');
      const val = e.type === 'refuel' ? `${n0(e.liters)} l` : e.amount != null ? money(e.amount) : '';
      return `<div class="item"><span class="ico ${m[2]}">${ic(m[1])}</span><span class="grow"><span class="t">${esc(title)}</span><span class="s">${esc(sub)}</span></span><b class="num ${e.amount < 0 ? 'bad' : e.amount > 0 ? 'good' : ''}" style="font-size:18px">${val}</b></div>`;
    }).join('') : `<div class="empty">${ic('eventos')}<b>Sin eventos</b>Aquí verás cada multa, peaje o ferry en cuanto ocurra.</div>`;
  };
  const load = async () => {
    if (!S.connected) { $('#evList').innerHTML = notConnectedCard(); return; }
    try { items = (await api('/api/events?limit=1000')).items; render(); } catch (e) { $('#evList').innerHTML = `<div class="empty"><b>No se pudieron cargar</b>${esc(e.message)}</div>`; }
  };
  $('#evChips').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; type = c.dataset.t; $$('#evChips .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); render(); };
  load();
  const offs = [on('ev', () => setTimeout(load, 300)), on('conn', load)];
  return () => offs.forEach((f) => f());
};

// ---------- Tráfico ----------
const TRAF = { low: ['Fluido', 'good'], moderate: ['Moderado', 'acc'], heavy: ['Denso', 'warn'], congested: ['Congestionado', 'bad'], empty: ['Vacío', ''] };
const SEV = { empty: 'Vacío', low: 'Fluido', moderate: 'Moderado', heavy: 'Denso', congested: 'Congestionado' };
const sevPill = (sev) => `<span class="pill ${(TRAF[sev] || ['', ''])[1]}">${SEV[sev] || sev}</span>`;
VIEWS.trafico = (root) => {
  let sel = null, servers = [];
  root.innerHTML = `<div class="head"><div><h1>Tráfico</h1><p>Zonas concurridas de TruckersMP en tiempo real</p></div></div>
    <div class="grid g3"><section class="card" id="near"></section><section class="card span2" id="hotTop">${sk(160)}</section></div>
    <section class="card" style="margin-top:16px"><h2>Todas las zonas <span class="chips" id="srvChips"></span></h2><div id="hotAll">${sk(200)}</div></section>
    <p class="muted" style="font-size:13px;margin-top:14px">Datos de traffic.krashnz.com y del mapa en vivo de TruckersMP. El juego no permite cambiar la ruta del GPS desde fuera: el HUB te avisa de las zonas concurridas y te sugiere las más populares.</p>`;
  const near = () => {
    const n = S.traffic, el = $('#near'); if (!el) return;
    if (!n) { el.innerHTML = `<h2>A tu alrededor</h2><div class="empty" style="padding:18px 0">${ic('trafico')}<b>Sin datos</b>Conduce en TruckersMP para ver el tráfico cercano.</div>`; return; }
    const L = TRAF[n.level] || TRAF.low;
    el.innerHTML = `<h2>A tu alrededor ${n.server ? `<span class="pill">${esc(n.server.name)}</span>` : ''}</h2>
      <div class="kpi"><span class="v ${L[1]}">${L[0]}</span><span class="l">${n.around} jugadores a menos de 700 m</span></div>
      <div class="kpi" style="margin-top:14px"><span class="v">${n.ahead}</span><span class="l">${n.ahead && n.aheadKm ? `camiones delante, a unos ${n1(n.aheadKm)} km` : 'camiones en tu dirección'}</span></div>
      ${n.online === false && !S.settings?.demo ? '<p class="muted" style="font-size:13px;margin-top:12px">No te encontramos en el mapa de TruckersMP. Revisa tu ID en Ajustes.</p>' : ''}`;
  };
  const renderAll = async () => {
    const s = servers.find((x) => x.url === sel) || servers[0]; if (!s) return;
    $('#hotAll').innerHTML = sk(200);
    try {
      const d = await api(`/api/traffic/server?game=${s.game}&url=${s.url}`);
      const locs = (d.traffic || []).flatMap((c) => c.locations.map((l) => ({ ...l, country: c.country }))).filter((l) => l.players > 0).sort((a, b) => b.players - a.players);
      $('#hotAll').innerHTML = locs.length ? `<div class="list">${locs.slice(0, 60).map((l) =>
        `<div class="item"><span class="ico ${l.severity === 'congested' ? 'bad' : ''}" style="color:${esc(l.severityColour)}">${ic(l.type === 'road' ? 'truck' : 'vtc')}</span>
        <span class="grow"><span class="t">${esc(l.name)}</span><span class="s">${esc(l.country)} · ${l.type === 'road' ? 'Carretera' : 'Ciudad'}</span></span>
        ${sevPill(l.severity)}<b class="num" style="font-size:19px;min-width:48px;text-align:right">${n0(l.players)}</b></div>`).join('')}</div>` : '<p class="muted">Servidor vacío.</p>';
    } catch (e) { $('#hotAll').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
  const load = async () => {
    near();
    if (!S.connected) { $('#hotTop').innerHTML = notConnectedCard(); return; }
    try {
      servers = (await api('/api/traffic')).servers || [];
      if (!sel) sel = S.traffic?.server?.url || servers[0]?.url;
      const top = servers.flatMap((s) => (s.traffic || []).map((t) => ({ ...t, srv: s.longName }))).sort((a, b) => b.players - a.players).slice(0, 8);
      $('#hotTop').innerHTML = `<h2>Lo más concurrido ahora</h2><div class="list">${top.map((l) =>
        `<div class="item"><span class="ico" style="color:${esc(l.severityColour)}">${ic(l.type === 'road' ? 'truck' : 'vtc')}</span><span class="grow"><span class="t">${esc(l.name)}</span><span class="s">${esc(l.srv)}</span></span>${sevPill(l.severity)}<b class="num" style="font-size:19px;min-width:48px;text-align:right">${n0(l.players)}</b></div>`).join('')}</div>`;
      $('#srvChips').innerHTML = servers.filter((s) => (s.players || 0) > 0).map((s) => `<button class="chip" data-u="${s.url}" aria-pressed="${s.url === sel}">${esc(s.longName)}${s.game === 'ats' ? ' (ATS)' : ''}</button>`).join('');
      $('#srvChips').onclick = (e) => { const c = e.target.closest('[data-u]'); if (!c) return; sel = c.dataset.u; $$('#srvChips .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); renderAll(); };
      renderAll();
    } catch (e) { $('#hotTop').innerHTML = `<h2>Lo más concurrido ahora</h2><p class="muted">No se pudo conectar con el servicio de tráfico.</p>`; }
  };
  load();
  const t = setInterval(load, 60000);
  const offs = [on('traffic', near), on('conn', load)];
  return () => { clearInterval(t); offs.forEach((f) => f()); };
};

// ---------- Convoy ----------
const QUICK = ['Parada en la próxima gasolinera', 'Esperadme, voy detrás', 'Adelante, seguid', 'Todo bien por aquí', 'Cuidado: accidente delante', 'Llegamos en 5 minutos'];
VIEWS.convoy = (root) => {
  const draw = () => {
    const C = S.convoy || {};
    if (!S.connected) { root.innerHTML = `<div class="head"><div><h1>Convoy</h1><p>Conduce en grupo</p></div></div>${notConnectedCard()}`; return; }
    if (!C.active) {
      root.innerHTML = `<div class="head"><div><h1>Convoy</h1><p>Mira a tus compañeros en el mapa y en el overlay, aunque no estéis en TruckersMP</p></div></div>
        <div class="grid g2">
          <section class="card"><h2>Crear un convoy</h2><p class="muted" style="margin-bottom:14px">Serás el líder. Comparte el código con tu grupo.</p>
            <div class="field"><label for="cvName">Tu nombre en el convoy</label><input class="input" id="cvName" maxlength="30" value="${esc(C.name || '')}" placeholder="Ej.: kVe"></div>
            <button class="btn primary" id="cvCreate" style="margin-top:14px">${ic('convoy')}Crear convoy</button></section>
          <section class="card"><h2>Unirse a un convoy</h2><p class="muted" style="margin-bottom:14px">Escribe el código que te ha pasado el líder.</p>
            <div class="field"><label for="cvCode">Código</label><input class="input code-in" id="cvCode" placeholder="CNV-XXXX-XXXX" autocapitalize="characters"></div>
            <button class="btn primary" id="cvJoin" style="margin-top:14px">Unirme</button></section>
        </div>
        <section class="card" style="margin-top:16px"><h2>Cómo funciona</h2><p class="muted">Cada miembro necesita Xito Truck Hub abierto. Compartís la posición cifrada cada 2 segundos: verás a todos en el mapa, sus distancias en el overlay, avisos si alguien se queda atrás y mensajes rápidos. Recuerda: en TruckersMP no se permiten convoyes en Calais–Duisburg cuando está lleno.</p></section>`;
      const name = () => $('#cvName')?.value.trim() || C.name || '';
      $('#cvCreate').onclick = async () => { try { S.convoy = await post('/api/convoy', { action: 'create', name: name() }); draw(); } catch (e) { toast('No se pudo crear', e.message, 'x', 'bad'); } };
      $('#cvCode').oninput = (e) => { let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!v.startsWith('CNV')) v = 'CNV' + v; v = v.slice(0, 11); e.target.value = v.slice(0, 3) + (v.length > 3 ? '-' + v.slice(3, 7) : '') + (v.length > 7 ? '-' + v.slice(7) : ''); };
      $('#cvJoin').onclick = async () => { try { S.convoy = await post('/api/convoy', { action: 'join', code: $('#cvCode').value, name: name() }); draw(); } catch (e) { toast('No se pudo unir', e.message, 'x', 'bad'); } };
      return;
    }
    root.innerHTML = `<div class="head"><div><h1>Convoy</h1><p>${C.leader ? 'Eres el líder' : 'Formas parte del convoy'} · ${C.online ? 'conectado' : 'conectando…'}</p></div>
      <div class="row wrap"><span class="bigcode code-show" style="font-size:26px">${esc(C.code)}</span><button class="btn" id="cvCopy">Copiar código</button><button class="btn danger" id="cvLeave">Salir</button></div></div>
      <div class="grid g2">
        <section class="card"><h2>Miembros <span class="pill">${(C.members || []).length + 1}</span></h2><div class="list" id="cvList"></div></section>
        <section class="card"><h2>Mensajes rápidos</h2><div class="chips" id="cvQuick">${QUICK.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          <div class="row" style="margin-top:12px;gap:8px"><input class="input" id="cvMsg" maxlength="120" placeholder="Escribe un mensaje…"><button class="btn primary" id="cvSend">Enviar</button></div>
          <div class="list" id="cvFeed" style="margin-top:14px"></div>
          <div class="setting" style="margin-top:8px"><div><b>Aviso si alguien se aleja más de</b></div><div class="row" style="gap:6px"><input class="input" type="number" id="cvGap" min="1" max="50" value="${C.maxGap || 5}" style="width:80px"><span class="muted">km</span></div></div></section>
      </div>`;
    list(); feed();
    $('#cvCopy').onclick = () => { navigator.clipboard?.writeText(C.code).then(() => toast('Código copiado', C.code, 'check', 'good')).catch(() => {}); };
    $('#cvLeave').onclick = async () => { if (await askConfirm({ title: 'Salir del convoy', text: 'Dejarás de compartir tu posición con el grupo.', ok: 'Salir' })) { S.convoy = await post('/api/convoy', { action: 'leave' }); draw(); } };
    const send = async (text) => { if (!text) return; await post('/api/convoy', { action: 'msg', text }).catch(() => {}); haptic(); };
    $('#cvQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); };
    $('#cvSend').onclick = () => { const i = $('#cvMsg'); send(i.value.trim()); i.value = ''; };
    $('#cvMsg').onkeydown = (e) => { if (e.key === 'Enter') $('#cvSend').click(); };
    $('#cvGap').onchange = (e) => post('/api/convoy', { action: 'config', maxGap: +e.target.value }).catch(() => {});
  };
  const list = () => {
    const C = S.convoy || {}, box = $('#cvList'); if (!box) return;
    const me = `<div class="item"><span class="cv-dot" style="background:var(--accent)"></span><span class="grow"><span class="t">${esc(C.name || 'Tú')} ${C.leader ? '<span class="pill acc">Líder</span>' : ''}</span><span class="s">Tú${S.live?.job?.onJob ? ' · → ' + esc(S.live.job.toCity) : ''}</span></span></div>`;
    box.innerHTML = me + (C.members || []).map((m) => `<div class="item"><span class="cv-dot" style="background:${m.color}"></span>
      <span class="grow"><span class="t">${esc(m.name)} ${m.leader ? '<span class="pill acc">Líder</span>' : ''}</span><span class="s">${m.off ? 'Sin conducir' : `${n0(U.speed(m.spd || 0))} ${U.speedUnit()}${m.dest ? ' · → ' + esc(m.dest) : ''}`}</span></span>
      ${m.dist != null ? `<span class="cv-dir" style="transform:rotate(${m.rel || 0}deg)">${ic('right')}</span><b class="num" style="font-size:18px">${U.dist(m.dist)}</b>` : ''}</div>`).join('')
      + (!(C.members || []).length ? '<p class="muted" style="padding:10px 6px">Esperando a que se una alguien… comparte el código.</p>' : '');
  };
  const feed = () => { const box = $('#cvFeed'); if (!box) return; box.innerHTML = (S.convoyFeed || []).slice(0, 8).map((m) => `<div class="item"><span class="ico">${ic('convoy')}</span><span class="grow"><span class="t" style="white-space:normal">${esc(m.title)}</span><span class="s">${ago(m.at)}</span></span></div>`).join(''); };
  draw();
  const offs = [on('convoy', () => { if (!!(S.convoy?.active) !== !!$('#cvList')) draw(); else list(); }), on('conn', draw), on('alert', (a) => { if (a.kind === 'convoy') feed(); })];
  return () => offs.forEach((f) => f());
};

// ---------- Botonera (el móvil como panel de mandos del camión) ----------
const KEY_GROUPS = [
  ['Luces', [['lights', 'Luces', 'low', 'low'], ['highBeam', 'Largas', 'high', 'high'], ['beacon', 'Rotativos', 'beacon', 'beacon'], ['hazard', 'Emergencia', 'fine', 'hazard']]],
  ['Intermitentes', [['blinkLeft', 'Izquierda', 'left', 'left'], ['blinkRight', 'Derecha', 'right', 'right']]],
  ['Conducción', [['parking', 'Freno de mano', 'park', 'parking'], ['cruise', 'Crucero', 'cruise', 'cruise'], ['engineBrake', 'Freno motor', 'engine', 'engineBrake'], ['retarderUp', 'Retarder +', 'plus'], ['retarderDown', 'Retarder −', 'minus'], ['engine', 'Motor', 'plug', 'engineOn']]],
  ['Bocinas', [['horn', 'Claxon', 'horn', null, true], ['airHorn', 'Bocina de aire', 'horn', null, true]]],
  ['Otros', [['wipers', 'Limpias', 'refresh'], ['liftAxle', 'Eje elevable', 'layers'], ['trailer', 'Remolque', 'truck'], ['map', 'Mapa', 'mapa'], ['gps', 'Navegador', 'target'], ['screenshot', 'Captura', 'star'], ['chat', 'Chat TMP', 'note'], ['pause', 'Pausa', 'x']]],
  ['Cámaras', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ['cam' + n, 'Cámara ' + n, 'cabina'])]
];
VIEWS.botonera = (root) => {
  let bindings = {}, editing = false, live = true;
  const draw = () => {
    root.innerHTML = `<div class="head"><div><h1>Botonera</h1><p>Tu móvil como panel de mandos: pulsa y el camión obedece</p></div>
      <div class="row wrap"><button class="btn" id="kbEdit">${editing ? ic('check') + 'Guardar teclas' : ic('ajustes') + 'Editar teclas'}</button></div></div>
      ${!S.connected ? notConnectedCard() : ''}
      ${S.connected && !live ? '<div class="card" style="margin-bottom:16px"><b>Modo de prueba</b><p class="muted">En modo demostración las pulsaciones no se envían al juego.</p></div>' : ''}
      <p class="muted" style="margin:-6px 0 14px;font-size:13px">El juego tiene que estar en primer plano en el PC. Las teclas son las de fábrica de ETS2/ATS; si las cambiaste en el juego, cámbialas aquí.</p>
      <div class="kb">${KEY_GROUPS.map(([g, items]) => `<section class="kb-group"><h3>${g}</h3><div class="kb-grid">${items.map(([id, label, icon, state, hold]) =>
        `<div class="kb-cell"><button class="kb-btn" data-k="${id}" ${hold ? 'data-hold="1"' : ''} ${state ? `data-st="${state}"` : ''}>${icon === 'plus' ? '<b class="kb-sym">+</b>' : icon === 'minus' ? '<b class="kb-sym">−</b>' : ic(icon)}<span>${label}</span></button>
        ${editing ? `<input class="input kb-in" data-bind="${id}" value="${esc(bindings[id] || '')}" maxlength="12">` : `<small class="kb-key">${esc(bindings[id] || '')}</small>`}</div>`).join('')}</div></section>`).join('')}</div>`;
    $('#kbEdit').onclick = async () => {
      if (editing) {
        const b = {}; $$('[data-bind]', root).forEach((i) => (b[i.dataset.bind] = i.value.trim()));
        try { bindings = (await post('/api/keys/bindings', b)).bindings; toast('Teclas guardadas', '', 'check', 'good'); } catch (e) { toast('No se pudo guardar', e.message, 'x', 'bad'); }
      }
      editing = !editing; draw(); paint();
    };
    $$('.kb-btn', root).forEach((b) => {
      const send = (a) => { post('/api/keys', { action: b.dataset.k, a }).catch((e) => toast('No se pudo enviar', e.message, 'x', 'bad')); haptic(); };
      if (b.dataset.hold) {
        b.onpointerdown = (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('press'); send('down'); };
        const up = () => { if (!b.classList.contains('press')) return; b.classList.remove('press'); send('up'); };
        b.onpointerup = up; b.onpointercancel = up; b.onpointerleave = up;
      } else b.onclick = () => { if (editing) return; b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 180); send('tap'); };
    });
  };
  const paint = () => {
    const t = S.live?.truck; if (!t) return;
    const L = t.lights || {};
    const st = { low: L.low, high: L.high, beacon: L.beacon, hazard: L.hazard, left: L.left && !L.hazard, right: L.right && !L.hazard, parking: t.parking, cruise: t.cruise, engineBrake: t.engineBrake || t.retarder > 0, engineOn: t.engineOn };
    $$('[data-st]', root).forEach((b) => b.classList.toggle('on', !!st[b.dataset.st]));
  };
  const load = async () => { if (!S.connected) return draw(); try { const r = await api('/api/keys'); bindings = r.bindings; live = r.live; } catch {} draw(); paint(); };
  load();
  if (IS_CAP) keepAwake(true);
  const offs = [on('tel', paint), on('conn', load)];
  return () => { offs.forEach((f) => f()); if (IS_CAP && !LS.get('awake', false)) keepAwake(false); };
};
// Notificaciones del sistema en Android cuando la app está en segundo plano
let notifId = 1;
async function sysNotify(title, body) {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!IS_CAP || !LN || !document.hidden || LS.get('notify', true) === false) return;
  try { await LN.schedule({ notifications: [{ id: notifId++ % 100000, title, body: body || '' }] }); } catch {}
}
async function askNotifyPermission() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications; if (!LN) return;
  try { const p = await LN.checkPermissions(); if (p.display !== 'granted') await LN.requestPermissions(); } catch {}
}
function haptic() { const Hp = window.Capacitor?.Plugins?.Haptics; if (Hp) Hp.impact({ style: 'MEDIUM' }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(15); }

// ---------- TruckersMP ----------
const sk = (h) => `<div class="skeleton" style="height:${h}px;border-radius:16px"></div>`;
function fmtDateStr(s) { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtDT(s) { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

async function saveTmpId(id) {
  id = String(id || '').trim();
  LS.set('tmpId', id);
  if (S.connected) await post('/api/settings', { tmpId: id }).then((s) => (S.settings = s)).catch(() => {});
}
function tmpSetupCard() {
  return `<section class="card" style="max-width:560px"><h2>Conecta tu perfil de TruckersMP</h2>
    <p class="muted" style="margin-bottom:16px">Escribe tu ID de TruckersMP (el número de tu perfil en truckersmp.com/user/…) o tu Steam ID.</p>
    <div class="row wrap"><input class="input" id="tmpIdIn" inputmode="numeric" placeholder="Ej.: 5644561" style="flex:1;min-width:180px">
    <button class="btn primary" id="tmpSave">Guardar</button>${!IS_CAP ? `<button class="btn" id="tmpDetect">Detectar desde Steam</button>` : ''}</div>
    <p class="muted" id="tmpMsg" style="margin-top:10px;font-size:13px"></p></section>`;
}
function bindTmpSetup(after) {
  const msg = (t) => ($('#tmpMsg').textContent = t);
  $('#tmpSave').onclick = async () => {
    const v = $('#tmpIdIn').value.trim(); if (!v) return msg('Escribe un ID.');
    msg('Comprobando…');
    try { const p = await tmp('player', v); await saveTmpId(p.id); after(); } catch { msg('No existe ningún perfil con ese ID.'); }
  };
  const d = $('#tmpDetect');
  if (d) d.onclick = async () => {
    msg('Buscando tu cuenta de Steam…');
    try { const p = await api('/api/tmp/detect'); await saveTmpId(p.id); toast('Perfil detectado', p.name, 'tmp', 'good'); after(); } catch (e) { msg(e.message.includes('404') || e.message.includes('TruckersMP') ? 'Tu cuenta de Steam no tiene perfil en TruckersMP.' : e.message); }
  };
}
VIEWS.tmp = (root) => {
  const draw = () => {
    const id = tmpIds().player;
    root.innerHTML = `<div class="head"><div><h1>TruckersMP</h1><p>Tu perfil, servidores y convoyes</p></div><div class="row wrap"><button class="btn" id="tmpSearch">${ic('search')}Buscar jugador</button>${id ? `<button class="btn" id="tmpChange">Cambiar perfil</button>` : ''}</div></div>
      ${id ? `<div class="grid g3">
        <section class="card span2" id="prof">${sk(84)}</section>
        <section class="card" id="bans">${sk(84)}</section></div>
      <div class="grid g2" style="margin-top:16px">
        <section class="card" id="servers"><h2>Servidores</h2>${sk(200)}</section>
        <section class="card" id="ach"><h2>Logros</h2>${sk(120)}</section></div>
      <div class="grid g2" style="margin-top:16px"><section class="card" id="myEvents"><h2>Mis eventos</h2>${sk(80)}</section>
        <section class="card"><h2>TruckersMP <span class="pill" id="tmpVer">…</span></h2><p class="muted" style="margin-bottom:12px">Consulta las normas oficiales. El HUB te avisa si estás a punto de incumplir alguna que se pueda detectar (luces de noche, marcha atrás, exceso de velocidad…).</p>
          <div class="row wrap"><button class="btn primary" id="tmpRules">${ic('shield')}Leer las normas</button><a class="btn" href="https://truckersmp.com/knowledge-base" target="_blank" rel="noopener">Base de conocimiento</a><a class="btn" href="https://truckersmp.com/support" target="_blank" rel="noopener">Soporte</a></div></section></div>
      <h2 style="font-size:20px;margin:28px 0 14px">Próximos convoyes</h2>
      <div class="grid g3" id="events">${sk(220)}${sk(220)}${sk(220)}</div>` : tmpSetupCard()}`;
    $('#tmpSearch').onclick = async () => {
      const q = await askInput({ title: 'Buscar jugador', text: 'Escribe su ID de TruckersMP o su Steam ID.', placeholder: 'Ej.: 5644561', ok: 'Buscar' });
      if (q) playerSheet(q);
    };
    if (!id) return bindTmpSetup(draw);
    $('#tmpChange').onclick = () => { $('#prof').innerHTML = tmpSetupCard(); bindTmpSetup(draw); };
    tmp('player', id).then((p) => {
      $('#prof').innerHTML = `<div class="profile"><img class="avatar" src="${esc(p.avatar)}" alt="">
        <div style="min-width:0"><div style="font-size:26px;font-weight:700;line-height:1.1">${esc(p.name)}</div>
        <div class="row wrap" style="margin-top:8px;gap:6px"><span class="pill" style="color:${esc(p.groupColor || 'inherit')}">${esc(p.groupName || 'Jugador')}</span>
          ${p.vtc?.inVTC ? `<span class="pill acc">${esc(p.vtc.tag || '')} ${esc(p.vtc.name)}</span>` : ''}${p.patreon?.isPatron ? '<span class="pill warn">Patreon</span>' : ''}
          ${p.banned ? '<span class="pill bad">Baneado</span>' : '<span class="pill good">Sin ban activo</span>'}</div></div></div>
        <div class="detail" style="grid-template-columns:repeat(3,1fr)">
          <div><small>ID TruckersMP</small><b>${p.id}</b></div><div><small>Miembro desde</small><b>${fmtDateStr(p.joinDate)}</b></div>
          <div><small>Steam ID</small><b style="font-size:13px">${esc(p.steamID)}</b></div></div>
        <div class="row" style="margin-top:16px"><a class="btn" href="https://truckersmp.com/user/${p.id}" target="_blank" rel="noopener">Ver perfil en la web</a></div>`;
      const a = p.achievements || [];
      $('#ach').innerHTML = `<h2>Logros <span class="pill">${a.length}</span></h2>` + (a.length ? `<div class="list">${a.map((x) =>
        `<div class="item"><img class="avatar sm" src="${esc(x.image_url)}" alt=""><span class="grow"><span class="t">${esc(x.title)}</span><span class="s">${esc(x.description)}</span></span></div>`).join('')}</div>` : '<p class="muted">Aún no tienes logros.</p>');
    }).catch((e) => { $('#prof').innerHTML = `<div class="empty"><b>No se pudo cargar el perfil</b>${esc(e.message)}</div>`; $('#ach').innerHTML = '<h2>Logros</h2>'; });
    tmp('bans', id).then((b) => {
      $('#bans').innerHTML = `<h2>Sanciones</h2>` + (b.length ? `<div class="list">${b.map((x) =>
        `<div class="item"><span class="ico ${x.active ? 'bad' : ''}">${ic('shield')}</span><span class="grow"><span class="t">${esc(x.reason)}</span><span class="s">${fmtDateStr(x.timeAdded)} · ${x.expiration ? 'hasta ' + fmtDateStr(x.expiration) : 'permanente'}</span></span></div>`).join('')}</div>`
        : `<div class="empty" style="padding:20px 0">${ic('shield')}<b>Historial limpio</b>No tienes sanciones visibles.</div>`);
    }).catch(() => { $('#bans').innerHTML = '<h2>Sanciones</h2><p class="muted">No visibles públicamente.</p>'; });
    tmp('servers').then((list) => {
      const srv = list.filter((s) => s.game === 'ETS2' || s.game === 'ATS');
      $('#servers').innerHTML = `<h2>Servidores <span class="pill">${n0(srv.reduce((a, s) => a + s.players, 0))} en línea</span></h2>` + srv.map((s) =>
        `<div class="server"><span><b>${esc(s.name)}</b> <span class="muted" style="font-size:13px">${s.game}${s.queue ? ` · ${s.queue} en cola` : ''}${s.speedlimiter ? '' : ' · sin limitador'}${s.collisions ? '' : ' · sin colisiones'}</span></span>
          <span class="num ${s.online ? '' : 'bad'}" style="font-size:18px">${s.online ? `${n0(s.players)} / ${n0(s.maxplayers)}` : 'Cerrado'}</span>
          <div class="bar ${s.players / s.maxplayers > .9 ? 'bad' : ''}"><i style="width:${(s.players / s.maxplayers) * 100}%"></i></div></div>`).join('');
    }).catch((e) => { $('#servers').innerHTML = `<h2>Servidores</h2><p class="muted">${esc(e.message)}</p>`; });
    if (S.connected) {
      api('/api/tmp/version').then((v) => { $('#tmpVer').textContent = `Mod ${v.name} · ETS2 ${v.supported_game_version || '?'} · ATS ${v.supported_ats_game_version || '?'}`; }).catch(() => { $('#tmpVer').textContent = ''; });
      api('/api/tmp/myevents').then((list) => {
        const L = Array.isArray(list) ? list : [];
        $('#myEvents').innerHTML = `<h2>Mis eventos <span class="pill">${L.length}</span></h2>` + (L.length ? `<div class="list">${L.slice(0, 6).map((e) => `<a class="item" href="https://truckersmp.com${esc(e.url)}" target="_blank" rel="noopener" style="color:inherit"><span class="ico">${ic('calendar')}</span><span class="grow"><span class="t">${esc(e.name)}</span><span class="s">${fmtDT(e.start_at)} · ${esc(e.server?.name || '')}</span></span></a>`).join('')}</div>`
          : `<p class="muted">No te has apuntado a ningún evento. Marca «Asistiré» en la web de TruckersMP y aparecerán aquí.</p>`);
      }).catch(() => { $('#myEvents').innerHTML = '<h2>Mis eventos</h2><p class="muted">No disponibles.</p>'; });
    } else { $('#myEvents').innerHTML = '<h2>Mis eventos</h2><p class="muted">Conecta con el PC para verlos.</p>'; }
    $('#tmpRules').onclick = async () => {
      const sh = openSheet(`<h2 style="font-size:24px;margin-bottom:10px">Normas de TruckersMP</h2><div id="rulesBody" class="rules">${sk(300)}</div>`);
      try {
        const r = S.connected ? await api('/api/tmp/rules') : await tmp('rules');
        const md = String(r.rules || r || '');
        $('#rulesBody', sh).innerHTML = esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+ (.+)$/gm, '<h3>$1</h3>').replace(/^ ?[-*] (.+)$/gm, '<li>$1</li>').replace(/\r?\n\r?\n/g, '<br><br>');
      } catch (e) { $('#rulesBody', sh).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
    };
    tmp('events').then((ev) => {
      const list = [...(ev.featured || []), ...(ev.today || []), ...(ev.upcoming || [])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 9);
      $('#events').innerHTML = list.map(eventCard).join('') || '<p class="muted">No hay convoyes programados.</p>';
    }).catch(() => { $('#events').innerHTML = '<p class="muted">No se pudieron cargar los convoyes.</p>'; });
  };
  draw();
  const off = on('conn', () => S.connected && draw());
  return off;
};
async function playerSheet(id) {
  const sh = openSheet(`<div id="psBody">${sk(120)}</div>`);
  try {
    const [p, bans] = await Promise.all([tmp('player', id), tmp('bans', id).catch(() => [])]);
    const isFriend = (S.settings?.friends || []).some((f) => f.id === p.id);
    $('#psBody', sh).innerHTML = `<div class="profile"><img class="avatar" src="${esc(p.avatar)}" alt=""><div><div style="font-size:24px;font-weight:700">${esc(p.name)}</div>
      <div class="row wrap" style="gap:6px;margin-top:6px"><span class="pill" style="color:${esc(p.groupColor || 'inherit')}">${esc(p.groupName || 'Jugador')}</span>${p.vtc?.inVTC ? `<span class="pill acc">${esc(p.vtc.name)}</span>` : ''}${p.banned ? '<span class="pill bad">Baneado</span>' : ''}</div></div></div>
      <div class="detail"><div><small>ID</small><b>${p.id}</b></div><div><small>Miembro desde</small><b>${fmtDateStr(p.joinDate)}</b></div><div><small>Sanciones visibles</small><b>${bans.length}</b></div><div><small>Steam ID</small><b style="font-size:12px">${esc(p.steamID)}</b></div></div>
      <div class="row wrap" style="margin-top:20px"><a class="btn" href="https://truckersmp.com/user/${p.id}" target="_blank" rel="noopener">Perfil web</a>
      ${S.connected ? `<button class="btn primary" id="psFriend" ${isFriend ? 'disabled' : ''}>${isFriend ? 'Ya es tu amigo' : 'Añadir a amigos'}</button>` : ''}</div>`;
    const b = $('#psFriend', sh);
    if (b) b.onclick = async () => { S.settings = await post('/api/settings', { friends: [...(S.settings.friends || []), { id: p.id, name: p.name, avatar: p.smallAvatar || p.avatar }] }); b.disabled = true; b.textContent = 'Añadido'; toast('Amigo añadido', p.name, 'vtc', 'good'); };
  } catch (e) { $('#psBody', sh).innerHTML = `<div class="empty"><b>No encontrado</b>${esc(e.message)}</div>`; }
}
function eventCard(e) {
  return `<a class="card event-card" href="https://truckersmp.com${esc(e.url)}" target="_blank" rel="noopener">
    <div class="banner" style="background-image:url('${esc(e.banner || '')}')"></div>
    <div class="body"><div class="row between" style="margin-bottom:6px"><span class="pill acc">${esc(e.event_type?.name || 'Evento')}</span><span class="muted" style="font-size:13px">${esc(e.game)}</span></div>
      <b style="display:block;line-height:1.25;color:var(--text)">${esc(e.name)}</b>
      <p class="muted" style="font-size:13px;margin-top:6px">${fmtDT(e.start_at)} · ${esc(e.server?.name || '')}</p>
      <p class="muted" style="font-size:13px">${esc(e.departure?.city || '?')} → ${esc(e.arrive?.city || '?')}${e.attendances ? ` · ${e.attendances.confirmed} asistentes` : ''}</p></div></a>`;
}

// ---------- VTC ----------
VIEWS.vtc = (root) => {
  const id = tmpIds().vtc;
  root.innerHTML = `<div class="head"><div><h1>Mi VTC</h1><p>Empresa virtual en TruckersMP</p></div></div>
    <section class="card" id="vtcInfo">${sk(240)}</section>
    <div class="grid g2" style="margin-top:16px"><section class="card" id="vtcMembers"><h2>Miembros</h2>${sk(200)}</section>
    <section class="card" id="vtcEvents"><h2>Eventos de la VTC</h2>${sk(200)}</section></div>`;
  tmp('vtc', id).then((v) => {
    $('#vtcInfo').innerHTML = `<div class="cover" style="background-image:url('${esc(v.cover)}')"></div>
      <div class="profile"><img class="avatar" src="${esc(v.logo)}" alt=""><div>
        <div style="font-size:26px;font-weight:700;line-height:1.1">${esc(v.name)} <span class="muted" style="font-size:18px">[${esc(v.tag)}]</span></div>
        <p class="muted" style="margin-top:4px">${esc(v.slogan || '')}</p>
        <div class="row wrap" style="gap:6px;margin-top:10px"><span class="pill acc">${n0(v.members_count)} miembros</span>
          <span class="pill ${v.recruitment === 'Open' ? 'good' : ''}">Reclutamiento ${v.recruitment === 'Open' ? 'abierto' : 'cerrado'}</span>
          ${v.verified ? '<span class="pill good">Verificada</span>' : ''}<span class="pill">${esc(v.language || '')}</span><span class="pill">Desde ${fmtDateStr(v.created)}</span></div></div></div>
      <div class="row wrap" style="margin-top:18px"><a class="btn" href="https://truckersmp.com/vtc/${v.id}" target="_blank" rel="noopener">Ver en TruckersMP</a>
        ${v.website ? `<a class="btn" href="${esc(v.website)}" target="_blank" rel="noopener">Web</a>` : ''}${v.socials?.discord ? `<a class="btn" href="${esc(v.socials.discord)}" target="_blank" rel="noopener">Discord</a>` : ''}</div>`;
  }).catch((e) => { $('#vtcInfo').innerHTML = `<div class="empty"><b>No se pudo cargar la VTC</b>${esc(e.message)}. Revisa el ID en Ajustes.</div>`; });
  if (S.connected) api(`/api/tmp/vtc/news?id=${encodeURIComponent(id)}`).then((r) => {
    const n = r.news || [];
    if (!n.length) return;
    const sec = document.createElement('section'); sec.className = 'card'; sec.style.marginTop = '16px';
    sec.innerHTML = `<h2>Noticias de la VTC</h2><div class="list">${n.slice(0, 5).map((x) => `<a class="item" href="https://truckersmp.com/vtc/${id}/news/${x.id}" target="_blank" rel="noopener" style="color:inherit"><span class="ico">${ic('note')}</span><span class="grow"><span class="t">${esc(x.title)}</span><span class="s">${esc(x.content_summary || '').slice(0, 120)}</span></span></a>`).join('')}</div>`;
    $('#vtcInfo')?.after(sec);
  }).catch(() => {});
  if (S.connected) api('/api/vtc/online').then((list) => {
    const sec = document.createElement('section'); sec.className = 'card'; sec.style.marginTop = '16px';
    sec.innerHTML = `<h2>Conectados ahora <span class="pill ${list.length ? 'good' : ''}">${list.length}</span></h2>` + (list.length ? `<div class="list">${list.map((m) => `<div class="item"><span class="dot on"></span><span class="grow"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.role || '')}</span></span>${m.dist != null ? `<b class="num">${U.dist(m.dist)}</b>` : ''}</div>`).join('')}</div><button class="btn" data-go="mapa" style="margin-top:10px">${ic('mapa')}Verlos en el mapa</button>` : '<p class="muted">Ningún compañero está conduciendo en TruckersMP ahora mismo.</p>');
    $('#vtcInfo')?.after(sec);
  }).catch(() => {});
  tmp('vtc/members', id).then((r) => {
    const m = r.members || [];
    $('#vtcMembers').innerHTML = `<h2>Miembros <span class="pill">${m.length}</span></h2><div class="list">${m.map((x) =>
      `<a class="item" href="https://truckersmp.com/user/${x.user_id}" target="_blank" rel="noopener" style="color:inherit"><img class="avatar sm" src="${esc(x.avatar)}" alt="" loading="lazy">
        <span class="grow"><span class="t">${esc(x.username)}</span><span class="s">Desde ${fmtDateStr(x.joinDate)}</span></span>
        <span class="pill" style="color:${esc(x.roles?.[0]?.color || 'inherit')}">${esc(x.role)}</span></a>`).join('')}</div>`;
  }).catch(() => { $('#vtcMembers').innerHTML = '<h2>Miembros</h2><p class="muted">No disponibles.</p>'; });
  tmp('vtc/events', id).then((ev) => {
    const list = Array.isArray(ev) ? ev : [];
    $('#vtcEvents').innerHTML = `<h2>Eventos de la VTC</h2>` + (list.length ? `<div class="stack">${list.slice(0, 6).map(eventCard).join('')}</div>`
      : `<div class="empty" style="padding:24px 0">${ic('calendar')}<b>Sin eventos publicados</b>Los convoyes que cree la VTC aparecerán aquí.</div>`);
  }).catch(() => { $('#vtcEvents').innerHTML = '<h2>Eventos de la VTC</h2><p class="muted">No disponibles.</p>'; });
};

// ---------- Ajustes ----------
function themeGrid() {
  const t = currentTheme();
  return `<div class="themes">${THEMES.map((x) => `<button class="theme-opt" data-id="${x.id}" aria-pressed="${x.id === t}">
    <div class="sw" style="background:${x.c[0]}"><i style="left:10px;right:45%;background:${x.c[2]}"></i><i style="left:58%;right:10px;background:${x.c[3]}"></i>
    <i style="left:10px;right:10px;bottom:28px;height:14px;background:${x.c[1]};border-radius:6px"></i></div><b>${x.name}</b></button>`).join('')}</div>`;
}
function bindThemes(root) { $$('.theme-opt', root).forEach((b) => (b.onclick = (e) => setTheme(b.dataset.id, e))); }
const sw = (id, checked, label, sub) => `<div class="setting"><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label></div>`;

async function pluginHtml() {
  try {
    const r = await api('/api/plugin');
    if (!r.games.length) return `<p class="muted">No se encontró ETS2 ni ATS en Steam. Si lo tienes instalado en otra ruta, copia <b>scs-telemetry.dll</b> (carpeta de instalación del HUB → resources/plugin/win64) en <b>bin/win_x64/plugins</b> del juego.</p>`;
    return r.games.map((g) => `<div class="setting"><div><b>${g.name}</b><small>${esc(g.dir)}</small></div>
      ${g.installed ? `<span class="pill good">${ic('check')} Plugin instalado</span>` : `<button class="btn primary" data-install="${g.key}">Instalar plugin</button>`}</div>`).join('');
  } catch (e) { return `<p class="muted">${esc(e.message)}</p>`; }
}
function bindPlugin(box, rerender) {
  box.onclick = async (e) => {
    const b = e.target.closest('[data-install]'); if (!b) return;
    b.disabled = true; b.textContent = 'Instalando…';
    try { await post('/api/plugin/install', { game: b.dataset.install }); toast('Plugin instalado', 'Al abrir el juego, acepta el aviso de «SDK avanzado».', 'check', 'good'); }
    catch (err) { toast('No se pudo instalar', err.message, 'x', 'bad'); }
    rerender();
  };
}

// ---------- preferencias ampliadas (apariencia, unidades, cabina, avisos, objetivos, actualizaciones) ----------
const ACCENTS = ['#ffb547', '#ff7a59', '#ff5bd6', '#b07cff', '#7aa7ff', '#45d6c8', '#4fd1a1', '#e5e55b', '#ff6b7a', '#9db4ff'];
const segs = (id, cur, opts) => `<div class="chips" id="${id}">${opts.map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
const numField = (id, label, val, unit, min = 0, step = 1) => `<div class="setting"><div><b>${label}</b></div><div class="row" style="gap:6px"><input class="input" type="number" id="${id}" value="${esc(val ?? '')}" min="${min}" step="${step}" style="width:110px;text-align:right"><span class="muted" style="min-width:34px">${unit}</span></div></div>`;
function localPref(group) { return IS_CAP && (group === 'appearance' || group === 'units'); }
async function setPref(group, patch) {
  if (localPref(group)) {
    LS.set(group, { ...LS.get(group, {}), ...patch });
  } else if (S.connected) {
    try { S.settings = await post('/api/settings', { [group]: patch }); } catch (e) { toast('No se pudo guardar', e.message, 'x', 'bad'); return; }
  } else return toast('Sin conexión con el PC', 'Este ajuste se guarda en el ordenador.', 'x', 'bad');
  if (group === 'appearance') applyAppearance();
}
function prefsHtml() {
  const a = appearance(), u = { ...(S.settings?.units || {}), ...(IS_CAP ? LS.get('units', {}) : {}) };
  const al = S.settings?.alerts || {}, go = S.settings?.goals || {}, up = S.settings?.updates || {}, ck = a.cockpit || {};
  const ms = LS.get('mobileSound', {});
  return `
  <section class="card span2"><h2>Apariencia</h2>
    <div class="setting"><div><b>Color de acento</b><small>Sustituye el color principal del tema</small></div>
      <div class="row wrap" style="gap:6px;justify-content:flex-end" id="accSw">${ACCENTS.map((c) => `<button class="swatch ${a.accent === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Acento ${c}"></button>`).join('')}
      <label class="swatch custom" title="Color personalizado"><input type="color" id="accCustom" value="${esc(a.accent || '#ffb547')}"></label>
      <button class="btn ghost" id="accReset" style="padding:6px 10px">Del tema</button></div></div>
    <div class="setting"><div><b>Densidad</b><small>Espacio entre elementos</small></div>${segs('denSeg', a.density || 'normal', [['compact', 'Compacta'], ['normal', 'Normal'], ['comfy', 'Amplia']])}</div>
    <div class="setting"><div><b>Redondeo de esquinas</b></div><input type="range" id="radRange" min="0" max="1.6" step="0.1" value="${a.radius ?? 1}" aria-label="Redondeo"></div>
    <div class="setting"><div><b>Tamaño del texto</b></div><input type="range" id="fsRange" min="0.85" max="1.3" step="0.05" value="${a.fontScale ?? 1}" aria-label="Tamaño del texto"></div>
    ${sw('apMotion', a.motion !== false, 'Animaciones y transiciones')}
    ${sw('apGlow', a.glow !== false, 'Brillo de fondo')}
    ${IS_CAP ? '' : sw('apNav', !!a.compactNav, 'Menú lateral compacto', 'Solo iconos')}
    <div class="setting"><div><b>Idioma</b></div><select class="input" id="apLang" style="width:auto">${Object.entries(I18N.LANGS).map(([k, v]) => `<option value="${k}" ${k === I18N.lang ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="setting"><div><b>Pantalla al abrir</b></div><select class="input" id="apStart" style="width:auto">${NAV.map((n) => `<option value="${n.id}" ${n.id === (a.startPage || 'cabina') ? 'selected' : ''}>${n.label}</option>`).join('')}</select></div>
  </section>
  <section class="card"><h2>Unidades</h2>
    <div class="setting"><div><b>Velocidad y distancia</b></div>${segs('uSpeed', u.speed || 'kmh', [['kmh', 'km/h · km'], ['mph', 'mph · millas']])}</div>
    <div class="setting"><div><b>Temperatura</b></div>${segs('uTemp', u.temp || 'c', [['c', '°C'], ['f', '°F']])}</div>
    <div class="setting"><div><b>Volumen</b></div>${segs('uVol', u.volume || 'l', [['l', 'Litros'], ['gal', 'Galones']])}</div>
    <div class="setting"><div><b>Peso</b></div>${segs('uW', u.weight || 't', [['t', 'Toneladas'], ['lb', 'Libras']])}</div>
    ${S.connected ? numField('fuelPrice', 'Precio del combustible', S.settings?.costs?.fuelPrice ?? 1.6, cur() + '/l', 0, 0.05) : ''}
  </section>
  <section class="card"><h2>Tarjetas de la cabina</h2>
    ${sw('ckHero', ck.hero !== false, 'Velocímetro')}${sw('ckJob', ck.job !== false, 'Trabajo actual')}${sw('ckSes', ck.session !== false, 'Sesión de hoy')}
    ${sw('ckGoals', ck.goals !== false, 'Objetivos')}${sw('ckTanks', ck.tanks !== false, 'Depósitos')}${sw('ckDmg', ck.damage !== false, 'Estado del vehículo')}${sw('ckCtl', ck.controls !== false, 'Mandos y temperaturas')}${sw('ckTacho', ck.tacho !== false, 'Tacógrafo')}
  </section>
  ${S.connected ? `
  <section class="card"><h2>Umbrales de los avisos</h2>
    ${numField('thSpeed', 'Tolerancia de velocidad', al.speedTolerance ?? 8, 'km/h', 1)}
    ${numField('thFuel', 'Aviso de combustible', al.fuelKm ?? 120, 'km', 20, 10)}
    ${numField('thRest', 'Primer aviso de descanso', al.restMinutes ?? 60, 'min', 20, 5)}
    ${numField('thDmg', 'Golpe mínimo para avisar', al.damageJump ?? 3, '%', 1)}
  </section>
  <section class="card"><h2>Sonido y voz</h2>
    ${sw('snSound', al.sound !== false, 'Pitidos en los avisos')}
    ${sw('snVoice', !!al.voice, 'Leer los avisos en voz alta', 'Con la voz en español de tu sistema')}
    <div class="setting"><div><b>Volumen</b></div><input type="range" id="snVol" min="0" max="1" step="0.05" value="${al.volume ?? 0.6}" aria-label="Volumen"></div>
    <div class="setting"><div><b>Tono</b></div>${segs('snPack', al.pack || 'suave', Object.entries(HubSound.PACKS).map(([k, v]) => [k, v.name]))}</div>
    <div class="setting"><div><b>Dónde suenan</b></div>${segs('snWhere', al.target || 'pc', [['pc', 'PC'], ['movil', 'Móvil'], ['ambos', 'Ambos']])}</div>
    <div class="row wrap"><button class="btn" id="snTest">Probar sonido</button><button class="btn" id="snTestVoice">Probar voz</button></div>
  </section>
  <section class="card"><h2>Tacógrafo (normativa europea)</h2>
    ${sw('tcOn', S.settings?.tacho?.enabled !== false, 'Tacógrafo activado', 'Cuenta el tiempo real de conducción y avisa de las pausas')}
    ${numField('tcBlock', 'Conducción seguida máxima', S.settings?.tacho?.blockMin ?? 270, 'min', 30, 15)}
    ${numField('tcBreak', 'Pausa obligatoria', S.settings?.tacho?.breakMin ?? 45, 'min', 5, 5)}
    ${numField('tcDay', 'Conducción diaria máxima', S.settings?.tacho?.dayMin ?? 540, 'min', 60, 30)}
    ${numField('tcRest', 'Descanso diario', S.settings?.tacho?.restMin ?? 540, 'min', 60, 30)}
    <small class="muted">Por defecto: 4 h 30 min seguidas → 45 min de pausa (vale partirla en tramos de 15 min o más) y 9 h al día. El tiempo con el juego cerrado cuenta como descanso.</small>
    <div class="row" style="margin-top:10px"><button class="btn" id="tcReset">${ic('refresh')}Reiniciar tacógrafo</button></div>
  </section>
  <section class="card"><h2>Bot de Discord de la VTC</h2>
    <p class="muted" style="margin-bottom:12px">Envía automáticamente tus entregas, multas y horas de tacógrafo al bot de Discord de tu VTC.</p>
    ${sw('vbOn', !!S.settings?.vtcBot?.enabled, 'Conectar con el bot')}
    <div class="stack"><div class="field"><label for="vbUrl">Dirección del bot</label><input class="input" id="vbUrl" placeholder="http://IP-del-hosting:PUERTO/xito-hub" value="${esc(S.settings?.vtcBot?.url || '')}"></div>
    <div class="field"><label for="vbToken">Clave secreta</label><input class="input" id="vbToken" type="password" value="${esc(S.settings?.vtcBot?.token || '')}" autocomplete="off"></div>
    <div class="field"><label for="vbDiscord">Tu ID de usuario de Discord</label><input class="input" id="vbDiscord" inputmode="numeric" value="${esc(S.settings?.vtcBot?.discordId || '')}"></div>
    <div class="row wrap"><button class="btn primary" id="vbSave">Guardar</button><button class="btn" id="vbTest">Enviar prueba</button><span class="muted" id="vbStatus" style="font-size:13px"></span></div></div>
  </section>
  <section class="card"><h2>Objetivos</h2>
    ${numField('goDay', 'Kilómetros al día', go.dailyKm ?? 0, 'km', 0, 50)}
    ${numField('goWeekKm', 'Kilómetros a la semana', go.weeklyKm ?? 0, 'km', 0, 100)}
    ${numField('goWeekRev', 'Ingresos a la semana', go.weeklyRevenue ?? 0, cur(), 0, 1000)}
    ${numField('goWeekJobs', 'Entregas a la semana', go.weeklyJobs ?? 0, '', 0)}
    <small class="muted">Pon 0 para ocultar un objetivo.</small>
  </section>` : ''}
  <section class="card"><h2>Actualizaciones</h2>
    <p class="muted" style="margin-bottom:12px">Versión ${APP_VERSION}. Al actualizar, el instalador y el APK conservan todos tus datos.</p>
    ${S.connected ? `<div class="field"><label for="upRepo">Repositorio de GitHub</label><input class="input" id="upRepo" placeholder="usuario/xito-truck-hub" value="${esc(up.repo || '')}"></div>
    <div class="field" style="margin-top:10px"><label for="upUrl">URL de updates.json (opcional)</label><input class="input" id="upUrl" placeholder="https://raw.githubusercontent.com/usuario/repo/main/updates.json" value="${esc(up.url || '')}"></div>
    ${sw('upAuto', up.check !== false, 'Buscar actualizaciones al abrir')}` : ''}
    <div class="row wrap" style="margin-top:10px"><button class="btn primary" id="upCheck">Buscar ahora</button><button class="btn ghost" id="upNotes">Novedades de esta versión</button></div>
    <p class="muted" id="upMsg" style="font-size:13px;margin-top:10px"></p>
  </section>`;
}
function bindPrefs(root) {
  const seg = (id, fn) => { const el = $('#' + id); if (!el) return; el.onclick = (e) => { const c = e.target.closest('[data-v]'); if (!c) return; $$('#' + id + ' .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); fn(c.dataset.v); }; };
  const tog = (id, fn) => { const el = $('#' + id); if (el) el.onchange = (e) => fn(e.target.checked); };
  const num = (id, fn) => { const el = $('#' + id); if (el) el.onchange = (e) => fn(Math.max(0, +e.target.value || 0)); };
  $('#accSw').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; $$('#accSw .swatch').forEach((x) => x.classList.toggle('on', x === b)); setPref('appearance', { accent: b.dataset.c }); };
  $('#accCustom').oninput = (e) => { document.documentElement.style.setProperty('--accent', e.target.value); };
  $('#accCustom').onchange = (e) => setPref('appearance', { accent: e.target.value });
  $('#accReset').onclick = () => { $$('#accSw .swatch').forEach((x) => x.classList.remove('on')); setPref('appearance', { accent: '' }); };
  seg('denSeg', (v) => setPref('appearance', { density: v }));
  $('#radRange').oninput = (e) => document.documentElement.style.setProperty('--rs', e.target.value);
  $('#radRange').onchange = (e) => setPref('appearance', { radius: +e.target.value });
  $('#fsRange').onchange = (e) => setPref('appearance', { fontScale: +e.target.value });
  tog('apMotion', (v) => setPref('appearance', { motion: v }));
  tog('apGlow', (v) => setPref('appearance', { glow: v }));
  tog('apNav', (v) => setPref('appearance', { compactNav: v }));
  $('#apStart').onchange = (e) => setPref('appearance', { startPage: e.target.value });
  $('#apLang').onchange = (e) => { const l = e.target.value; LS.set('language', l); I18N.set(l); if (S.connected && !IS_CAP) post('/api/settings', { language: l }).then((x) => (S.settings = x)).catch(() => {}); };
  seg('uSpeed', (v) => setPref('units', { speed: v })); seg('uTemp', (v) => setPref('units', { temp: v }));
  seg('uVol', (v) => setPref('units', { volume: v })); seg('uW', (v) => setPref('units', { weight: v }));
  const ckMap = { ckHero: 'hero', ckJob: 'job', ckSes: 'session', ckGoals: 'goals', ckTanks: 'tanks', ckDmg: 'damage', ckCtl: 'controls', ckTacho: 'tacho' };
  for (const [id, k] of Object.entries(ckMap)) tog(id, (v) => setPref('appearance', { cockpit: { ...(appearance().cockpit || {}), [k]: v } }));
  num('thSpeed', (v) => setPref('alerts', { speedTolerance: v })); num('thFuel', (v) => setPref('alerts', { fuelKm: v }));
  num('thRest', (v) => setPref('alerts', { restMinutes: v })); num('thDmg', (v) => setPref('alerts', { damageJump: v }));
  tog('snSound', (v) => setPref('alerts', { sound: v })); tog('snVoice', (v) => setPref('alerts', { voice: v }));
  if ($('#snVol')) $('#snVol').onchange = (e) => setPref('alerts', { volume: +e.target.value });
  seg('snWhere', (v) => setPref('alerts', { target: v }));
  seg('snPack', (v) => { setPref('alerts', { pack: v }); HubSound.beep('good', +($('#snVol')?.value || 0.6), v); });
  if ($('#snTest')) $('#snTest').onclick = () => { const p = S.settings?.alerts?.pack || 'suave', v = +$('#snVol').value; ['good', 'warn', 'bad', 'rule'].forEach((l, i) => setTimeout(() => HubSound.beep(l, v, p), i * 900)); };
  if ($('#snTestVoice')) $('#snTestVoice').onclick = () => HubSound.say('Te acercas a un punto congestionado. Doce camiones a dos kilómetros.', +$('#snVol').value);
  tog('tcOn', (v) => setPref('tacho', { enabled: v }));
  num('tcBlock', (v) => setPref('tacho', { blockMin: Math.max(30, v) })); num('tcBreak', (v) => setPref('tacho', { breakMin: Math.max(5, v) }));
  num('tcDay', (v) => setPref('tacho', { dayMin: Math.max(60, v) })); num('tcRest', (v) => setPref('tacho', { restMin: Math.max(60, v) }));
  if ($('#tcReset')) $('#tcReset').onclick = async () => { if (await askConfirm({ title: 'Reiniciar tacógrafo', text: 'Se pondrán a cero la conducción seguida y la diaria.', ok: 'Reiniciar' })) { S.tacho = await post('/api/tacho/reset'); toast('Tacógrafo reiniciado', '', 'check', 'good'); } };
  tog('vbOn', (v) => setPref('vtcBot', { enabled: v }));
  const vbSt = async () => { try { const r = await api('/api/vtcbot'); if ($('#vbStatus')) $('#vbStatus').textContent = r.ok === true ? `Conectado · ${r.pending} pendientes` : r.ok === false ? `Error: ${r.error} · ${r.pending} pendientes` : r.pending ? `${r.pending} pendientes` : ''; } catch {} };
  if ($('#vbSave')) { vbSt(); $('#vbSave').onclick = async () => { await setPref('vtcBot', { url: $('#vbUrl').value.trim(), token: $('#vbToken').value.trim(), discordId: $('#vbDiscord').value.replace(/\D/g, '') }); toast('Bot guardado', '', 'check', 'good'); vbSt(); }; }
  if ($('#vbTest')) $('#vbTest').onclick = async () => { try { await post('/api/vtcbot/test'); toast('El bot ha recibido la prueba', '', 'check', 'good'); } catch (e) { toast('El bot no contesta', e.message, 'x', 'bad'); } vbSt(); };
  num('fuelPrice', (v) => setPref('costs', { fuelPrice: v }));
  num('goDay', (v) => setPref('goals', { dailyKm: v })); num('goWeekKm', (v) => setPref('goals', { weeklyKm: v }));
  num('goWeekRev', (v) => setPref('goals', { weeklyRevenue: v })); num('goWeekJobs', (v) => setPref('goals', { weeklyJobs: v }));
  if ($('#upRepo')) $('#upRepo').onchange = (e) => setPref('updates', { repo: e.target.value });
  if ($('#upUrl')) $('#upUrl').onchange = (e) => setPref('updates', { url: e.target.value.trim() });
  tog('upAuto', (v) => setPref('updates', { check: v }));
  $('#upCheck').onclick = async () => {
    const msg = $('#upMsg'); msg.textContent = 'Buscando…';
    try {
      const r = await checkUpdate(true);
      msg.textContent = r.available ? `Hay una versión nueva: ${r.latest}.` : `Tienes la última versión (${r.latest || APP_VERSION}).`;
    } catch (e) { msg.textContent = e.message; }
  };
  $('#upNotes').onclick = () => showChangelog(APP_VERSION);
}

// ---------- versiones y actualizaciones ----------
const APP_VERSION = '1.4.1';
const CHANGELOG = {
  '1.4.1': [
    'El mini mapa del overlay muestra los nombres de las ciudades, las empresas y los puntos de interés',
    'Buscador de ciudades y empresas en el mapa, y datos al pasar el ratón por gasolineras, talleres o garajes',
    'El mini mapa consume menos recursos del juego',
    'Licencia MIT y avisos de terceros incluidos',
    'F5 se puede desactivar desde Ajustes',
    'Menos datos al consultar los recorridos desde el móvil en remoto',
    'El historial ocupa mucho menos: los recorridos de cada entrega se guardan simplificados y el listado ya no los envía',
    'El Excel de entregas incluye nota, modo, beneficio neto y matrícula',
    'Atajos Ctrl + 1…9 para cambiar de sección y «/» para buscar',
    'El aviso del fútbol se puede cerrar'
  ],
  '1.4.0': [
    'Acceso remoto desde cualquier lugar (también con datos móviles), cifrado y gratis; búsqueda automática del PC en la Wi‑Fi',
    'Overlay a pantalla completa estilo HUD del juego: velocímetro, testigos, mini mapa con la ruta, mensajes, finanzas de 7 días, combustible, tacógrafo y convoy',
    'Mensajes del camión y avisos de normas de TruckersMP (luces de noche, marcha atrás, exceso de velocidad…); en pausa el overlay se minimiza',
    'Nota de conducción (A+ a E), niveles de conductor y viajes «Real» o «Carrera»',
    'Tacógrafo realista: 4 h 30 min de conducción, 45 min de pausa y límite diario',
    'Botonera en el móvil y botones rápidos en el salpicadero',
    'Modo convoy con mapa, distancias, mensajes rápidos y aviso si alguien se queda atrás',
    'Conexión con el bot de Discord de la VTC: entregas, multas y tacógrafo se registran solos',
    'TruckersMP: amigos conectados, compañeros de la VTC cerca y en el mapa, recordatorios de eventos, normas, tus eventos, noticias de la VTC y mapa oficial',
    'Beneficio neto de cada entrega y «Mis camiones»',
    'Botón «Jugar», asistente propio a pantalla completa, 6 idiomas, 5 tonos de sonido y ventana con botones propios',
    'Android: notificaciones en segundo plano, pantalla siempre encendida y pantalla de inicio propia',
    'Correcciones: overlay que tapaba el HUB, elección de monitor, registro de errores y menor consumo de datos',
    'Aviso cuando TruckersMP cae en España por los bloqueos del fútbol de LaLiga (según hayahora.futbol), y cuando vuelve',
    'Mapa con gasolineras, descanso, talleres, garajes y empresas; jugadores casi en tiempo real y movimiento más fluido',
    'Navegación en tiempo real: la ruta recomendada se recalcula si te sales y solo se dibuja lo que queda',
    'Zoom del mini mapa del overlay con F5 (4 niveles)',
    'Nueva pestaña Recorridos: mapa de todo lo recorrido, velocidad, horarios, países, ciudades y camiones (también sin conexión en el móvil)',
    'Actualizador propio: descarga e instala la nueva versión con barra de progreso; el móvil también avisa',
    'Arreglados los intermitentes y la marcha mostrada; nueva barra superior en el móvil',
    'El tema «Alborán» pasa a llamarse «Costa»'
  ],
  '1.3.0': [
    'Mapa de tráfico en tiempo real: zonas fluidas, densas y congestionadas de TruckersMP',
    'Ruta recomendada: al aceptar un trabajo te dice por qué ciudades pasa la ruta más concurrida',
    'Comparativa con la ruta más corta y planificador de rutas entre cualquier par de ciudades',
    'La cabina y el overlay muestran la siguiente ciudad de la ruta recomendada',
    'Android: búsqueda automática del PC en la Wi‑Fi, vibración en los avisos y barra de estado a juego con el tema',
    'Android: las peticiones ya no se quedan colgadas si el PC deja de responder'
  ],
  '1.2.1': [
    'Nuevo asistente de instalación con estética oscura a juego con la app',
    'Detecta la versión instalada y actualiza conservando todos tus datos',
    'Opciones al instalar: plugin de telemetría, acceso directo, inicio con Windows y arranque en la bandeja',
    'Al desinstalar puedes elegir si conservar o borrar tu historial'
  ],
  '1.2.0': [
    'Mapa en vivo con los jugadores de TruckersMP, tus rutas, ciudades, destino y amigos',
    'Amigos: añádelos por su ID y mira si están conectados y a qué distancia',
    'Recorrido de cada entrega en un mini mapa, con notas y valoración',
    'Sesión de hoy, objetivos diarios y semanales, y calendario de actividad del año',
    'Apariencia a tu gusto: color de acento, densidad, esquinas, tamaño del texto, animaciones y menú compacto',
    'Unidades: km/h o mph, °C o °F, litros o galones, toneladas o libras',
    'Elige qué tarjetas ver en la cabina y qué pantalla se abre al empezar',
    'Avisos con sonido y voz en español, umbrales configurables y elección de PC o móvil',
    'Overlay con diseño compacto o completo, posición en esquinas y duración de avisos',
    'Buscador de actualizaciones: el instalador y el APK actualizan conservando tus datos'
  ]
};
function showChangelog(v, from) {
  const items = CHANGELOG[v]; if (!items) return;
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><span class="pill acc">Versión ${esc(v)}</span>
    <h2 style="margin-top:12px">${from ? '¡Actualizado! Tus datos siguen aquí' : 'Novedades'}</h2>
    <p class="lead">${from ? `Has pasado de la ${esc(from)} a la ${esc(v)}. Esto es lo nuevo:` : 'Lo que trae esta versión:'}</p>
    <div class="list">${items.map((t) => `<div class="item"><span class="ico good">${ic('check')}</span><span class="grow" style="white-space:normal">${esc(t)}</span></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn primary" data-ok>Genial</button></div></div>`;
  document.body.appendChild(back);
  back.querySelector('[data-ok]').onclick = () => back.remove();
}
// ---------- actualizador con interfaz propia ----------
function showUpdate(r) {
  if ($('.upd-modal')) return;
  const back = document.createElement('div'); back.className = 'modal-back upd-modal';
  const notes = Array.isArray(r.notes) ? r.notes : String(r.notes || '').split(/\r?\n/).map((x) => x.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  back.innerHTML = `<div class="modal upd"><div class="upd-hero"><span class="upd-icon">${ic('download')}</span><div><span class="pill acc">Nueva versión</span><h2>Xito Truck Hub ${esc(r.latest)}</h2><p class="muted">Tienes la ${esc(APP_VERSION)}. Se actualiza encima: tus datos no se tocan.</p></div></div>
    ${notes.length ? `<div class="list upd-notes">${notes.slice(0, 8).map((n) => `<div class="item"><span class="ico good">${ic('check')}</span><span class="grow" style="white-space:normal">${esc(n)}</span></div>`).join('')}</div>` : ''}
    <div class="upd-prog hidden" id="updProg"><div class="row between"><b id="updPhase">Descargando…</b><span class="num" id="updPct">0 %</span></div><div class="bar"><i id="updBar" style="width:0"></i></div><small class="muted" id="updInfo"></small></div>
    <div class="row wrap" style="justify-content:flex-end;margin-top:18px;gap:8px" id="updBtns">
      <button class="btn ghost" data-later>Más tarde</button>
      ${IS_ELECTRON && r.exe ? '<button class="btn primary" data-go-upd>Actualizar ahora</button>' : `<a class="btn primary" href="${esc((IS_CAP ? r.apk : r.exe) || r.url || '#')}" target="_blank" rel="noopener" data-dl>${IS_CAP ? 'Descargar APK' : 'Descargar instalador'}</a>`}
    </div>${IS_CAP ? '<p class="muted" style="font-size:12px;margin-top:10px">Al terminar la descarga, abre el archivo y pulsa «Actualizar». Android conserva tus datos.</p>' : ''}</div>`;
  document.body.appendChild(back);
  back.querySelector('[data-later]').onclick = () => { LS.set('skipUpdate', r.latest); back.remove(); };
  const go = back.querySelector('[data-go-upd]');
  if (go) go.onclick = async () => {
    $('#updProg').classList.remove('hidden'); $('#updBtns').classList.add('hidden');
    try { await post('/api/update/install', { url: r.exe, version: r.latest }); } catch (e) { $('#updPhase').textContent = e.message; $('#updBtns').classList.remove('hidden'); }
  };
}
on('update', (u) => {
  const box = $('#updProg'); if (!box) return;
  const pct = u.pct || 0;
  $('#updBar').style.width = pct + '%'; $('#updPct').textContent = pct + ' %';
  const mb = (x) => (x / 1048576).toFixed(1).replace('.', ',');
  if (u.phase === 'download') { $('#updPhase').textContent = 'Descargando…'; if (u.total) $('#updInfo').textContent = `${mb(u.got)} de ${mb(u.total)} MB`; }
  else if (u.phase === 'install') { $('#updPhase').textContent = 'Instalando… acepta el permiso de Windows'; $('#updInfo').textContent = 'El HUB se cerrará y volverá a abrirse solo.'; }
  else if (u.phase === 'restart') { $('#updPhase').textContent = 'Reiniciando…'; }
  else if (u.phase === 'error') { $('#updPhase').textContent = 'No se pudo actualizar: ' + (u.error || ''); $('#updBtns').classList.remove('hidden'); }
});
function checkVersion() {
  const last = LS.get('lastVersion', null);
  LS.set('lastVersion', APP_VERSION);
  if (last && last !== APP_VERSION) setTimeout(() => showChangelog(APP_VERSION, last), 800);
  if (S.settings?.updates?.check !== false) {
    setTimeout(() => checkUpdate(false).catch(() => {}), 4000);
    setInterval(() => checkUpdate(false).catch(() => {}), 6 * 3600e3);
  }
}
function newerV(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
async function checkUpdate(manual) {
  const repo = S.settings?.updates?.repo || LS.get('repo', '') || 'Xito-Development/xito-truck-hub';
  if (S.settings?.updates?.repo) LS.set('repo', S.settings.updates.repo);
  const jsonUrl = S.settings?.updates?.url || LS.get('updUrl', '') || (repo ? `https://raw.githubusercontent.com/${repo}/main/updates.json` : '');
  if (S.settings?.updates?.url) LS.set('updUrl', S.settings.updates.url);
  if (!repo && !jsonUrl) throw new Error('Escribe tu repositorio de GitHub o la URL de updates.json para buscar actualizaciones.');
  let r = null;
  // 1) updates.json: la «base de datos» gratuita de versiones (GitHub, Gist o cualquier web)
  if (jsonUrl) { try { const j = await (await fetch(jsonUrl + (jsonUrl.includes('?') ? '&' : '?') + 't=' + Date.now())).json(); if (j && j.latest) r = { latest: String(j.latest), exe: j.exe, apk: j.apk, url: j.page, notes: j.notes }; } catch {} }
  // 2) Versiones publicadas en GitHub
  if (!r) {
    if (!repo) throw new Error('No se pudo leer updates.json.');
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (res.status === 404) throw new Error('Ese repositorio todavía no tiene versiones publicadas.');
    if (!res.ok) throw new Error('GitHub no responde ahora mismo.');
    const j = await res.json();
    const asset = (re) => (j.assets || []).find((a) => re.test(a.name))?.browser_download_url;
    r = { latest: String(j.tag_name || '').replace(/^v/, ''), exe: asset(/\.exe$/i), apk: asset(/\.apk$/i), url: j.html_url };
  }
  r.available = newerV(r.latest, APP_VERSION);
  if (r.available && (manual || LS.get('skipUpdate', '') !== r.latest)) showUpdate(r);
  return r;
}

VIEWS.ajustes = (root) => {
  const draw = () => {
    const st = S.settings || {};
    const ov = st.overlay || { show: {} };
    const al = st.alerts || {};
    const dc = st.discord || {};
    const pc = S.connected;
    root.innerHTML = `<div class="head"><div><h1>Ajustes</h1><p>Personaliza el HUB a tu gusto</p></div></div>
    <div class="grid g2" style="align-items:start">
      <section class="card span2"><h2>Tema</h2>${themeGrid()}</section>
      ${prefsHtml()}
      ${IS_CAP ? `<section class="card"><h2>Conexión con el PC</h2>
        <div class="row" style="gap:10px;margin-bottom:12px"><span class="dot ${pc ? 'on' : ''}"></span><b>${pc ? 'Conectado' : 'Sin conexión'}</b><span class="pill">${S.mode === 'remote' ? 'Desde cualquier lugar' : 'Misma Wi‑Fi'}</span></div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">${S.mode === 'remote' ? `Código: ${esc(LS.get('remoteCode', ''))}` : esc((S.base || '').replace(/^https?:\/\//, ''))}</p>
        <button class="btn primary" id="hubChange">Cambiar conexión</button>
        ${sw('mNotify', LS.get('notify', true) !== false, 'Notificaciones con la app en segundo plano', 'Multas, entregas y avisos importantes')}
        ${sw('mAwake', LS.get('awake', false), 'Mantener la pantalla encendida', 'Mientras la app está abierta')}</section>` : ''}
      ${pc ? `
      <section class="card"><h2>Overlay en el juego</h2>
        ${sw('ovOn', ov.enabled, 'Mostrar overlay', 'Ventana transparente sobre el juego (usa «Pantalla completa sin bordes»)')}
        ${sw('ovSpeed', ov.show?.speed !== false, 'Velocidad, límite y marcha')}
        ${sw('ovJob', ov.show?.job !== false, 'Destino y distancia')}
        ${sw('ovFuel', ov.show?.fuel !== false, 'Combustible')}
        ${sw('ovDamage', !!ov.show?.damage, 'Daños')}
        ${sw('ovClock', ov.show?.clock !== false, 'Hora del juego')}
        ${sw('ovTraffic', ov.show?.traffic !== false, 'Nivel de tráfico')}
        ${sw('ovToasts', ov.show?.toasts !== false, 'Avisos de multas y entregas')}
        ${sw('ovAlerts', ov.show?.alerts !== false, 'Avisos de conducción y tráfico')}
        <div class="setting"><div><b>Opacidad</b></div><input type="range" id="ovOp" min="0.4" max="1" step="0.05" value="${ov.opacity ?? 0.95}" aria-label="Opacidad del overlay"></div>
        <div class="setting"><div><b>Tamaño</b></div><input type="range" id="ovSc" min="0.7" max="1.5" step="0.05" value="${ov.scale ?? 1}" aria-label="Tamaño del overlay"></div>
        <div class="setting"><div><b>Estilo del overlay</b></div>${segs('ovStyle', ov.style || 'hud', [['hud', 'HUD del juego'], ['card', 'Tarjeta'], ['minimal', 'Mínimo']])}</div>
        ${(ov.style || 'hud') === 'hud' ? `<div class="setting"><div><b>Widgets</b><small>Actívalos y colócalos donde quieras</small></div>${IS_CAP ? '' : `<button class="btn" id="ovPlace">${ic('layers')}Colocar widgets</button>`}</div>
        <div class="chips" id="ovWidgets" style="margin:4px 0 8px">${[['speed', 'Velocímetro'], ['lamps', 'Testigos'], ['nav', 'Navegación y mini mapa'], ['messages', 'Mensajes'], ['finance', 'Finanzas'], ['damage', 'Daños'], ['job', 'Trabajo'], ['tacho', 'Tacógrafo'], ['convoy', 'Convoy'], ['fuel', 'Combustible']]
          .map(([k, l]) => `<button class="chip" data-wg="${k}" aria-pressed="${ov.widgets?.[k]?.on !== false && !(k === 'damage' && !ov.widgets?.[k]?.on)}">${l}</button>`).join('')}</div>
        ${sw('ovRotate', ov.mapRotate !== false, 'Mini mapa girando con el camión')}
        ${IS_CAP ? '' : sw('ovF5', ov.f5Zoom !== false, 'F5 cambia el zoom del mini mapa', 'La tecla sigue llegando al juego')}
        ${IS_CAP ? '' : `<div class="setting"><div><b>Pantalla del overlay</b><small>Elige el monitor donde juegas</small></div><select class="input" id="ovDisplay" style="width:auto"><option>…</option></select></div>`}
        ${IS_CAP ? '' : `<div class="setting"><div><b>Overlay para directos</b><small>Añádelo en OBS o Streamlabs como «Fuente de navegador» (1920×1080)</small></div><button class="btn" id="obsCopy">Copiar dirección</button></div>`}
        ${sw('ovPauseMini', ov.pauseMini !== false, 'En pausa, mostrar el overlay minimizado')}` : ''}
        ${IS_CAP ? '' : `<div class="setting"><div><b>Esquina</b><small>Coloca el overlay en una esquina de la pantalla</small></div>${segs('ovCorner', ov.corner || 'br', [['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']])}</div>`}
        <div class="setting"><div><b>Duración de los avisos</b></div>${segs('ovToastSec', ov.toastSeconds || 6, [[4, '4 s'], [6, '6 s'], [10, '10 s'], [15, '15 s']])}</div>
        ${sw('ovRest', ov.show?.rest !== false, 'Tiempo hasta el descanso')}
        ${IS_CAP ? '' : `<div class="setting"><div><b>Posición</b><small><kbd>Ctrl</kbd> + <kbd>Mayús</kbd> + <kbd>L</kbd> para moverlo · <kbd>Ctrl</kbd> + <kbd>Mayús</kbd> + <kbd>O</kbd> para ocultarlo</small></div><button class="btn" id="ovMove">Mover</button></div>`}
      </section>
      <section class="card"><h2>Avisos</h2>
        ${sw('alRest', al.rest !== false, 'Descanso', 'A 1 hora y a 15 minutos de tener que dormir')}
        ${sw('alFuel', al.fuel !== false, 'Combustible bajo', 'Cuando quedan menos de 120 km de autonomía')}
        ${sw('alSpeed', al.speeding !== false, 'Exceso de velocidad', 'Más de 8 km/h por encima del límite durante unos segundos')}
        ${sw('alDamage', al.damage !== false, 'Daños', 'Cuando el camión o la carga reciben un golpe')}
        ${sw('alTraffic', al.traffic !== false, 'Tráfico de TruckersMP', 'Zonas congestionadas delante, en tu destino y rutas populares')}
        ${sw('alRules', al.rules !== false, 'Normas de TruckersMP', 'Luces de noche, marcha atrás, exceso de velocidad, remolque al taller…')}
        ${sw('alSystem', al.system !== false, 'Mensajes del camión', 'Daños, fallos de motor, presión de aire, llegada a destino…')}
        ${sw('alLaliga', al.laliga !== false, 'Bloqueos del fútbol (LaLiga)', 'Avisa cuando TruckersMP cae en España por los bloqueos de hayahora.futbol')}
        ${sw('alTmp', al.tmp !== false, 'Amigos, VTC y eventos', 'Cuando un amigo se conecta, un compañero de la VTC está cerca o empieza un evento')}
      </section>
      <section class="card"><h2>Perfil</h2><div class="stack">
        <div class="field"><label for="setTmp">ID de TruckersMP</label><input class="input" id="setTmp" inputmode="numeric" value="${esc(st.tmpId || '')}"></div>
        <div class="field"><label for="setVtc">ID de la VTC</label><input class="input" id="setVtc" inputmode="numeric" value="${esc(st.vtcId || '')}"></div>
        <div><button class="btn primary" id="saveIds">Guardar</button></div></div></section>
      <section class="card"><h2>Discord</h2><div class="stack">
        <div class="field"><label for="dcHook">Webhook del canal</label><input class="input" id="dcHook" placeholder="https://discord.com/api/webhooks/…" value="${esc(dc.webhook || '')}" autocomplete="off"></div>
        <small class="muted">En Discord: Ajustes del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.</small>
        <div class="row wrap"><button class="btn primary" id="dcSave">Guardar</button><button class="btn" id="dcTest" ${dc.webhook ? '' : 'disabled'}>Enviar prueba</button></div></div>
        ${sw('dcDel', dc.onDelivery !== false, 'Publicar entregas')}
        ${sw('dcCan', dc.onCancel !== false, 'Publicar cancelaciones')}
        ${sw('dcFine', !!dc.onFine, 'Publicar multas')}
        ${IS_CAP ? '' : `${sw('dcRpc', !!dc.rpc, 'Estado en tu perfil de Discord', 'Muestra la ruta que estás haciendo (Rich Presence)')}
        <div class="field" style="margin-top:8px"><label for="dcApp">ID de aplicación de Discord</label><input class="input" id="dcApp" inputmode="numeric" value="${esc(dc.appId || '')}" placeholder="Crea una aplicación en discord.com/developers"></div>
        <small class="muted">El nombre que pongas a la aplicación es el que verán tus amigos (por ejemplo, «Euro Truck Simulator 2»). Sube una imagen llamada <b>logo</b> en Rich Presence → Art Assets.</small>`}
      </section>
      ${IS_CAP ? '' : `
      <section class="card"><h2>Juego y plugin de telemetría</h2><div id="plugBox">${sk(60)}</div></section>
      <section class="card"><h2>Ver en el móvil</h2>
        <p class="muted" style="margin-bottom:14px">Instala la app Android, conéctate a la misma Wi‑Fi y escribe estos datos.</p>
        <div class="grid g2"><div><small class="muted">Dirección del PC</small><div class="bigcode">${esc((S.lan?.ips || [])[0] || '—')}</div>
          ${(S.lan?.ips || []).length > 1 ? `<small class="muted">Si no conecta, prueba: ${S.lan.ips.slice(1).map(esc).join(', ')}</small>` : ''}</div>
          <div><small class="muted">PIN</small><div class="bigcode" id="pinTxt">${esc(st.pin || '')}</div></div></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="pinReset">${ic('refresh')}Cambiar PIN</button></div>
        <p class="muted" style="font-size:13px;margin-top:10px">Si no conecta en la Wi‑Fi (algunos routers aíslan los dispositivos), usa el acceso remoto.</p>
        <div class="remote-box" id="remoteBox"></div></section>
      <section class="card"><h2>Sistema</h2>
        ${sw('autoStart', st.autoStart, 'Iniciar con Windows')}
        ${sw('startMin', st.startMinimized, 'Iniciar en la bandeja', 'Sin abrir la ventana principal')}
        ${sw('demo', st.demo, 'Modo demostración', 'Simula un viaje para probar el HUB y el overlay sin el juego. No se guarda en tu historial.')}
      </section>
      <section class="card"><h2>Datos</h2>
        <p class="muted" style="margin-bottom:14px">Tu historial se guarda en este PC. Puedes descargar una copia, recuperarla o empezar de cero.</p>
        <div class="row wrap"><button class="btn" id="exportData">Exportar copia</button><label class="btn" for="importData" style="cursor:pointer">Importar copia</label>
          <input type="file" id="importData" accept="application/json,.json" class="hidden"><a class="btn" href="/api/jobs.csv" download>Entregas en Excel</a>
          <button class="btn danger" id="resetData">Borrar todo el historial</button></div>
        <div class="row wrap" style="margin-top:10px"><button class="btn ghost" id="viewLog">${ic('note')}Ver registro de errores</button><button class="btn ghost" id="openData">Abrir carpeta de datos</button></div></section>`}` : ''}
      ${!IS_CAP && !pc ? `<section class="card">${notConnectedCard()}</section>` : ''}
      ${IS_CAP ? '' : `<section class="card"><h2>Atajos de teclado</h2><div class="stack" style="gap:0">${SHORTCUT_LIST.map(([k, d]) => `<div class="setting"><span>${d}</span><span>${k.split('+').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</span></div>`).join('')}</div></section>`}
      <section class="card"><h2>Acerca de</h2><p><b>Xito Truck Hub</b> ${esc(S.version || '')} · Xito Development</p>
        ${IS_CAP ? '' : '<button class="btn" id="reWizard" style="margin-top:12px">Repetir el asistente de configuración</button>'}
        <div class="row wrap" style="gap:8px;margin-top:10px"><a class="btn ghost" href="https://github.com/Xito-Development/xito-truck-hub" target="_blank" rel="noopener">Código y licencia (MIT)</a><a class="btn ghost" href="https://github.com/Xito-Development/xito-truck-hub/blob/main/THIRD-PARTY-NOTICES.md" target="_blank" rel="noopener">Avisos de terceros</a></div>
        <p class="muted" style="font-size:13px;margin-top:6px">Telemetría mediante el SDK de SCS y el plugin de RenCloud (MIT). Jugador, VTC, servidores y convoyes desde la API pública de TruckersMP; tráfico desde traffic.krashnz.com y el mapa en vivo de TruckersMP. World of Trucks no ofrece API pública: tus entregas se registran aquí, en local.</p></section>
    </div>`;
    bind();
  };
  const bind = () => {
    bindThemes(root);
    bindPrefs(root);
    if (IS_CAP) $('#hubChange').onclick = () => connectScreen();
    if ($('#mNotify')) $('#mNotify').onchange = (e) => { LS.set('notify', e.target.checked); if (e.target.checked) askNotifyPermission(); };
    if ($('#mAwake')) $('#mAwake').onchange = (e) => { LS.set('awake', e.target.checked); keepAwake(e.target.checked); };
    if ($('#reWizard')) $('#reWizard').onclick = () => wizard();
    if (IS_CAP && $('#hubScan')) $('#hubScan').onclick = async (e) => {
      e.target.disabled = true; toast('Buscando tu PC…', 'Puede tardar unos segundos', 'phone');
      const r = await scanForPc(); e.target.disabled = false;
      if (r) { $('#hubIp').value = r.ip; toast('PC encontrado', `${r.host || ''} ${r.ip}`, 'check', 'good'); } else toast('No se encontró el PC', 'Escribe la dirección a mano.', 'x', 'bad');
    };
    if (IS_CAP && $('#hubSave')) $('#hubSave').onclick = () => {
      let ip = $('#hubIp').value.trim(); if (!ip) return;
      if (!/^https?:\/\//.test(ip)) ip = 'http://' + ip;
      if (!/:\d+$/.test(ip)) ip += ':25580';
      S.base = ip; S.pin = $('#hubPin').value.trim(); LS.set('hubUrl', S.base); LS.set('pin', S.pin); S.wsFails = 0; connectWs(); toast('Conectando…', ip, 'phone');
    };
    if (!S.connected) return;
    const save = (patch) => post('/api/settings', patch).then((s) => (S.settings = s)).catch((e) => toast('No se pudo guardar', e.message, 'x', 'bad'));
    const tog = (id, fn) => { const el = $('#' + id); if (el) el.onchange = (e) => fn(e.target.checked); };
    tog('ovOn', (v) => save({ overlay: { enabled: v } }));
    [['ovSpeed', 'speed'], ['ovJob', 'job'], ['ovFuel', 'fuel'], ['ovDamage', 'damage'], ['ovClock', 'clock'], ['ovToasts', 'toasts'], ['ovTraffic', 'traffic'], ['ovAlerts', 'alerts']]
      .forEach(([id, k]) => tog(id, (v) => save({ overlay: { show: { [k]: v } } })));
    [['alRest', 'rest'], ['alFuel', 'fuel'], ['alSpeed', 'speeding'], ['alDamage', 'damage'], ['alTraffic', 'traffic'], ['alRules', 'rules'], ['alSystem', 'system'], ['alTmp', 'tmp'], ['alLaliga', 'laliga']]
      .forEach(([id, k]) => tog(id, (v) => save({ alerts: { [k]: v } })));
    [['dcDel', 'onDelivery'], ['dcCan', 'onCancel'], ['dcFine', 'onFine'], ['dcRpc', 'rpc']].forEach(([id, k]) => tog(id, (v) => save({ discord: { [k]: v } })));
    $('#ovOp').onchange = (e) => save({ overlay: { opacity: +e.target.value } });
    const ovSeg = (id, key, conv = (v) => v) => { const el = $('#' + id); if (el) el.onclick = (e) => { const c = e.target.closest('[data-v]'); if (!c) return; $$('#' + id + ' .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); save({ overlay: { [key]: conv(c.dataset.v) } }); }; };
    ovSeg('ovCorner', 'corner'); ovSeg('ovToastSec', 'toastSeconds', Number);
    if ($('#ovStyle')) $('#ovStyle').onclick = async (e) => { const c = e.target.closest('[data-v]'); if (!c) return; await save({ overlay: { style: c.dataset.v } }); draw(); };
    if ($('#ovPlace')) $('#ovPlace').onclick = () => post('/api/overlay', { action: 'edit' });
    if ($('#ovWidgets')) $('#ovWidgets').onclick = (e) => { const c = e.target.closest('[data-wg]'); if (!c) return; const v = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', v); save({ overlay: { widgets: { [c.dataset.wg]: { on: v } } } }); };
    tog('ovRotate', (v) => save({ overlay: { mapRotate: v } }));
    tog('ovF5', (v) => save({ overlay: { f5Zoom: v } }));
    if ($('#ovDisplay')) api('/api/displays').then((list) => {
      const sel = $('#ovDisplay'); if (!sel) return;
      if (!list.length) { sel.closest('.setting').remove(); return; }
      sel.innerHTML = list.map((d) => `<option value="${d.id}" ${d.current ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
      sel.onchange = () => post('/api/displays', { id: sel.value }).then(() => toast('Overlay movido', sel.selectedOptions[0].textContent, 'check', 'good'));
    }).catch(() => {});
    if ($('#obsCopy')) $('#obsCopy').onclick = () => navigator.clipboard?.writeText('http://localhost:25580/overlay.html?obs=1').then(() => toast('Dirección copiada', 'http://localhost:25580/overlay.html?obs=1', 'check', 'good')); tog('ovPauseMini', (v) => save({ overlay: { pauseMini: v } }));
    tog('ovRest', (v) => save({ overlay: { show: { rest: v } } }));
    $('#ovSc').onchange = (e) => save({ overlay: { scale: +e.target.value } });
    if ($('#ovMove')) $('#ovMove').onclick = () => post('/api/overlay', { action: 'edit' });
    $('#saveIds').onclick = async () => {
      const tmpId = $('#setTmp').value.trim() || null, vtcId = $('#setVtc').value.trim() || null;
      const s = await save({ tmpId, vtcId }); if (!s) return;
      LS.set('tmpId', s.tmpId); LS.set('vtcId', s.vtcId); toast('Perfil guardado', '', 'check', 'good');
    };
    $('#dcSave').onclick = async () => {
      const hook = $('#dcHook').value.trim();
      const patch = { discord: { webhook: hook } };
      if ($('#dcApp')) patch.discord.appId = $('#dcApp').value.replace(/\D/g, '');
      const s = await save(patch); if (!s) return;
      if (hook && !s.discord.webhook) return toast('Webhook no válido', 'Copia la URL completa desde Discord.', 'x', 'bad');
      $('#dcTest').disabled = !s.discord.webhook; toast('Discord guardado', '', 'check', 'good');
    };
    $('#dcTest').onclick = async () => {
      try { await post('/api/discord/test'); toast('Mensaje enviado', 'Revisa el canal de Discord.', 'check', 'good'); }
      catch (e) { toast('Discord no aceptó el mensaje', e.message, 'x', 'bad'); }
    };
    if (IS_CAP) return;
    const renderPlug = async () => { const box = $('#plugBox'); if (!box) return; const h = await pluginHtml(); if ($('#plugBox')) $('#plugBox').innerHTML = h; };
    bindPlugin($('#plugBox'), renderPlug); renderPlug();
    const renderRemote = async (r) => {
      const box = $('#remoteBox'); if (!box) return;
      try { r = r || await api('/api/remote'); } catch { return; }
      box.innerHTML = `<div class="setting" style="border:0;padding-top:16px"><div><b>Acceso remoto desde cualquier lugar</b><small>Cifrado de extremo a extremo · funciona con datos móviles · gratis</small></div><label class="switch"><input type="checkbox" id="rmOn" ${r.enabled ? 'checked' : ''}><span></span></label></div>
        ${r.enabled ? `<div class="row wrap between" style="gap:12px"><div><small class="muted">Código de vinculación</small><div class="bigcode code-show">${esc(r.code)}</div>
          <small class="muted"><span class="dot ${r.state === 'online' ? 'on' : 'wait'}" style="display:inline-block;margin-right:6px"></span>${r.state === 'online' ? (r.clientsActive ? 'Móvil conectado ahora' : 'Listo, esperando al móvil') : `Conectando al servicio…${r.error ? ' · ' + esc(r.error) : ''}`}</small></div>
          <button class="btn" id="rmNew">${ic('refresh')}Nuevo código</button></div>` : ''}`;
      $('#rmOn').onchange = async (e) => renderRemote(await post('/api/remote', { enabled: e.target.checked }));
      if ($('#rmNew')) $('#rmNew').onclick = async () => { if (await askConfirm({ title: 'Nuevo código', text: 'El móvil tendrá que volver a vincularse con el código nuevo.', ok: 'Cambiar' })) renderRemote(await post('/api/remote', { regenerate: true })); };
    };
    renderRemote();
    // El estado cambia en segundos: se refresca solo mientras estás en Ajustes
    const rmTimer = setInterval(async () => {
      if (!$('#remoteBox')) return clearInterval(rmTimer);
      try { const r = await api('/api/remote'); if (r.enabled) { const st = $('#remoteBox small.muted:last-of-type'); renderRemote(r); } } catch {}
    }, 3000);
    $('#pinReset').onclick = async () => {
      if (!(await askConfirm({ title: 'Cambiar PIN', text: 'Los móviles conectados tendrán que escribir el PIN nuevo.', ok: 'Cambiar' }))) return;
      const r = await post('/api/pin/reset'); $('#pinTxt').textContent = r.pin; S.settings.pin = r.pin;
    };
    tog('autoStart', (v) => save({ autoStart: v })); tog('startMin', (v) => save({ startMinimized: v })); tog('demo', (v) => save({ demo: v }));
    $('#exportData').onclick = async () => {
      const d = await api('/api/data/export');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })), download: `xito-truckhub-${new Date().toLocaleDateString('sv')}.json` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $('#viewLog').onclick = async () => {
      const sh = openSheet(`<h2 style="font-size:22px;margin-bottom:10px">Registro</h2><pre class="logbox" id="logBox">…</pre><button class="btn" id="copyLog" style="margin-top:10px">Copiar</button>`);
      try { const r = await api('/api/log'); $('#logBox', sh).textContent = r.lines.slice().reverse().join('\n') || 'Sin errores registrados.'; } catch (e) { $('#logBox', sh).textContent = e.message; }
      $('#copyLog', sh).onclick = () => navigator.clipboard?.writeText($('#logBox', sh).textContent).then(() => toast('Registro copiado', 'Pégalo en el chat para revisarlo.', 'check', 'good'));
    };
    $('#openData').onclick = () => post('/api/open-data').catch(() => {});
    $('#importData').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const r = await post('/api/data/import', data);
        toast('Copia importada', `${r.added} entregas añadidas`, 'check', 'good');
      } catch (err) { toast('No se pudo importar', err.message.includes('JSON') ? 'El archivo no es válido.' : err.message, 'x', 'bad'); }
      e.target.value = '';
    };
    $('#resetData').onclick = async () => {
      if (!(await askConfirm({ title: 'Borrar todo el historial', text: 'Se eliminarán entregas, eventos, estadísticas y logros. No se puede deshacer.', ok: 'Borrar todo', danger: true, typeWord: 'BORRAR' }))) return;
      await post('/api/data/reset', { confirm: 'BORRAR' }); toast('Historial borrado', '', 'check', 'good');
    };
  };
  draw();
  const offs = [on('state', draw), on('conn', () => { if (!S.connected) draw(); })];
  return () => offs.forEach((f) => f());
};

// ---------- asistente de configuración (propio, a pantalla completa) ----------
function wizard() {
  if ($('.wz')) return;
  const el = document.createElement('div'); el.className = 'wz';
  const STEPS = [
    { id: 'lang', name: 'Idioma' }, { id: 'hello', name: 'Bienvenida' }, { id: 'game', name: 'Juego' }, { id: 'tmp', name: 'TruckersMP' },
    { id: 'style', name: 'Estilo' }, { id: 'phone', name: 'Móvil' }, { id: 'overlay', name: 'Overlay' }, { id: 'done', name: 'Listo' }
  ];
  let step = 0;
  el.innerHTML = `<div class="wz-bg"><i></i><i></i><i></i><i></i><i></i></div>
    <aside class="wz-side"><div class="brand"><span class="brand-mark">${ic('truck')}</span><span class="brand-name">Xito Truck Hub<small>Configuración</small></span></div>
      <ol class="wz-steps" id="wzSteps"></ol><p class="wz-ver">Versión ${APP_VERSION}</p></aside>
    <main class="wz-main"><div class="wz-card" id="wzCard"></div>
      <footer class="wz-foot"><button class="btn ghost" id="wzSkip">Configurar más tarde</button><span class="grow"></span><button class="btn" id="wzBack">Atrás</button><button class="btn primary wz-next" id="wzNext">Siguiente</button></footer></main>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const state = { tmpId: S.settings?.tmpId || '', vtcId: S.settings?.vtcId || '', remote: !!S.settings?.remote?.enabled, style: S.settings?.overlay?.style || 'hud' };
  const LANG_FLAGS = { es: 'ES', en: 'EN', pt: 'PT', fr: 'FR', de: 'DE', it: 'IT' };
  const views = {
    lang: () => `<h1>Elige tu idioma</h1><p class="lead">Podrás cambiarlo cuando quieras en Ajustes.</p>
      <div class="wz-grid">${Object.entries(I18N.LANGS).map(([k, v]) => `<button class="wz-opt ${I18N.lang === k ? 'on' : ''}" data-lang="${k}"><b class="wz-flag">${LANG_FLAGS[k]}</b><span>${v}</span></button>`).join('')}</div>`,
    hello: () => `<h1>Bienvenido a Xito Truck Hub</h1><p class="lead">Tu centro de mando para Euro Truck Simulator 2, American Truck Simulator y TruckersMP. En un minuto lo tienes listo.</p>
      <div class="wz-feats">${[['cabina', 'Cabina en directo', 'Velocidad, trabajo, daños y mandos al instante'], ['mapa', 'Mapa y tráfico', 'Jugadores, zonas congestionadas y la ruta más concurrida'], ['stats', 'Estadísticas', 'Historial, logros, objetivos y récords'], ['phone', 'En tu móvil', 'Desde la Wi‑Fi o desde cualquier lugar, cifrado']]
        .map(([i, t, d], n) => `<div class="wz-feat" style="animation-delay:${n * 80}ms"><span class="ico">${ic(i)}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div>`,
    game: () => `<h1>Conecta el juego</h1><p class="lead">El HUB lee tu camión con el plugin oficial de telemetría. Al abrir el juego por primera vez, acepta el aviso de «SDK avanzado».</p><div id="wzPlug" class="wz-box">${sk(60)}</div>`,
    tmp: () => `<h1>Tu perfil de TruckersMP</h1><p class="lead">Para ver tu perfil, tus amigos en el mapa y los convoyes.</p>
      <div class="wz-box"><div class="field"><label for="wzTmp">ID de TruckersMP</label><div class="row wrap"><input class="input" id="wzTmp" inputmode="numeric" placeholder="Ej.: 5644561" value="${esc(state.tmpId)}" style="flex:1;min-width:160px"><button class="btn" id="wzDetect">${ic('search')}Detectar desde Steam</button></div></div>
      <p class="muted" id="wzTmpMsg" style="font-size:13px;margin-top:8px"></p>
      <div class="field" style="margin-top:14px"><label for="wzVtc">ID de tu VTC</label><input class="input" id="wzVtc" inputmode="numeric" value="${esc(state.vtcId)}"></div></div>`,
    style: () => `<h1>Elige tu estilo</h1><p class="lead">Tema y color de acento. Todo se puede ajustar después.</p>${themeGrid()}
      <div class="row wrap" style="gap:8px;margin-top:18px" id="wzAcc">${ACCENTS.map((c) => `<button class="swatch ${appearance().accent === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Acento ${c}"></button>`).join('')}<button class="btn ghost" data-c="">Del tema</button></div>`,
    phone: () => `<h1>Tus datos en el móvil</h1><p class="lead">Instala la app de Android. Puedes conectarla en la misma Wi‑Fi con la dirección y el PIN, o desde cualquier lugar con un código cifrado.</p>
      <div class="wz-grid two"><div class="wz-box"><b>Misma Wi‑Fi</b><div class="bigcode" style="margin-top:8px">${esc((S.lan?.ips || [])[0] || '—')}</div><small class="muted">PIN: <b>${esc(S.settings?.pin || '')}</b></small></div>
      <div class="wz-box"><div class="row between"><b>Desde cualquier lugar</b><label class="switch"><input type="checkbox" id="wzRemote" ${state.remote ? 'checked' : ''}><span></span></label></div><div class="bigcode code-show" id="wzCode" style="margin-top:8px">${esc(S.settings?.remote?.enabled ? S.settings.remote.code : '— — —')}</div><small class="muted">Funciona con datos móviles, sin abrir puertos.</small></div></div>`,
    overlay: () => `<h1>Overlay dentro del juego</h1><p class="lead">Widgets al estilo del propio juego: velocímetro, testigos, mini mapa con la ruta, mensajes del camión y finanzas. Pon el juego en «Pantalla completa sin bordes».</p>
      <div class="wz-grid">${[['hud', 'HUD del juego', 'Widgets en las esquinas'], ['card', 'Tarjeta', 'Todo en un panel'], ['minimal', 'Mínimo', 'Solo velocidad y límite']].map(([k, t, d]) => `<button class="wz-opt ${state.style === k ? 'on' : ''}" data-ov="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>
      <div class="wz-keys">${SHORTCUT_LIST.slice(0, 6).map(([k, d]) => `<div><span>${d}</span><span>${k.split('+').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</span></div>`).join('')}</div>`,
    done: () => `<div class="wz-done"><span class="wz-check">${ic('check')}</span><h1>¡Todo listo!</h1><p class="lead">Abre el juego y conduce: el HUB registrará cada kilómetro.</p>
      ${S.game?.running ? '' : `<button class="btn primary play-btn" data-launch="tmp">${ic('play')}Jugar a TruckersMP</button>`}</div>`
  };
  const render = () => {
    const st = STEPS[step];
    $('#wzSteps').innerHTML = STEPS.map((x, i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}"><i>${i < step ? ic('check') : i + 1}</i><span>${x.name}</span></li>`).join('');
    const card = $('#wzCard'); card.classList.remove('in'); void card.offsetWidth;
    card.innerHTML = views[st.id](); card.classList.add('in');
    $('#wzBack').style.visibility = step ? 'visible' : 'hidden';
    $('#wzNext').textContent = st.id === 'done' ? 'Empezar' : 'Siguiente';
    $('#wzSkip').style.visibility = st.id === 'done' ? 'hidden' : 'visible';
    bindStep(st.id);
    if (I18N.lang !== 'es') I18N.set(I18N.lang);
  };
  const bindStep = (id) => {
    if (id === 'lang') $$('[data-lang]', el).forEach((b) => (b.onclick = () => { setPref('language', b.dataset.lang); LS.set('language', b.dataset.lang); I18N.set(b.dataset.lang); $$('[data-lang]', el).forEach((x) => x.classList.toggle('on', x === b)); }));
    if (id === 'game') { const rp = async () => { const h = await pluginHtml(); if ($('#wzPlug')) $('#wzPlug').innerHTML = h; }; bindPlugin($('#wzPlug'), rp); rp(); }
    if (id === 'tmp') $('#wzDetect').onclick = async () => {
      $('#wzTmpMsg').textContent = 'Buscando…';
      try { const p = await api('/api/tmp/detect'); $('#wzTmp').value = p.id; $('#wzTmpMsg').textContent = `Encontrado: ${p.name}${p.vtc?.inVTC ? ' · ' + p.vtc.name : ''}`; if (p.vtc?.inVTC) $('#wzVtc').value = p.vtc.id; }
      catch { $('#wzTmpMsg').textContent = 'No se pudo detectar. Escríbelo a mano.'; }
    };
    if (id === 'style') { bindThemes(el); $('#wzAcc').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; $$('#wzAcc .swatch').forEach((x) => x.classList.toggle('on', x === b)); setPref('appearance', { accent: b.dataset.c }); }; }
    if (id === 'phone') $('#wzRemote').onchange = async (e) => { try { const r = await post('/api/remote', { enabled: e.target.checked }); state.remote = r.enabled; $('#wzCode').textContent = r.enabled ? r.code : '— — —'; } catch {} };
    if (id === 'overlay') $$('[data-ov]', el).forEach((b) => (b.onclick = () => { state.style = b.dataset.ov; $$('[data-ov]', el).forEach((x) => x.classList.toggle('on', x === b)); post('/api/settings', { overlay: { style: state.style } }).catch(() => {}); }));
  };
  const close = async (done) => {
    if (done) await post('/api/settings', { wizardDone: true }).then((s) => (S.settings = s)).catch(() => {});
    el.classList.remove('show'); setTimeout(() => el.remove(), 450); document.removeEventListener('keydown', key); go(S.route, false);
  };
  const next = async () => {
    const id = STEPS[step].id;
    if (id === 'tmp') { state.tmpId = $('#wzTmp').value.trim(); state.vtcId = $('#wzVtc').value.trim(); await post('/api/settings', { tmpId: state.tmpId || null, vtcId: state.vtcId || null }).then((s) => (S.settings = s)).catch(() => {}); }
    if (id === 'done') return close(true);
    step++; render();
  };
  const key = (e) => { if (e.key === 'Enter' && !e.target.closest('input')) next(); if (e.key === 'Escape') close(false); };
  document.addEventListener('keydown', key);
  $('#wzNext').onclick = next;
  $('#wzBack').onclick = () => { if (step) { step--; render(); } };
  $('#wzSkip').onclick = () => close(true);
  render();
}
const SHORTCUT_LIST = [
  ['Ctrl+Mayús+O', 'Mostrar u ocultar el overlay'], ['Ctrl+Mayús+L', 'Colocar los widgets'], ['Ctrl+Mayús+M', 'Mostrar u ocultar el mini mapa'],
  ['Ctrl+Mayús+Z', 'Zoom del mini mapa'], ['Ctrl+Mayús+Y', 'Cambiar estilo del overlay'], ['Ctrl+Mayús+U', 'Cambiar tamaño del overlay'],
  ['Ctrl+Mayús+K', 'Borrar mensajes'], ['Ctrl+Mayús+H', 'Mostrar u ocultar el HUB']
];

// ---------- búsqueda automática del PC en la Wi‑Fi (Android) ----------
async function scanForPc(progress) {
  const Http = window.Capacitor?.Plugins?.CapacitorHttp;
  const ping = async (ip) => {
    const url = `http://${ip}:25580/api/ping`;
    try {
      if (Http) { const r = await Http.request({ url, method: 'GET', connectTimeout: 700, readTimeout: 700 }); const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; return d && d.app === 'xito-truck-hub' ? { ip, ...d } : null; }
      const r = await Promise.race([fetch(url), new Promise((_, j) => setTimeout(j, 800))]); const d = await r.json(); return d.app === 'xito-truck-hub' ? { ip, ...d } : null;
    } catch { return null; }
  };
  const saved = (LS.get('hubUrl', '') || '').match(/\/\/(\d+\.\d+\.\d+)\./);
  const nets = [...new Set([saved && saved[1], '192.168.1', '192.168.0', '192.168.8', '192.168.18', '192.168.10', '192.168.100', '10.0.0', '192.168.2', '192.168.3', '192.168.31', '192.168.68', '192.168.86', '192.168.178', '192.168.4', '192.168.5'].filter(Boolean))];
  const ips = nets.flatMap((n) => Array.from({ length: 254 }, (_, i) => `${n}.${i + 1}`));
  let found = null, done = 0;
  const worker = async () => { while (!found && ips.length) { const ip = ips.shift(); const r = await ping(ip); done++; if (r && !found) found = r; if (done % 40 === 0) progress?.(done, done + ips.length); } };
  await Promise.all(Array.from({ length: 48 }, worker));
  return found;
}

// ---------- pantalla de conexión (Android) ----------
function connectScreen() {
  if ($('.modal-back.connect')) return;
  const back = document.createElement('div'); back.className = 'modal-back connect';
  back.innerHTML = `<div class="modal"><span class="brand-mark" style="width:52px;height:52px;border-radius:16px;margin-bottom:18px">${ic('truck')}</span>
    <h2>Conecta con tu PC</h2><p class="lead">Elige cómo quieres ver tus datos. Ambos modos funcionan a la vez en el PC.</p>
    <div class="seg" id="cMode"><button data-m="remote" aria-pressed="${S.mode === 'remote'}">${ic('eventos')}Desde cualquier lugar</button><button data-m="lan" aria-pressed="${S.mode !== 'remote'}">${ic('phone')}Misma Wi‑Fi</button></div>
    <div id="cRemote" class="stack" style="margin-top:14px">
      <p class="muted" style="font-size:14px">En el PC: Ajustes → Ver en el móvil → activa «Acceso remoto» y escribe aquí el código. Funciona con datos móviles, sin abrir puertos.</p>
      <div class="field"><label for="cCode">Código de vinculación</label><input class="input code-in" id="cCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" value="${esc(LS.get('remoteCode', ''))}"></div>
    </div>
    <div id="cLan" class="stack hidden" style="margin-top:14px">
      <div class="field"><label for="cIp">Dirección del PC</label><input class="input" id="cIp" placeholder="192.168.1.50" inputmode="decimal"></div>
      <div class="field"><label for="cPin">PIN</label><input class="input" id="cPin" placeholder="6 cifras" inputmode="numeric" maxlength="6"></div>
      <button class="btn" id="cScan">${ic('search')}Buscar mi PC automáticamente</button>
    </div>
    <p class="muted" id="cMsg" style="font-size:13px;margin-top:10px"></p>
    <div class="stack" style="margin-top:6px"><button class="btn primary" id="cGo">Conectar</button><button class="btn ghost" id="cSkip">Usar solo TruckersMP por ahora</button></div></div>`;
  document.body.appendChild(back);
  let mode = S.mode === 'remote' ? 'remote' : 'lan';
  const setMode = (m) => { mode = m; $$('#cMode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m)); $('#cRemote').classList.toggle('hidden', m !== 'remote'); $('#cLan').classList.toggle('hidden', m !== 'lan'); $('#cMsg').textContent = ''; };
  setMode(mode);
  $('#cMode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#cCode').oninput = (e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); e.target.value = v.replace(/(.{4})(?=.)/g, '$1-'); };
  $('#cGo').onclick = async () => {
    const msg = $('#cMsg'), btn = $('#cGo'); btn.disabled = true;
    try {
      if (mode === 'remote') {
        const code = $('#cCode').value.trim(); if (code.replace(/-/g, '').length < 12) throw new Error('El código tiene 12 caracteres.');
        msg.textContent = 'Conectando de forma cifrada…';
        S.mode = 'remote'; LS.set('mode', 'remote'); LS.set('remoteCode', code);
        await Remote.connect(code);
        const st = await new Promise((ok, ko) => { const t0 = Date.now(); const iv = setInterval(async () => { try { const r = await api('/api/state', { timeout: 6000 }); clearInterval(iv); ok(r); } catch (e) { if (Date.now() - t0 > 30000) { clearInterval(iv); ko(new Error('El PC no contesta. ¿Está abierto con el acceso remoto activado?')); } } }, 2500); });
        S.settings = st.settings; S.lan = st.lan; S.connected = true; emit('conn');
      } else {
        let ip = $('#cIp').value.trim(); if (!ip) throw new Error('Escribe la dirección del PC.');
        if (!/^https?:\/\//.test(ip)) ip = 'http://' + ip;
        if (!/:\d+$/.test(ip)) ip += ':25580';
        S.mode = 'lan'; LS.set('mode', 'lan'); Remote.disconnect();
        S.base = ip; S.pin = $('#cPin').value.trim();
        msg.textContent = 'Conectando…';
        const st = await api('/api/state', { timeout: 6000 });
        LS.set('hubUrl', S.base); LS.set('pin', S.pin); S.settings = st.settings; S.lan = st.lan;
        connectWs();
      }
      back.remove(); go('cabina');
    } catch (e) { msg.textContent = e.message === 'PIN incorrecto' ? 'El PIN no coincide.' : e.message.includes('responde') && mode === 'lan' ? 'No se encuentra el PC. Prueba el modo «Desde cualquier lugar».' : e.message; }
    btn.disabled = false;
  };
  $('#cSkip').onclick = () => { back.remove(); go('tmp'); };
  $('#cScan').onclick = async () => {
    const b = $('#cScan'); b.disabled = true;
    $('#cMsg').textContent = 'Buscando en tu Wi‑Fi…';
    const r = await scanForPc((d, t) => { $('#cMsg').textContent = `Buscando en tu Wi‑Fi… ${Math.round((d / t) * 100)} %`; });
    b.disabled = false;
    if (r) { $('#cIp').value = r.ip; $('#cMsg').textContent = `Encontrado: ${r.host || 'tu PC'} (${r.ip}). Escribe el PIN y pulsa Conectar.`; $('#cPin').focus(); }
    else $('#cMsg').textContent = 'No lo encontré (algunos routers aíslan los dispositivos). Usa «Desde cualquier lugar».';
  };
}

// ---------- arranque ----------
function initWindowBar() {
  if (!IS_ELECTRON) return;
  const root = document.documentElement; root.classList.add('electron');
  $('#wbar').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) window.hubNative.win(b.dataset.w); };
  $('#wbar .wbar-drag').ondblclick = () => window.hubNative.win('max');
  const set = (st) => { root.classList.toggle('maximized', !!st.maximized); if ('focused' in st) root.classList.toggle('blurred', !st.focused); };
  window.hubNative.onWinState?.(set);
  window.hubNative.winState?.().then(set).catch(() => {});
}
async function init() {
  initWindowBar();
  document.documentElement.dataset.theme = LS.get('theme', 'autopista');
  applyTheme();
  buildNav();
  const route = location.hash ? location.hash.slice(1) : null;
  if (IS_CAP && !S.base && !(S.mode === 'remote' && LS.get('remoteCode', ''))) { go('cabina'); connectScreen(); return; }
  try {
    const st = await api('/api/state', { timeout: 6000 });
    S.settings = st.settings; S.status = st.status; S.live = st.live; S.lan = st.lan; S.cur = st.current; S.version = st.version; S.traffic = st.traffic; S.game = st.game; S.convoy = st.convoy; S.tacho = st.tacho; S.laliga = st.laliga; renderLaliga();
    S.connected = true; applyTheme();
  } catch {}
  connectHub();
  go(route || appearance().startPage || 'cabina');
  checkVersion();
  window.addEventListener('hashchange', () => { const r = location.hash.slice(1); if (r && r !== S.route) go(r, false); });
  updateConn();
  if (!IS_CAP && S.settings && !S.settings.wizardDone) wizard();
  // Android: botón atrás y vuelta de segundo plano
  if (IS_CAP) setTimeout(askNotifyPermission, 3000);
  if (IS_CAP && LS.get('awake', false)) keepAwake(true);
  const CapApp = window.Capacitor?.Plugins?.App;
  if (CapApp) {
    CapApp.addListener('backButton', () => {
      if (S.closeDash) return S.closeDash();
      if ($('.sheet.show')) return closeSheet();
      if ($('.modal-back [data-no]')) return $('.modal-back [data-no]').click();
      if (S.route !== 'cabina') return go('cabina');
      (CapApp.minimizeApp || CapApp.exitApp).call(CapApp);
    });
    CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive && !S.connected) { S.wsFails = 0; connectHub(); } if (isActive && Date.now() - (S.lastUpdCheck || 0) > 3600e3) { S.lastUpdCheck = Date.now(); checkUpdate(false).catch(() => {}); } });
  }
  on('conn', async () => {
    if (S.connected) {
      try { const st = await api('/api/state'); S.lan = st.lan; S.settings = st.settings; S.version = st.version; emit('state'); } catch {}
      if (S.live?.job?.onJob && !S.navRoute) api('/api/route', { timeout: 60000 }).then((r) => { S.navRoute = r; emit('route'); }).catch(() => {});
    }
  });
}
window.addEventListener('DOMContentLoaded', init);
