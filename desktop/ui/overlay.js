/* Xito Truck Hub — overlay a pantalla completa con widgets */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const OFF = { Crash: 'Colisión', Avoid_sleeping: 'No descansar', Wrong_way: 'Sentido contrario', Speeding_camera: 'Radar', No_lights: 'Sin luces', Red_signal: 'Semáforo en rojo', Avoid_weighting: 'Evitar báscula', Speeding: 'Exceso de velocidad', Illegal_trailer: 'Remolque ilegal', Avoid_Inspection: 'Evitar inspección', Illegal_Border_Crossing: 'Frontera ilegal', Hard_Shoulder_Violation: 'Arcén', Damaged_Vehicle_Usage: 'Vehículo dañado', Generic: 'Infracción' };
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const clock = (m) => `${DAYS[Math.floor(m / 1440) % 7]} ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
function dur(s) { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }

let onTmp = false, routeErr = null, tmpTime = null, near = [], nearT = 0, latch = {}, fin = null, tacho = null, convoy = null, cur = null, live = null, status = null, settings = null, traffic = null, route = null, ses = null, gameSt = null, passed = new Set(), editing = false;
const O = () => settings?.overlay || {};
const mph = () => settings?.units?.speed === 'mph';
const spd = (k) => (mph() ? k * 0.621371 : k);
const dist = (km) => (mph() ? `${nf1.format(km * 0.621371)} mi` : `${nf1.format(km)} km`);
const money = (v) => `${v < 0 ? '−' : ''}${nf.format(Math.abs(v || 0))} ${String(live?.game).toLowerCase() === 'ats' ? '$' : '€'}`;

const DEFAULTS = {
  speed: { on: true, x: 1.5, y: 66 }, lamps: { on: true, x: 1.5, y: 93 }, nav: { on: true, x: 79, y: 64 },
  messages: { on: true, x: 79, y: 44 }, finance: { on: true, x: 79, y: 36 }, damage: { on: false, x: 13, y: 80 }, job: { on: true, x: 38, y: 2 },
  tacho: { on: true, x: 15, y: 86 }, convoy: { on: true, x: 1.5, y: 30 }, fuel: { on: true, x: 15, y: 77 }
};
const LABELS = { fuel: 'Combustible', tacho: 'Tacógrafo', convoy: 'Convoy', speed: 'Velocímetro', lamps: 'Testigos', nav: 'Navegación', messages: 'Mensajes', finance: 'Finanzas', damage: 'Daños', job: 'Trabajo', card: 'Tarjeta' };

// ---------- iconos de los testigos ----------
const IC = {
  left: '<path d="M10 5l-7 7 7 7v-4h9V9h-9z"/>', right: '<path d="M14 5l7 7-7 7v-4H5V9h9z"/>',
  low: '<path d="M4 9c3-2 6-2 9 0v6c-3 2-6 2-9 0z"/><path d="M15 8l5-1M15 12h5M15 16l5 1"/>', high: '<path d="M4 9c3-2 6-2 9 0v6c-3 2-6 2-9 0z"/><path d="M15 7h6M15 12h6M15 17h6"/>',
  beacon: '<path d="M6 18h12"/><path d="M8 18v-5a4 4 0 0 1 8 0v5"/><path d="M12 3v2M4.5 6l1.5 1.5M19.5 6L18 7.5"/>', park: '<circle cx="12" cy="12" r="8"/><path d="M10 16V8h2.5a2.5 2.5 0 0 1 0 5H10"/>',
  engine: '<path d="M4 10h3l2-3h5l2 3h3v7h-3l-2 2H9l-2-2H4z"/>', cruise: '<circle cx="12" cy="12" r="8"/><path d="M12 12l3-3M8 16h8"/>',
  battery: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V5M17 7V5M7 13h3M15 11v4M13 13h4"/>', oil: '<path d="M3 14h9l4-3h5l-2 6H6z"/><path d="M19 8c0 1.5-1 2-1 3"/>',
  air: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>', fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  hazard: '<path d="M12 3l9 16H3z"/><path d="M12 9l4 7H8z"/>'
};
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const LAMPS = [['left', 'left', 'g blink'], ['low', 'low', 'g'], ['high', 'high', 'b'], ['beacon', 'beacon', 'a'], ['hazard', 'hazard', 'r blink'], ['park', 'park', 'r'], ['engine', 'engine', 'a'], ['cruise', 'cruise', 'b'], ['battery', 'battery', 'r'], ['oil', 'oil', 'r'], ['air', 'air', 'r'], ['fuel', 'fuel', 'a'], ['right', 'right', 'g blink']];

// ---------- construcción de widgets ----------
function build() {
  const hud = $('#hud');
  const style = O().style || 'hud';
  const W = { ...DEFAULTS, ...(O().widgets || {}) };
  for (const k of Object.keys(DEFAULTS)) W[k] = { ...DEFAULTS[k], ...(O().widgets?.[k] || {}) };
  const TICK = (max) => {
    let s = '';
    for (let v = 0; v <= max; v += max > 100 ? 20 : 10) {
      const a = (-225 + (v / max) * 270) * Math.PI / 180, r1 = 88, r2 = v % (max > 100 ? 40 : 20) === 0 ? 76 : 81;
      s += `<line class="tick" x1="${105 + r1 * Math.cos(a)}" y1="${105 + r1 * Math.sin(a)}" x2="${105 + r2 * Math.cos(a)}" y2="${105 + r2 * Math.sin(a)}" stroke-width="2"/>`;
      if (v % (max > 100 ? 40 : 20) === 0) s += `<text class="tlab" x="${105 + 66 * Math.cos(a)}" y="${109 + 66 * Math.sin(a)}" text-anchor="middle">${v}</text>`;
    }
    return s;
  };
  const max = mph() ? 90 : 140;
  const html = {
    speed: `<div class="dial" id="dial"><svg viewBox="0 0 210 210"><circle cx="105" cy="105" r="100" fill="rgba(10,15,24,${(O().opacity ?? 0.95) * 0.78})" stroke="rgba(255,255,255,.08)"/>
        <path class="arc-bg" d="${arcPath(0, 1)}" fill="none" stroke-width="7" stroke-linecap="round"/><path class="arc" id="arc" d="${arcPath(0, 1)}" fill="none" stroke-width="7" stroke-linecap="round" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000"/>
        ${TICK(max)}<line class="limmark" id="limMark" x1="0" y1="0" x2="0" y2="0"/></svg>
        <div class="dial-c"><span class="v" id="spd">0</span><span class="u">${mph() ? 'mph' : 'km/h'}</span><span class="g" id="gear">N</span><span class="cc" id="cc"></span></div>
        <div class="lim none" id="lim">–</div><div class="rpm"><i id="rpm"></i></div></div>`,
    lamps: `<div class="glass w-lamps">${LAMPS.map(([id, ic, cls]) => `<span class="lampi ${cls}" id="L-${id}">${svg(IC[ic])}</span>`).join('')}</div>`,
    nav: `<div class="glass w-nav"><div class="nav-top"><div><b id="navDest">Conducción libre</b><small id="navSub">${''}</small></div><div class="d" id="navDist"></div></div>
        <div class="minimap"><canvas id="mm"></canvas></div><div class="nav-bot"><span id="navVia"></span><span id="navTraf"></span><span id="navClock"></span></div></div>`,
    messages: `<div class="w-messages" id="msgs"></div>`,
    finance: `<div class="glass w-finance"><div class="fin"><small>Sesión</small><b id="fSes">0</b></div><div class="fin"><small>Trabajo</small><b id="fJob">—</b></div><div class="fin"><small>Multas</small><b id="fFin">0</b></div>
      <div class="fin-flow"><small>Últimos 7 días <b id="fWeek"></b></small><div class="spark" id="fSpark"></div></div></div>`,
    fuel: `<div class="glass w-fuel"><div class="w-title"><span>Combustible</span><span id="fuTxt"></span></div><div class="bar"><i id="fuBar"></i></div><div class="tc-sub"><span id="fuRange"></span><span id="fuAd"></span></div></div>`,
    damage: `<div class="glass w-damage"><div class="w-title">Estado</div>${[['Motor', 'dE'], ['Transmisión', 'dT'], ['Cabina', 'dC'], ['Chasis', 'dH'], ['Ruedas', 'dW'], ['Remolque', 'dR'], ['Carga', 'dL']].map(([l, id]) => `<div class="dmg"><span>${l}</span><div class="bar"><i id="${id}" style="width:0"></i></div><span id="${id}t">0 %</span></div>`).join('')}</div>`,
    job: `<div class="glass w-job" id="jobW"></div>`,
    tacho: `<div class="glass w-tacho"><div class="w-title"><span>Tacógrafo</span><span id="tcTxt"></span></div><div class="bar"><i id="tcBar"></i></div><div class="tc-sub"><span id="tcDay"></span><span id="tcLeft"></span></div></div>`,
    convoy: `<div class="glass w-convoy"><div class="w-title"><span>Convoy</span><span id="cvCode"></span></div><div id="cvRows"></div></div>`
  };
  hud.innerHTML = '';
  const add = (id, inner, pos) => {
    const el = document.createElement('div');
    el.className = 'w'; el.dataset.id = id; el.dataset.label = LABELS[id] || id; el.innerHTML = inner;
    el.style.left = pos.x + '%'; el.style.top = pos.y + '%';
    el.style.transform = `scale(${O().scale || 1})`;
    if (pos.on === false) el.classList.add('hidden');
    hud.appendChild(el);
  };
  if (style === 'minimal') add('speed', html.speed, W.speed);
  else if (style === 'card') {
    const c = O().corner || 'br';
    const pos = { x: c.includes('l') ? 1.5 : 78, y: c.startsWith('t') ? 3 : 58, on: true };
    add('card', `<div class="glass w-card"><div class="row1"><div><div class="v" id="spd">0</div><small>${mph() ? 'mph' : 'km/h'}</small></div><div class="lim-s" id="limS"></div><b class="g" id="gear">N</b><span style="margin-left:auto" id="navClock"></span></div>
      <div style="margin-top:8px"><b id="navDest">Conducción libre</b> <span id="navDist"></span><div id="navVia" style="font-size:12px;opacity:.8"></div></div></div>`, pos);
    add('messages', html.messages, { x: pos.x, y: c.startsWith('t') ? 26 : 38, on: true });
  } else for (const id of Object.keys(DEFAULTS)) add(id, html[id], W[id]);
  document.documentElement.style.setProperty('--ov-alpha', Math.round((O().opacity ?? 0.95) * 80) + '%');
  const cv = $('#mm'); if (cv) { const d = devicePixelRatio || 1; cv.width = 280 * d; cv.height = 200 * d; }
  if (editing) enableDrag();
  renderMsgs();
  renderFinance();
  update();
}
function arcPath(f0, f1) {
  const a0 = (-225 + f0 * 270) * Math.PI / 180, a1 = (-225 + f1 * 270) * Math.PI / 180, r = 94;
  return `M ${105 + r * Math.cos(a0)} ${105 + r * Math.sin(a0)} A ${r} ${r} 0 ${f1 - f0 > 2 / 3 ? 1 : 0} 1 ${105 + r * Math.cos(a1)} ${105 + r * Math.sin(a1)}`;
}

// ---------- actualización ----------
let smooth = 0, last = performance.now();
let lastMap = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = live?.truck;
  const target = t ? Math.abs(spd(t.speed)) : 0;
  smooth += (target - smooth) * Math.min(1, dt * 7);
  const e = $('#spd'); if (e) e.textContent = Math.round(smooth);
  const arc = $('#arc'); if (arc) arc.setAttribute('stroke-dashoffset', String(1000 - Math.min(1, smooth / (mph() ? 90 : 140)) * 1000));
  if (now - lastMap > 40) { lastMap = now; drawMinimap(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function update() {
  const on = live && live.sdk && status?.state === 'connected';
  const paused = on && live.paused;
  const hud = $('#hud');
  hud.classList.toggle('off', !editing && (!on || paused));
  const pill = $('#pausePill');
  pill.classList.toggle('hidden', !(paused && O().pauseMini !== false) || editing);
  if (paused) $('#pauseInfo').textContent = live.job?.onJob ? `${live.job.toCity} · ${dist((live.nav?.distance || 0) / 1000)}` : clock(clockMins());
  if (!on) return;
  const t = live.truck, n = live.nav, j = live.job;
  const lim = Math.round(n.limit || 0);
  const over = lim > 0 && t.speed > lim + 3;
  $('#dial')?.classList.toggle('over', over);
  const le = $('#lim'); if (le) { le.textContent = lim > 0 ? Math.round(spd(lim)) : '–'; le.classList.toggle('none', lim <= 0); }
  const lm = $('#limMark');
  if (lm && lim > 0) { const a = (-225 + Math.min(1, spd(lim) / (mph() ? 90 : 140)) * 270) * Math.PI / 180; lm.setAttribute('x1', 105 + 99 * Math.cos(a)); lm.setAttribute('y1', 105 + 99 * Math.sin(a)); lm.setAttribute('x2', 105 + 88 * Math.cos(a)); lm.setAttribute('y2', 105 + 88 * Math.sin(a)); }
  let g = t.gear; if (!g && t.gearSel) g = t.gearSel;
  const ge = $('#gear'); if (ge) ge.textContent = g < 0 ? 'R' + Math.abs(g) : !g ? 'N' : (/auto|arcade/i.test(t.shifter || '') ? 'A' : '') + g;
  const cc = $('#cc'); if (cc) cc.textContent = t.cruise ? `⟳ ${Math.round(spd(t.cruiseSpeed))}` : t.retarder > 0 ? `Retarder ${t.retarder}` : '';
  const rp = $('#rpm'); if (rp) rp.style.width = Math.min(100, (t.rpm / (t.rpmMax || 2500)) * 100) + '%';
  // testigos
  const L = t.lights || {}, w = t.warn || {};
  // El juego a veces informa del intermitente/emergencia encendiéndose y apagándose: se mantiene
  // «activo» 1,2 s tras el último aviso y el parpadeo lo hace el overlay a ritmo constante
  const nowMs = Date.now();
  const hold = (k, v) => { if (v) latch[k] = nowMs; return nowMs - (latch[k] || 0) < 1200; };
  const hz = hold('hazard', L.hazard || (L.leftOn && L.rightOn));
  const st = { left: hold('left', L.left || L.leftOn) && !hz, right: hold('right', L.right || L.rightOn) && !hz, low: L.low, high: L.high, beacon: L.beacon, hazard: hz, park: t.parking, engine: t.engineBrake || t.retarder > 0, cruise: t.cruise, battery: w.battery, oil: w.oil, air: w.air, fuel: w.fuel };
  for (const [id] of LAMPS) { const el = $('#L-' + id); if (el) el.classList.toggle('on', !!st[id]); }
  // navegación
  let via = null;
  if (route && route.popular && t.x !== undefined) {
    for (const v of route.popular.via || []) if (Math.hypot(v.x - t.x, v.y - t.z) < 2500) passed.add(v.name);
    via = (route.popular.via || []).find((v) => !passed.has(v.name));
  }
  const nd = $('#navDest'), ns = $('#navSub'), ndi = $('#navDist');
  if (nd) nd.textContent = j && j.onJob ? `${j.toCity}` : 'Conducción libre';
  if (ns) ns.textContent = j && j.onJob ? `${j.toCompany} · ${j.cargo}` : '';
  if (ndi) ndi.textContent = j && j.onJob ? dist(n.distance / 1000) : '';
  const nv = $('#navVia'); if (nv && j && j.onJob && !route) { nv.textContent = routeErr ? 'Sin ruta recomendada' : 'Calculando ruta…'; } else if (nv) nv.innerHTML = via ? `Por <span class="via">${esc(via.name)}</span> · ${dist(Math.hypot(via.x - t.x, via.y - t.z) / 1000)}` : j && j.onJob && n.time > 0 ? `≈ ${dur(n.time)}` : '';
  const nc = $('#navClock'); if (nc) { const now = new Date(); nc.textContent = `${clock(clockMins())} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; nc.title = 'Hora del juego (o del servidor de TruckersMP) · hora real'; }
  const tl = { low: ['Fluido', '#4fd1a1'], moderate: ['Moderado', '#ffb547'], heavy: ['Denso', '#ffc94d'], congested: ['Congestionado', '#ff5a64'] }[traffic?.level];
  const nt = $('#navTraf'); if (nt) nt.innerHTML = tl ? `<span class="tchip" style="background:${tl[1]}22;color:${tl[1]}">${tl[0]}</span>` : '';
  // finanzas
  if ($('#fSes')) { const s = ses || {}; const net = (s.revenue || 0) - (s.finesTotal || 0); $('#fSes').textContent = money(net); $('#fSes').className = net >= 0 ? 'pos' : 'neg'; $('#fJob').textContent = j && j.onJob ? money(j.income) : '—'; $('#fFin').textContent = s.fines ? money(-(s.finesTotal || 0)) : '0'; $('#fFin').className = s.fines ? 'neg' : ''; }
  // daños
  if ($('#dE')) {
    const D = t.damage, tr = live.trailer?.attached ? live.trailer.damage : null;
    const set = (id, v) => { $('#' + id).style.width = Math.min(100, v * 100) + '%'; $('#' + id + 't').textContent = Math.round(v * 100) + ' %'; };
    set('dE', D.engine); set('dT', D.transmission); set('dC', D.cabin); set('dH', D.chassis); set('dW', D.wheels);
    set('dR', tr ? Math.max(tr.body, tr.chassis, tr.wheels) : 0); set('dL', j?.cargoDamage || 0);
  }
  const jw = $('#jobW');
  if (jw) { jw.parentElement.classList.toggle('hidden', !(j && j.onJob) || O().widgets?.job?.on === false); if (j && j.onJob) jw.innerHTML = `<b>${esc(j.fromCity)} → ${esc(j.toCity)}</b><span>${esc(j.cargo)} · ${nf1.format(j.mass / 1000)} t</span><span style="opacity:.7">${j.deadline > 0 ? 'antes de ' + clock(j.deadline) : ''}</span>${cur?.score ? `<span class="gchip g-${cur.score.grade.replace('+', 'p')}">${cur.score.grade} · ${cur.score.score}</span>` : ''}`; }
  // combustible
  if ($('#fuBar')) {
    const p = t.fuel / (t.fuelCap || 1);
    $('#fuBar').style.width = Math.min(100, p * 100) + '%'; $('#fuBar').style.background = p < 0.12 ? '#ff5a64' : p < 0.25 ? '#ffc94d' : 'var(--accent)';
    $('#fuTxt').textContent = Math.round(p * 100) + ' %';
    $('#fuRange').textContent = `Autonomía ${mph() ? nf.format(t.fuelRange * 0.621371) + ' mi' : nf.format(t.fuelRange) + ' km'}`;
    $('#fuAd').textContent = t.adblueCap ? `AdBlue ${Math.round((t.adblue / t.adblueCap) * 100)} %` : '';
  }
  // tacógrafo
  if ($('#tcBar') && tacho) {
    const wEl = $('#tcBar').closest('.w'); wEl.classList.toggle('hidden', tacho.enabled === false || O().widgets?.tacho?.on === false);
    const b = tacho.block / tacho.blockMax;
    $('#tcBar').style.width = Math.min(100, b * 100) + '%'; $('#tcBar').style.background = b >= 1 ? '#ff5a64' : b > 0.94 ? '#ffc94d' : 'var(--accent)';
    $('#tcTxt').textContent = `${dur(tacho.block)} / ${dur(tacho.blockMax)}`;
    $('#tcDay').textContent = `Hoy ${dur(tacho.day)}`;
    $('#tcLeft').textContent = b >= 1 ? 'Pausa obligatoria' : `Pausa en ${dur(Math.max(0, tacho.blockMax - tacho.block))}`;
  }
  renderConvoy();
}

// Minutos del reloj elegido en los ajustes
function clockMins() {
  const mode = settings?.clock || 'auto';
  if (mode === 'tmp' && tmpTime != null) return tmpTime;
  if (mode === 'auto' && onTmp && tmpTime != null) return tmpTime;
  return live?.gameTime || 0;
}
function renderFinance() {
  const sp = $('#fSpark'); if (!sp || !fin) return;
  const max = Math.max(1, ...fin.days.map((d) => Math.abs(d.net)));
  sp.innerHTML = fin.days.map((d) => `<i class="${d.net < 0 ? 'neg' : ''}" style="height:${Math.max(6, (Math.abs(d.net) / max) * 100)}%" title="${d.date}: ${money(d.net)}"></i>`).join('');
  $('#fWeek').textContent = money(fin.week); $('#fWeek').className = fin.week < 0 ? 'neg' : 'pos';
}
function loadFinance() { fetch('/api/finance').then((r) => r.json()).then((r) => { fin = r; renderFinance(); }).catch(() => {}); }
setInterval(loadFinance, 60000);
function laligaPill(st) {
  let el = $('#lalPill');
  const on = st && st.blocked && settings?.alerts?.laliga !== false;
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'lalPill'; el.className = 'lal-pill'; document.body.appendChild(el); }
  el.innerHTML = '<span>⚽</span><b>TruckersMP caído en España</b><small>bloqueos de LaLiga</small>';
}
function renderConvoy() {
  const rows = $('#cvRows'); if (!rows) return;
  const wEl = rows.closest('.w');
  const act = convoy && convoy.active;
  wEl.classList.toggle('hidden', !act || O().widgets?.convoy?.on === false);
  if (!act) return;
  $('#cvCode').textContent = convoy.leader ? 'Líder' : convoy.code;
  rows.innerHTML = (convoy.members || []).slice(0, 6).map((m) => `<div class="cv-row"><i style="background:${m.color}"></i><b>${m.leader ? '★ ' : ''}${esc(m.name)}</b>
    ${m.dist != null && !m.off ? `<span class="cv-arr" style="transform:rotate(${(m.rel || 0) - 90}deg)">➜</span><span>${dist(m.dist)}</span>` : '<span style="opacity:.6">parado</span>'}</div>`).join('') || '<div style="opacity:.7;font-size:12px">Esperando compañeros…</div>';
}
// ---------- mini mapa (teselas del mapa de TruckersMP + ruta recomendada) ----------
const GAMES = {
  ets2: { url: 'https://map-cdn.krashnz.com/ets2map/ets2/v1.60', off: { x: -22, y: -22 }, r: { xMin: -100, xMax: 88, yMin: -124, yMax: 91 } },
  promods: { url: 'https://map-cdn.krashnz.com/ets2map/promods/v2.80', off: { x: -145, y: -18 }, r: { xMin: -144, xMax: 206, yMin: -166, yMax: 130 } },
  ats: { url: 'https://map-cdn.krashnz.com/ets2map/ats-promods/v1.6.3', off: { x: -18, y: -18 }, r: { xMin: -122, xMax: 39, yMin: -88, yMax: 100 } }
};
const LEVELS = [[1, 1, 0], [2, 3, 1000], [3, 9, 4000], [4, 27, 13000]];
const imgs = new Map();
function tile(url) {
  let e = imgs.get(url); if (e) return e;
  const im = new Image(); e = { im, ok: false }; im.onload = () => (e.ok = true); im.src = url; imgs.set(url, e);
  if (imgs.size > 200) imgs.delete(imgs.keys().next().value);
  return e;
}
const MM_ZOOMS = [0.03, 0.07, 0.15, 0.32]; // Región, Carretera, Cerca, Detalle
let mmZoom = 0.15, locsAll = [], nearPois = [], nearCities = [], nearAt = 0, locsGame = '';
function loadLocs(game) {
  if (locsGame === game) return;
  locsGame = game;
  fetch(`/api/map/locations?game=${game}`).then((r) => r.json()).then((l) => { locsAll = l; nearAt = 0; }).catch(() => { locsGame = ''; });
}
// Solo se recalculan los puntos cercanos cada 2 s: dibujar 10.000 en cada fotograma comería CPU del juego
function refreshNear(cx, cy, range) {
  if (performance.now() - nearAt < 2000) return;
  nearAt = performance.now();
  const r2 = range * range;
  nearPois = []; nearCities = [];
  for (const l of locsAll) {
    const dx = l.x - cx, dy = l.y - cy;
    if (dx * dx + dy * dy > r2) continue;
    if (l.t === 'city') nearCities.push(l);
    else if (['fuel', 'rest', 'service', 'garage', 'company', 'dealer', 'recruit', 'port', 'toll'].includes(l.t)) nearPois.push(l);
  }
  nearCities.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
  nearCities = nearCities.slice(0, 40);
}
function drawMinimap() {
  const cv = $('#mm'); if (!cv || !live || !live.truck) return;
  const ctx = cv.getContext('2d'), d = devicePixelRatio || 1, W = 280, H = 200;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H);
  const game = String(live.game).toLowerCase() === 'ats' ? 'ats' : route?.game === 'promods' ? 'promods' : 'ets2';
  const g = GAMES[game];
  const tf = (x, y) => (game === 'ets2' && y < -0.14 * x - 10040 && x < -30100 ? [0.75 * x - 8337, 0.75 * y - 1000] : [x, y]);
  const t = live.truck;
  const [cx, cy] = tf(t.x, t.z);
  const ppu = mmZoom * (O().mapZoom || 1);
  const h = (t.heading || 0) * Math.PI * 2;
  const rot = O().mapRotate !== false ? -Math.PI / 2 - Math.atan2(-Math.cos(h), -Math.sin(h)) : 0;
  ctx.save();
  ctx.translate(W / 2, H * 0.62); ctx.rotate(rot);
  const toS = (x, y) => [(x - cx) * ppu, (y - cy) * ppu];
  const L = Math.max(1, Math.min(4, 1 + Math.floor(Math.log(0.256 / ppu) / Math.log(3))));
  const [lv, step, o] = LEVELS[L - 1]; const size = 1000 * Math.pow(3, lv - 1), suf = lv > 1 ? `_${lv}` : '';
  const R = Math.hypot(W, H) / ppu;
  for (let a = g.r.xMin; a <= g.r.xMax; a += step) {
    const tx = 1000 * a + g.off.x + o - size / 2; if (tx > cx + R || tx + size < cx - R) continue;
    for (let i = g.r.yMin; i <= g.r.yMax; i += step) {
      const ty = 1000 * i + g.off.y + o - size / 2; if (ty > cy + R || ty + size < cy - R) continue;
      const e = tile(`${g.url}/${a}_${i}${suf}.png`);
      if (e.ok) { const [sx, sy] = toS(tx, ty); ctx.drawImage(e.im, sx, sy, size * ppu + 0.5, size * ppu + 0.5); }
    }
  }
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffb547';
  // Puntos de interés cercanos: gasolineras, descanso, talleres, garajes y empresas
  loadLocs(game);
  refreshNear(cx, cy, Math.max(Math.hypot(W, H) / ppu, 3000));
  if (ppu > 0.02) {
    const COL = { fuel: '#ffb547', rest: '#6fb6ff', service: '#ff7a59', garage: '#b07cff', company: '#4fd1a1', dealer: '#e5e55b', recruit: '#e5e55b', port: '#43e0ff', toll: '#e5e55b' };
    const GLY = { fuel: 'G', rest: 'P', service: 'T', garage: 'H', company: 'E', dealer: 'C', recruit: 'A', port: 'F', toll: '€' };
    const s2 = ppu > 0.12 ? 13 : ppu > 0.05 ? 9 : 5;
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(s2 * 0.68)}px Barlow, sans-serif`;
    for (const p of nearPois) {
      if (p.t === 'company' && ppu < 0.06) continue;
      const [sx, sy] = toS(...tf(p.x, p.y));
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-rot);
      ctx.fillStyle = COL[p.t] || '#ccc';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-s2 / 2, -s2 / 2, s2, s2, s2 / 3.5); else ctx.rect(-s2 / 2, -s2 / 2, s2, s2); ctx.fill();
      if (s2 >= 9) { ctx.fillStyle = '#0b1220'; ctx.fillText(GLY[p.t] || '', 0, s2 * 0.24); }
      ctx.restore();
    }
  }
  const rsel = O().routeMode === 'popular' ? (route?.popular || route?.fastest) : (route?.gps || route?.fastest || route?.popular);
  let pts = rsel?.points;
  if (pts && pts.length > 1) {
    let from = 0, bd = Infinity; pts.forEach((p, i) => { const d = Math.hypot(p[0] - cx, p[1] - cy); if (d < bd) { bd = d; from = i; } });
    pts = pts.slice(Math.max(0, from - 1));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 7; ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = toS(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.stroke();
  }
  // Jugadores de TruckersMP alrededor
  if (performance.now() - nearT > 3000) {
    nearT = performance.now();
    const R = Math.max((O().playerRange ?? 1.5) * 1000, Math.min(20000, (Math.hypot(W, H) / ppu) * 0.7));
    fetch(`/api/map/area?x1=${t.x - R}&y1=${t.z - R}&x2=${t.x + R}&y2=${t.z + R}&server=auto`).then((r) => r.json()).then((r) => { const maxD = (O().playerRange ?? 1.5) * 1000;
      near = (r.players || []).filter((p) => { const d = Math.hypot(p[0] - t.x, p[1] - t.z); return d > 25 && d <= maxD; }); }).catch(() => {});
  }
  ctx.fillStyle = '#43e0ff'; ctx.strokeStyle = '#0c121c'; ctx.lineWidth = 1.5;
  for (const p of near) {
    const [px, py] = toS(...tf(p[0], p[1]));
    if (Math.abs(px) > W || Math.abs(py) > H) continue;
    ctx.beginPath(); ctx.arc(px, py, ppu > 0.06 ? 4.5 : 3, 0, 7); ctx.fill(); ctx.stroke();
  }
  if (convoy && convoy.active) for (const m of convoy.members || []) {
    if (m.x == null || m.off) continue;
    const [mx, my] = toS(...tf(m.x, m.z));
    ctx.fillStyle = m.color; ctx.strokeStyle = '#0c121c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, 6, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  // Nombres de ciudades (y empresas al acercar): el texto se dibuja derecho aunque el mapa gire
  const proj = (x, y) => {
    const [mx, my] = toS(...tf(x, y));
    return [W / 2 + mx * Math.cos(rot) - my * Math.sin(rot), H * 0.62 + mx * Math.sin(rot) + my * Math.cos(rot)];
  };
  // Tamaño y opacidad según lo lejos que esté la ciudad: las cercanas grandes, las lejanas más pequeñas.
  // Si un nombre se pisaría con otro ya puesto, se omite (se dibujan primero las más cercanas).
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  const placed = [];
  const free = (x, y, w, h) => { for (const b of placed) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; placed.push([x, y, w, h]); return true; };
  const [tx0, ty0] = [W / 2, H * 0.62];
  const maxR = Math.hypot(W, H) * 0.75;
  for (const c of nearCities) {
    const [sx, sy] = proj(c.x, c.y);
    if (sx < -40 || sy < -14 || sx > W + 40 || sy > H + 14) continue;
    const k = Math.min(1, Math.hypot(sx - tx0, sy - ty0) / maxR); // 0 = junto al camión, 1 = en el borde
    const size = Math.round(14 - k * 5);
    ctx.font = `700 ${size}px Barlow, sans-serif`;
    const w = ctx.measureText(c.n).width + 6;
    if (!free(sx - w / 2, sy - size - 6, w, size + 4)) continue;
    ctx.globalAlpha = 1 - k * 0.45;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,20,.9)'; ctx.strokeText(c.n, sx, sy - 6);
    ctx.fillStyle = '#eef2f8'; ctx.fillText(c.n, sx, sy - 6);
    ctx.fillStyle = 'rgba(238,242,248,.8)'; ctx.beginPath(); ctx.arc(sx, sy, 2 + (1 - k) * 1.2, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (ppu > 0.12) {
    ctx.font = '600 10px Barlow, sans-serif';
    for (const p of nearPois) {
      if (p.t !== 'company' || !p.n) continue;
      const [sx, sy] = proj(p.x, p.y);
      if (sx < -30 || sy < -12 || sx > W + 30 || sy > H + 12) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,12,20,.9)'; ctx.strokeText(p.n, sx, sy + 12);
      ctx.fillStyle = 'rgba(238,242,248,.85)'; ctx.fillText(p.n, sx, sy + 12);
    }
  }
  // camión (fijo en el centro, mirando hacia arriba si el mapa gira)
  ctx.save(); ctx.translate(W / 2, H * 0.62); ctx.rotate(O().mapRotate !== false ? 0 : -rot + Math.atan2(-Math.cos(h), -Math.sin(h)) + Math.PI / 2);
  ctx.fillStyle = acc; ctx.strokeStyle = '#0c121c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------- mensajes ----------
let msgs = [];
function pushMsg(m) {
  if (O().show?.alerts === false && m.kind !== 'ev') return;
  msgs.unshift({ ...m, at: Date.now(), key: Math.random() });
  msgs = msgs.slice(0, 4);
  renderMsgs(true);
  const ttl = (m.kind === 'sys' || m.cls === 'rule' ? 12 : O().toastSeconds || 6) * 1000;
  const key = msgs[0].key;
  setTimeout(() => { const el = document.querySelector(`[data-k="${key}"]`); if (el) { el.classList.add('out'); setTimeout(() => { msgs = msgs.filter((x) => x.key !== key); renderMsgs(); }, 380); } }, ttl);
}
function renderMsgs(fresh) {
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = msgs.map((m, i) => `<div class="glass msg ${m.cls || m.level || ''}" data-k="${m.key}" style="${fresh && i === 0 ? '' : 'animation:none'}"><div><span class="tag">${esc(m.tag || 'Aviso')}</span><b>${esc(m.title)}</b>${m.text ? `<small>${esc(m.text)}</small>` : ''}</div></div>`).join('');
}
function onAlert(a) {
  if (window.HubSound) HubSound.alert(a, settings, 'pc');
  const rule = String(a.id || '').startsWith('rule');
  pushMsg({ title: a.title, text: a.text, level: a.level, cls: rule ? 'rule' : a.level, kind: a.kind, tag: a.achievement ? 'Logro' : rule ? 'Norma de TruckersMP' : a.kind === 'sys' ? 'Mensaje del camión' : /^(ahead|around|dest|popular|route)/.test(a.id) ? 'Tráfico' : 'Aviso' });
}
function onEv(e) {
  const map = {
    fined: ['Multa', `${OFF[e.offence] || 'Infracción'} · ${money(-e.amount)}`, 'bad'], tollgate: ['Peaje pagado', money(-e.amount), 'info'],
    ferry: ['Ferry', `${e.from} → ${e.to}`, 'info'], train: ['Tren', `${e.from} → ${e.to}`, 'info'], refuel: ['Repostaje', `${nf.format(e.liters)} l`, 'good'],
    job_delivered: ['Entrega completada', `+${money(e.revenue)} · ${nf.format(e.xp)} XP`, 'good'], job_cancelled: ['Trabajo cancelado', money(-Math.abs(e.penalty || 0)), 'bad']
  }[e.type];
  if (!map) return;
  if (O().show?.toasts === false) return;
  if (['fined', 'job_delivered', 'job_cancelled'].includes(e.type) && window.HubSound) HubSound.alert({ title: map[0], text: map[1], level: map[2] }, settings, 'pc');
  pushMsg({ title: map[0], text: map[1], level: map[2], kind: 'ev', tag: 'Mensajes de la empresa' });
}

// ---------- edición (arrastrar widgets) ----------
function enableDrag() {
  $$('.w').forEach((el) => {
    el.onpointerdown = (e) => {
      if (!editing) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('dragging');
      const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      el.onpointermove = (m) => { el.style.left = ((m.clientX - ox) / innerWidth * 100).toFixed(2) + '%'; el.style.top = ((m.clientY - oy) / innerHeight * 100).toFixed(2) + '%'; };
      el.onpointerup = () => {
        el.onpointermove = null; el.classList.remove('dragging');
        const id = el.dataset.id; if (id === 'card') return;
        const x = Math.max(0, Math.min(98, parseFloat(el.style.left))), y = Math.max(0, Math.min(98, parseFloat(el.style.top)));
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overlay: { widgets: { [id]: { x, y } } } }) }).catch(() => {});
      };
    };
  });
}
function setEdit(on) { editing = on; document.body.classList.toggle('edit', on); if (on) enableDrag(); update(); }
$('#editDone').onclick = () => window.hubOverlay?.editDone();
$('#editReset').onclick = () => fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overlay: { widgets: DEFAULTS } }) });

function post(body) { return fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {}); }
function onCmd(c) {
  if (c === 'toggle-map') post({ overlay: { widgets: { nav: { on: O().widgets?.nav?.on === false } } } });
  else if (c === 'clear-messages') { msgs = []; renderMsgs(); }
  else if (c === 'cycle-style') { const order = ['hud', 'card', 'minimal']; post({ overlay: { style: order[(order.indexOf(O().style || 'hud') + 1) % 3] } }); }
  else if (c === 'zoom-map') {
    const Z = MM_ZOOMS;
    const i = Z.findIndex((z) => Math.abs(z - mmZoom) < 0.0001);
    mmZoom = Z[(i + 1) % Z.length];
    const nv = $('#mm')?.closest('.minimap');
    if (nv) { nv.dataset.zoom = ['Región', 'Carretera', 'Cerca', 'Detalle'][(i + 1) % Z.length]; nv.classList.remove('zflash'); void nv.offsetWidth; nv.classList.add('zflash'); }
  }
  else if (c === 'reset') post({ overlay: { widgets: DEFAULTS } });
}

// ---------- conexión ----------
function applySettings(s) {
  const prevKey = settings ? JSON.stringify([settings.overlay, settings.units, settings.language]) : null;
  settings = s;
  document.documentElement.dataset.theme = s.theme || 'autopista';
  const a = s.appearance || {};
  if (a.accent) document.documentElement.style.setProperty('--accent', a.accent); else document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.setProperty('--rs', String(a.radius ?? 1));
  if (window.I18N) I18N.set(s.language || 'es');
  if (JSON.stringify([s.overlay, s.units, s.language]) !== prevKey) build();
}
function connect() {
  const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/ws');
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.t === 'hello') {
      laligaPill(msg.laliga);
      traffic = msg.traffic; live = msg.live; status = msg.status; gameSt = msg.game; convoy = msg.convoy; tacho = msg.tacho; applySettings(msg.settings);
      fetch('/api/route/current').then((r) => r.json()).then((r) => { if (r && r.route) route = r.route; }).catch(() => {});
      update();
    } else if (msg.t === 'tel') { live = msg.d; if (msg.ses) ses = msg.ses; if (msg.tacho) tacho = msg.tacho; cur = msg.cur; tmpTime = msg.tmpTime ?? null; onTmp = !!msg.onTmp; update(); }
    else if (msg.t === 'convoy') { convoy = msg.d; renderConvoy(); }
    else if (msg.t === 'laliga') laligaPill(msg.d);
    else if (msg.t === 'status') { status = msg.d; update(); }
    else if (msg.t === 'settings') applySettings(msg.settings);
    else if (msg.t === 'ev') onEv(msg.d);
    else if (msg.t === 'traffic') { traffic = msg.d; }
    else if (msg.t === 'alert') onAlert(msg.d);
    else if (msg.t === 'route') { route = msg.d; routeErr = null; }
    else if (msg.t === 'route-error') { route = null; routeErr = msg.d.error; }
    else if (msg.t === 'game') gameSt = msg.d;
    else if (msg.t === 'job') {
      if (msg.d.phase !== 'started') { route = null; passed = new Set(); setTimeout(loadFinance, 1500); }
      else pushMsg({ title: 'Nuevo trabajo', text: `${msg.d.job.fromCity} → ${msg.d.job.toCity} · ${msg.d.job.cargo}`, level: 'info', kind: 'ev', tag: 'Mensajes de la empresa' });
    }
  };
  ws.onerror = () => {};
  ws.onclose = () => { live = null; update(); setTimeout(connect, 2000); };
}
if (window.hubOverlay) { window.hubOverlay.onEdit(setEdit); window.hubOverlay.onCmd?.(onCmd); }
// Modo para directos (OBS/Streamlabs): sin barra de edición
if (/[?&]obs=1/.test(location.search)) document.body.classList.add('obs');
build();
loadFinance();
connect();
