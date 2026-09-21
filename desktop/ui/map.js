/* Xito Truck Hub — mapa en vivo (teselas de TruckersMP/Krashnz, jugadores, rutas, amigos y destino) */
'use strict';
(() => {
  const GAMES = {
    ets2: { name: 'ETS2', url: 'https://map-cdn.krashnz.com/ets2map/ets2/v1.60', off: { x: -22, y: -22 }, r: { xMin: -100, xMax: 88, yMin: -124, yMax: 91 }, cam: { x: 7555, y: 21610 } },
    promods: { name: 'ProMods', url: 'https://map-cdn.krashnz.com/ets2map/promods/v2.80', off: { x: -145, y: -18 }, r: { xMin: -144, xMax: 206, yMin: -166, yMax: 130 }, cam: { x: 44250, y: -112554 } },
    ats: { name: 'ATS', url: 'https://map-cdn.krashnz.com/ets2map/ats-promods/v1.6.3', off: { x: -18, y: -18 }, r: { xMin: -122, xMax: 39, yMin: -88, yMax: 100 }, cam: { x: 6628, y: -1018 } }
  };
  const LEVELS = [[1, 1, 0], [2, 3, 1000], [3, 9, 4000], [4, 27, 13000]]; // [nivel, paso, desplazamiento]
  const imgCache = new Map();
  function img(url, onload) {
    let e = imgCache.get(url);
    if (e) { imgCache.delete(url); imgCache.set(url, e); return e; }
    const im = new Image();
    e = { im, ok: false, bad: false };
    im.onload = () => { e.ok = true; onload(); };
    im.onerror = () => { e.bad = true; };
    im.src = url;
    imgCache.set(url, e);
    if (imgCache.size > 500) imgCache.delete(imgCache.keys().next().value);
    return e;
  }
  const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Datos: a través del PC o directo desde el móvil sin PC
  async function getPlayers(server) {
    if (S.connected) return api(`/api/map/players?server=${encodeURIComponent(server || 'auto')}`);
    const d = (await directJson('https://tracker.ets2map.com/v3/fullmap', 25000)).Data || [];
    const tmpId = Number(tmpIds().player);
    const me = d.find((p) => p.MpId === tmpId);
    const sid = server && server !== 'auto' ? +server : me ? me.ServerId : 2;
    const counts = {}; for (const p of d) counts[p.ServerId] = (counts[p.ServerId] || 0) + 1;
    return { server: sid, me: me ? { x: me.X, y: me.Y, server: me.ServerId } : null,
      servers: Object.entries(counts).map(([id, n]) => ({ id: +id, players: n, name: `Servidor ${id}` })).sort((a, b) => b.players - a.players),
      players: d.filter((p) => p.ServerId === sid).map((p) => [p.X, p.Y, p.Heading, p.MpId, p.Name, p.Time || 0]) };
  }
  const locCache = {};
  async function getLocations(game) {
    if (locCache[game]) return locCache[game];
    let out;
    if (S.connected && S.mode !== 'remote') out = await api(`/api/map/locations?game=${game}`);
    else {
      // En el móvil (remoto o sin PC) se descarga directamente: pesa demasiado para enviarlo por el acceso remoto
      const raw = await directJson(`https://map.truckersmp.com/locations_${game}.min.json`, 30000);
      const KEEP = { fuel: 'fuel', parking: 'rest', service: 'service', garage: 'garage', dealer: 'dealer', recruitment: 'recruit', ferry: 'port', business: 'company' };
      const pretty = (id) => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      out = [];
      for (const c of raw) {
        out.push({ t: 'country', n: c.name, x: c.x, y: c.y });
        const all = []; for (const p of c.pois || []) { all.push(p); for (const q of p.pois || []) all.push(q); }
        for (const p of all) {
          if (p.type === 'city') out.push({ t: 'city', n: p.name, x: p.x, y: p.y, c: c.name });
          else if (KEEP[p.type]) out.push({ t: KEEP[p.type], n: p.type === 'business' ? pretty(p.name) : '', x: p.x, y: p.y });
          else if (p.type === 'overlay' && p.name === 'toll_ico') out.push({ t: 'toll', n: '', x: p.x, y: p.y });
        }
      }
    }
    return (locCache[game] = out);
  }

  VIEWS.mapa = (root) => {
    const cfg = { layer: true, trail: true, labels: true, friends: true, follow: true, heat: true, route: true, alt: true, fuel: true, rest: true, service: true, garage: true, company: true, more: false, server: 'auto', ...(S.settings?.map || {}), ...LS.get('mapCfg', {}) };
    cfg.layer = cfg.layer !== false; // compatibilidad con ajustes antiguos
    const saveCfg = () => { LS.set('mapCfg', cfg); if (S.connected && !IS_CAP) post('/api/settings', { map: { follow: cfg.follow, trail: cfg.trail, labels: cfg.labels, server: cfg.server } }).catch(() => {}); };
    let game = cfg.game || (String(S.live?.game).toLowerCase() === 'ats' ? 'ats' : 'ets2');
    const G = () => GAMES[game];
    let cam = { x: G().cam.x, y: G().cam.y }, ppu = 0.02, dirty = true, raf = 0;
    let prevPos = new Map(), playersAt = 0, smoothPos = null, vtcMates = [], players = [], me = null, servers = [], locs = [], trail = [], friends = [], jobPath = [], hover = null, heat = [], heatMax = 1, routeView = 'popular', planning = false;

    root.innerHTML = `<div class="head map-head" style="margin-bottom:14px"><div><h1>Mapa</h1><p id="mapSub">TruckersMP en directo</p></div>
      <div class="row wrap map-ctl"><div class="chips" id="mapGame">${Object.entries(GAMES).map(([k, g]) => `<button class="chip" data-g="${k}" aria-pressed="${k === game}">${g.name}</button>`).join('')}</div>
      <input class="input" id="mapSearch" list="mapSearchList" placeholder="Buscar ciudad o empresa" aria-label="Buscar en el mapa"><datalist id="mapSearchList"></datalist>
      <select class="input" id="mapServer" style="width:auto" aria-label="Servidor"><option value="auto">Mi servidor</option></select>
      ${IS_ELECTRON ? `<button class="chip" id="mapOfficial" aria-pressed="${!!cfg.official}">Mapa oficial de TruckersMP</button>` : `<a class="chip" href="https://map.truckersmp.com" target="_blank" rel="noopener">Mapa oficial</a>`}</div></div>
      <div class="map-wrap">
        <iframe id="mapFrame" class="map-frame hidden" title="Mapa oficial de TruckersMP" loading="lazy"></iframe>
        <canvas id="mapCv" aria-label="Mapa del juego"></canvas>
        <div class="map-tools">
          <button class="btn" id="mZoomIn" aria-label="Acercar">+</button><button class="btn" id="mZoomOut" aria-label="Alejar">−</button>
          <button class="btn ${cfg.follow ? 'primary' : ''}" id="mFollow" title="Seguir a mi camión">${ic('truck')}</button>
        </div>
        <button class="btn map-layers-btn" id="mLayers">${ic('layers')}Capas</button>
        <div class="map-layers chips hidden" id="mLayerPanel">
          <button class="chip" data-l="heat" aria-pressed="${cfg.heat}">Tráfico</button>
          <button class="chip" data-l="route" aria-pressed="${cfg.route}">Ruta</button>
          <button class="chip" data-l="layer" aria-pressed="${cfg.layer}">Jugadores</button>
          <button class="chip" data-l="trail" aria-pressed="${cfg.trail}">Mis rutas</button>
          <button class="chip" data-l="labels" aria-pressed="${cfg.labels}">Ciudades</button>
          <button class="chip" data-l="friends" aria-pressed="${cfg.friends}">Amigos</button>
          <button class="chip" data-l="convoy" aria-pressed="${cfg.convoy !== false}">Convoy</button>
          <button class="chip" data-l="vtc" aria-pressed="${cfg.vtc !== false}">Mi VTC</button>
          <button class="chip poi-chip" data-l="fuel" aria-pressed="${cfg.fuel}"><i style="background:#ffb547"></i>Gasolineras</button>
          <button class="chip poi-chip" data-l="rest" aria-pressed="${cfg.rest}"><i style="background:#6fb6ff"></i>Descanso</button>
          <button class="chip poi-chip" data-l="service" aria-pressed="${cfg.service}"><i style="background:#ff7a59"></i>Talleres</button>
          <button class="chip poi-chip" data-l="garage" aria-pressed="${cfg.garage}"><i style="background:#b07cff"></i>Garajes</button>
          <button class="chip poi-chip" data-l="company" aria-pressed="${cfg.company}"><i style="background:#4fd1a1"></i>Empresas</button>
          <button class="chip poi-chip" data-l="more" aria-pressed="${cfg.more}"><i style="background:#e5e55b"></i>Peajes y más</button>
        </div>
        <div class="map-tip hidden" id="mapTip"></div>
        <div class="map-info" id="mapInfo"></div>
        <div class="map-legend" id="mapLegend"><span><i style="background:var(--good)"></i>Fluido</span><span><i style="background:var(--warn)"></i>Denso</span><span><i style="background:var(--bad)"></i>Congestionado</span></div>
      </div>
      <section class="card" style="margin-top:16px" id="routeCard"></section>
      <section class="card" style="margin-top:16px"><h2>Amigos <button class="btn ghost" id="addFriend" style="padding:4px 10px">+ Añadir</button></h2><div class="list" id="friendList"><p class="muted">Añade a tus amigos por su ID de TruckersMP para verlos en el mapa.</p></div></section>`;

    const cv = $('#mapCv'), ctx = cv.getContext('2d');
    const resize = () => { const r = cv.getBoundingClientRect(); const d = devicePixelRatio || 1; cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); dirty = true; };
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const W = () => cv.width / (devicePixelRatio || 1), H = () => cv.height / (devicePixelRatio || 1);
    // Corrección de escala de Reino Unido/Irlanda usada por el mapa de TruckersMP (solo ETS2)
    const tf = (x, y) => (game === 'ets2' && y < -0.14 * x - 10040 && x < -30100 ? [0.75 * x - 8337, 0.75 * y - 1000] : [x, y]);
    const toS = (x, y, fix = true) => { if (fix) [x, y] = tf(x, y); return [(x - cam.x) * ppu + W() / 2, (y - cam.y) * ppu + H() / 2]; };
    const toW = (sx, sy) => [(sx - W() / 2) / ppu + cam.x, (sy - H() / 2) / ppu + cam.y];
    const cs = () => getComputedStyle(document.documentElement);

    function drawTiles() {
      const L = Math.max(1, Math.min(4, 1 + Math.floor(Math.log(0.256 / ppu) / Math.log(3))));
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (L < 4) drawLevel(L + 1);
      drawLevel(L);
    }
    function drawLevel(L) {
      const g = G();
      const [lv, step, o] = LEVELS[L - 1];
      const size = 1000 * Math.pow(3, lv - 1);
      const [x0, y0] = toW(0, 0), [x1, y1] = toW(W(), H());
      const aMin = Math.max(g.r.xMin, Math.floor((x0 - g.off.x - o - size / 2 - g.r.xMin * 0) / 1000) - step), aMax = Math.min(g.r.xMax, Math.ceil((x1 - g.off.x - o + size / 2) / 1000) + step);
      const iMin = Math.max(g.r.yMin, Math.floor((y0 - g.off.y - o - size / 2) / 1000) - step), iMax = Math.min(g.r.yMax, Math.ceil((y1 - g.off.y - o + size / 2) / 1000) + step);
      const suffix = lv > 1 ? `_${lv}` : '';
      for (let a = g.r.xMin + Math.ceil((aMin - g.r.xMin) / step) * step; a <= aMax; a += step) {
        for (let i = g.r.yMin + Math.ceil((iMin - g.r.yMin) / step) * step; i <= iMax; i += step) {
          const cx = 1000 * a + g.off.x + o, cy = 1000 * i + g.off.y + o;
          const [sx, sy] = toS(cx - size / 2, cy - size / 2, false);
          const sz = size * ppu;
          if (sx > W() || sy > H() || sx + sz < 0 || sy + sz < 0) continue;
          const url = `${g.url}/${a}_${i}${suffix}.png`;
          const e = img(url, () => { dirty = true; });
          if (e && e.ok) ctx.drawImage(e.im, sx, sy, sz + 0.5, sz + 0.5);
        }
      }
    }
    function draw() {
      raf = requestAnimationFrame(draw);
      if (!dirty) return; dirty = false;
      const C = cs();
      ctx.fillStyle = C.getPropertyValue('--bg2'); ctx.fillRect(0, 0, W(), H());
      drawTiles();
      const accent = C.getPropertyValue('--accent').trim(), accent2 = C.getPropertyValue('--accent2').trim(), text = C.getPropertyValue('--text').trim();
      // tráfico en tiempo real (mapa de calor)
      if (cfg.heat && heat.length) {
        const good = C.getPropertyValue('--good').trim(), warn = C.getPropertyValue('--warn').trim(), bad = C.getPropertyValue('--bad').trim();
        // Manchas suaves solo donde hay tráfico de verdad: el mapa sigue viéndose debajo
        const rad = Math.min(16, Math.max(2, 420 * ppu));
        for (const [x, y, v] of heat) {
          const q = v / heatMax; if (q < 0.1) continue;
          const [sx, sy] = toS(x, y); if (sx < -rad || sy < -rad || sx > W() + rad || sy > H() + rad) continue;
          ctx.globalAlpha = Math.min(0.55, 0.18 + q * 0.4);
          ctx.fillStyle = q > 0.5 ? bad : q > 0.22 ? warn : good;
          ctx.beginPath(); ctx.arc(sx, sy, rad * (0.6 + Math.min(1, q) * 0.6), 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // ruta recomendada (la más concurrida) y alternativa (la más corta)
      const R = S.navRoute;
      if (cfg.route && R && R.game === game) {
        const line = (pts, color, width, dash) => {
          if (!pts || pts.length < 2) return;
          ctx.setLineDash(dash || []); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = width + 4; ctx.beginPath();
          pts.forEach((p, i) => { const [x, y] = toS(p[0], p[1], false); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
          pts.forEach((p, i) => { const [x, y] = toS(p[0], p[1], false); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
        };
        const other = routeView === 'popular' ? R.fastest : R.popular;
        if (cfg.alt && other) line(other.points, C.getPropertyValue('--muted'), 3, [8, 7]);
        const full = (R[routeView] || R.popular || R.fastest).points;
        let from = 0;
        const tt = S.live?.truck; if (tt && (tt.x || tt.z)) { const [mx, my] = tf(tt.x, tt.z); let bd = Infinity; full.forEach((p, i) => { const d = Math.hypot(p[0] - mx, p[1] - my); if (d < bd) { bd = d; from = i; } }); }
        line(full.slice(Math.max(0, from - 1)), accent, 5);
        const cur = R[routeView] || R.popular || R.fastest;
        (cur.via || []).forEach((v, i) => {
          const [x, y] = toS(v.x, v.y);
          ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
          ctx.fillStyle = C.getPropertyValue('--accent-ink'); ctx.font = '700 11px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x, y + 4);
        });
      }
      // rutas propias
      if (cfg.trail && trail.length) {
        ctx.strokeStyle = accent2; ctx.globalAlpha = 0.75; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
        let pen = false;
        for (const p of trail) { if (!p) { pen = false; continue; } const [sx, sy] = toS(p[0], p[1]); pen ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); pen = true; }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      // puntos de interés (gasolineras, descanso, talleres, garajes, empresas…)
      if (ppu > 0.045 && locs.length) {
        const POI = { fuel: ['#ffb547', 'fuel'], rest: ['#6fb6ff', 'rest'], service: ['#ff7a59', 'service'], garage: ['#b07cff', 'garage'], company: ['#4fd1a1', 'company'], dealer: ['#e5e55b', 'more'], recruit: ['#e5e55b', 'more'], port: ['#43e0ff', 'more'], toll: ['#e5e55b', 'more'], weigh: ['#e5e55b', 'more'] };
        const GLY = { fuel: 'G', rest: 'P', service: 'T', garage: 'H', company: 'E', dealer: 'C', recruit: 'A', port: 'F', toll: '€', weigh: 'B' };
        const sz = ppu > 0.12 ? 16 : ppu > 0.06 ? 12 : 8;
        ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(sz * 0.62)}px Barlow, sans-serif`;
        for (const l of locs) {
          const m = POI[l.t]; if (!m || !cfg[m[1]]) continue;
          if (l.t === 'company' && ppu < 0.09) continue;
          const [sx, sy] = toS(l.x, l.y); if (sx < -20 || sy < -20 || sx > W() + 20 || sy > H() + 20) continue;
          ctx.fillStyle = m[0]; ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - sz / 2, sy - sz / 2, sz, sz, sz / 3.5) : ctx.rect(sx - sz / 2, sy - sz / 2, sz, sz); ctx.fill();
          ctx.globalAlpha = 1;
          if (sz >= 12) { ctx.fillStyle = '#0b1220'; ctx.fillText(GLY[l.t], sx, sy + sz * 0.22); }
        }
      }
      // jugadores (se mueven suavemente entre actualizaciones)
      if (cfg.layer) {
        const k = Math.min(1, (performance.now() - playersAt) / 3000);
        if (k < 1) dirty = true;
        ctx.fillStyle = C.getPropertyValue('--accent2'); ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = 1.5;
        const r = ppu > 0.08 ? 7 : ppu > 0.03 ? 5 : 2;
        for (const p of players) {
          const prev = prevPos.get(p[3]);
          const x = prev ? prev[0] + (p[0] - prev[0]) * k : p[0], y = prev ? prev[1] + (p[1] - prev[1]) * k : p[1];
          const [sx, sy] = toS(x, y); if (sx < -5 || sy < -5 || sx > W() + 5 || sy > H() + 5) continue;
          if (r >= 5) { ctx.beginPath(); ctx.arc(sx, sy, r / 1.6, 0, 7); ctx.fill(); ctx.stroke(); } else ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
        }
      }
      // ciudades
      // Solo países y ciudades (las empresas van aparte y con mucho zoom); los nombres que se
      // pisarían con otro ya dibujado se omiten para que el mapa no quede apretado
      const placed = [];
      const free = (x, y, w, h) => { for (const b of placed) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; placed.push([x, y, w, h]); return true; };
      const label = (txt, sx, sy, font, color) => {
        ctx.font = font; const w = ctx.measureText(txt).width + 8, h = parseInt(font.split(' ')[1]) + 6;
        if (!free(sx - w / 2, sy - h + 4, w, h)) return;
        ctx.lineWidth = 3; ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.strokeText(txt, sx, sy);
        ctx.fillStyle = color; ctx.fillText(txt, sx, sy);
      };
      if (cfg.labels) {
        ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        for (const l of locs) {
          if (l.t !== 'country' || ppu > 0.03) continue;
          const [sx, sy] = toS(l.x, l.y); if (sx < -60 || sy < -20 || sx > W() + 60 || sy > H() + 20) continue;
          label(l.n.toUpperCase(), sx, sy, '700 13px Barlow, sans-serif', C.getPropertyValue('--muted'));
        }
        if (ppu >= 0.012) for (const l of locs) {
          if (l.t !== 'city') continue;
          const [sx, sy] = toS(l.x, l.y); if (sx < -60 || sy < -20 || sx > W() + 60 || sy > H() + 20) continue;
          label(l.n, sx, sy, ppu > 0.06 ? '700 13px Barlow, sans-serif' : '600 12px Barlow, sans-serif', text);
        }
        if (ppu > 0.12 && cfg.company) for (const l of locs) {
          if (l.t !== 'company' || !l.n) continue;
          const [sx, sy] = toS(l.x, l.y); if (sx < -60 || sy < -20 || sx > W() + 60 || sy > H() + 20) continue;
          label(l.n, sx, sy + 20, '600 11px Barlow, sans-serif', C.getPropertyValue('--muted'));
        }
      }
      // amigos
      if (cfg.friends) for (const f of friends) if (f.online && f.x != null) {
        const [sx, sy] = toS(f.x, f.y);
        ctx.fillStyle = C.getPropertyValue('--good'); ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill();
        ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = text; ctx.font = '700 12px Barlow, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(f.name, sx + 9, sy + 4);
      }
      // compañeros de la VTC conectados a TruckersMP
      if (cfg.vtc !== false) for (const m of vtcMates) {
        const [sx, sy] = toS(m.x, m.y);
        ctx.fillStyle = accent2; ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(sx - 5, sy - 5, 10, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = '600 11px Barlow, sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeText(m.name, sx + 9, sy + 4); ctx.fillText(m.name, sx + 9, sy + 4);
      }
      // compañeros de convoy
      if (cfg.convoy !== false && S.convoy?.active) for (const m of S.convoy.members || []) if (m.x != null && !m.off) {
        const [sx, sy] = toS(m.x, m.z);
        ctx.fillStyle = m.color; ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = '700 12px Barlow, sans-serif'; ctx.textAlign = 'left';
        ctx.lineWidth = 3; ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.strokeText((m.leader ? '★ ' : '') + m.name, sx + 11, sy + 4); ctx.fillText((m.leader ? '★ ' : '') + m.name, sx + 11, sy + 4);
      }
      // destino del trabajo
      const t = S.live?.truck, j = S.live?.job;
      let pos = t && (t.x || t.z) ? [t.x, t.z] : me ? [me.x, me.y] : null;
      if (pos) {
        if (!smoothPos || Math.hypot(pos[0] - smoothPos[0], pos[1] - smoothPos[1]) > 3000) smoothPos = pos.slice();
        smoothPos[0] += (pos[0] - smoothPos[0]) * 0.18; smoothPos[1] += (pos[1] - smoothPos[1]) * 0.18;
        if (Math.hypot(pos[0] - smoothPos[0], pos[1] - smoothPos[1]) > 1) dirty = true;
        pos = smoothPos;
        if (cfg.follow) { [cam.x, cam.y] = tf(pos[0], pos[1]); }
      }
      const dest = j && j.onJob ? findCity(j.toCity, j.toCityId) : null;
      if (dest && pos && !(cfg.route && S.navRoute)) {
        const [ax, ay] = toS(pos[0], pos[1]), [bx, by] = toS(dest.x, dest.y);
        ctx.setLineDash([6, 6]); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.fill();
        ctx.fillStyle = text; ctx.font = '700 13px Barlow, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(j.toCity, bx + 10, by + 4);
      }
      // mi camión
      if (pos) {
        const [sx, sy] = toS(pos[0], pos[1]);
        const h = (t?.heading || 0) * Math.PI * 2, ang = Math.atan2(-Math.cos(h), -Math.sin(h));
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
        ctx.fillStyle = C.getPropertyValue('--accent-soft'); ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
        ctx.fillStyle = accent; ctx.strokeStyle = C.getPropertyValue('--bg'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // jugador bajo el puntero
      if (hover) { const [sx, sy] = toS(hover[0], hover[1]); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.stroke(); }
    }
    function findCity(name, id) {
      const learned = S.cities && (S.cities[String(id || '').toLowerCase()] || S.cities[String(name || '').toLowerCase()]);
      if (learned && learned.x != null) return { x: learned.x, y: learned.z };
      const n = normName(name);
      return locs.find((l) => l.t === 'city' && normName(l.n) === n) || null;
    }
    raf = requestAnimationFrame(draw);

    // interacción: arrastrar, rueda, pellizco
    const pts = new Map(); let pinch0 = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ppu }; } });
    cv.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) { hoverAt(e.offsetX, e.offsetY); return; }
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 2 && pinch0) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch0.ppu * d / pinch0.d) / ppu);
      } else if (pts.size === 1) {
        cam.x -= (e.offsetX - prev[0]) / ppu; cam.y -= (e.offsetY - prev[1]) / ppu; dirty = true;
        if (cfg.follow && Math.hypot(e.offsetX - prev[0], e.offsetY - prev[1]) > 2) setFollow(false);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('click', (e) => { hoverAt(e.offsetX, e.offsetY, true); });
    function zoomAt(sx, sy, f) {
      const [wx, wy] = toW(sx, sy);
      ppu = Math.max(0.0012, Math.min(0.9, ppu * f));
      if (!cfg.follow) { cam.x = wx - (sx - W() / 2) / ppu; cam.y = wy - (sy - H() / 2) / ppu; }
      dirty = true; LS.set('mapZoom', ppu);
    }
    ppu = LS.get('mapZoom', 0.02);
    const POI_NAME = { fuel: 'Gasolinera', rest: 'Área de descanso', service: 'Taller', garage: 'Garaje', company: 'Empresa', dealer: 'Concesionario', recruit: 'Agencia de empleo', port: 'Puerto de ferry', toll: 'Peaje', weigh: 'Báscula' };
    function poiAt(sx, sy) {
      if (ppu < 0.028) return null;
      let best = null, bd = 14;
      for (const l of locs) {
        if (!POI_NAME[l.t] || (l.t === 'company' && ppu < 0.06)) continue;
        const [x, y] = toS(l.x, l.y); const d = Math.hypot(x - sx, y - sy);
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    }
    function hoverAt(sx, sy, click) {
      if (!cfg.layer) {
        const poi = poiAt(sx, sy), tip = $('#mapTip');
        if (poi) { tip.classList.remove('hidden'); tip.style.left = sx + 12 + 'px'; tip.style.top = sy - 10 + 'px'; tip.innerHTML = `<b>${esc(poi.n || POI_NAME[poi.t])}</b><small>${esc(poi.n ? POI_NAME[poi.t] : (poi.c || ''))}</small>`; } else tip.classList.add('hidden');
        return;
      }
      let best = null, bd = 12;
      for (const p of players) { const [x, y] = toS(p[0], p[1]); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = p; } }
      if (best !== hover) { hover = best; dirty = true; }
      const tip = $('#mapTip');
      if (!best) {
        const poi = poiAt(sx, sy);
        if (poi) { tip.classList.remove('hidden'); tip.style.left = sx + 12 + 'px'; tip.style.top = sy - 10 + 'px'; tip.innerHTML = `<b>${esc(poi.n || POI_NAME[poi.t])}</b><small>${esc(poi.n ? POI_NAME[poi.t] : (poi.c || ''))}</small>`; return; }
      }
      if (best) {
        tip.classList.remove('hidden'); const [x, y] = toS(best[0], best[1]);
        tip.style.left = x + 12 + 'px'; tip.style.top = y - 10 + 'px';
        tip.innerHTML = `<b>${esc(best[4])}</b><small>ID ${best[3]}${click ? ' · <a href="https://truckersmp.com/user/' + best[3] + '" target="_blank" rel="noopener">Perfil</a> · <a href="#" data-addf="' + best[3] + '">Añadir amigo</a>' : ''}</small>`;
      } else tip.classList.add('hidden');
    }
    $('#mapTip').onclick = async (e) => { const a = e.target.closest('[data-addf]'); if (!a) return; e.preventDefault(); await addFriend(a.dataset.addf); };

    const setFollow = (v) => { cfg.follow = v; $('#mFollow').classList.toggle('primary', v); saveCfg(); if (v) centerMe(); };
    $('#mFollow').onclick = () => setFollow(!cfg.follow);
    $('#mZoomIn').onclick = () => zoomAt(W() / 2, H() / 2, 1.6);
    $('#mZoomOut').onclick = () => zoomAt(W() / 2, H() / 2, 1 / 1.6);
    $('#mLayers').onclick = (e) => { e.stopPropagation(); $('#mLayerPanel').classList.toggle('hidden'); };
    cv.addEventListener('pointerdown', () => $('#mLayerPanel')?.classList.add('hidden'));
    $$('.map-layers .chip', root).forEach((c) => (c.onclick = () => { cfg[c.dataset.l] = !cfg[c.dataset.l]; c.setAttribute('aria-pressed', cfg[c.dataset.l]); saveCfg(); dirty = true; }));
    $('#mapGame').onclick = async (e) => {
      const c = e.target.closest('[data-g]'); if (!c) return;
      game = c.dataset.g; cfg.game = game; saveCfg(); $$('#mapGame .chip').forEach((x) => x.setAttribute('aria-pressed', x === c));
      cam = { ...G().cam }; locs = []; dirty = true; loadLocs();
    };
    $('#mapServer').onchange = (e) => { cfg.server = e.target.value; saveCfg(); loadPlayers(); };
    const doSearch = () => {
      const q = normName($('#mapSearch').value);
      if (!q) return;
      const hit = locs.find((l) => l.t === 'city' && normName(l.n) === q) || locs.find((l) => (l.t === 'city' || l.t === 'company') && normName(l.n).startsWith(q));
      if (!hit) return toast('No encontrado', 'Prueba con otro nombre.', 'search', 'bad');
      setFollow(false); [cam.x, cam.y] = tf(hit.x, hit.y); ppu = Math.max(ppu, hit.t === 'city' ? 0.09 : 0.16); dirty = true;
      toast(hit.n, hit.t === 'city' ? 'Ciudad' : 'Empresa', 'mapa', 'alt');
    };
    $('#mapSearch').onchange = doSearch;
    $('#mapSearch').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
    const setOfficial = (v) => {
      cfg.official = v; saveCfg();
      const fr = $('#mapFrame'); if (!fr) return;
      if (v && !fr.src) fr.src = 'https://map.truckersmp.com/';
      fr.classList.toggle('hidden', !v); cv.classList.toggle('hidden', v);
      $$('.map-tools, .map-layers-btn, .map-legend, .map-info', root).forEach((x) => x.classList.toggle('hidden', v));
      $('#mapOfficial')?.setAttribute('aria-pressed', v);
    };
    if ($('#mapOfficial')) { $('#mapOfficial').onclick = () => setOfficial(!cfg.official); if (cfg.official) setOfficial(true); }

    function centerMe() {
      const t = S.live?.truck;
      if (t && (t.x || t.z)) { [cam.x, cam.y] = tf(t.x, t.z); dirty = true; }
      else if (me) { [cam.x, cam.y] = tf(me.x, me.y); dirty = true; }
    }
    // Guarda las posiciones anteriores para animar el movimiento hasta las nuevas
    let curServer = null;
    // Cada jugador conserva siempre su dato más reciente: el mapa completo llega con retraso y, si se
    // mezclaba sin más con la zona en tiempo real, los camiones saltaban hacia atrás y hacia delante
    function setPlayers(list, full) {
      const now = performance.now(), k = Math.min(1, (now - playersAt) / 3000);
      const old = new Map(players.map((p) => [p[3], p]));
      // posición que se está viendo ahora mismo (a mitad de animación)
      const shown = new Map(players.map((p) => { const pr = prevPos.get(p[3]); return [p[3], pr ? [pr[0] + (p[0] - pr[0]) * k, pr[1] + (p[1] - pr[1]) * k] : [p[0], p[1]]]; }));
      const next = new Map(full ? [] : old);
      for (const p of list) {
        const o = old.get(p[3]);
        next.set(p[3], o && (o[5] || 0) > (p[5] || 0) ? o : p);
      }
      prevPos = new Map();
      for (const [id, p] of next) {
        const s0 = shown.get(id);
        // solo se anima si el salto es pequeño (un ferry o un teletransporte aparecen directamente)
        if (s0 && Math.hypot(p[0] - s0[0], p[1] - s0[1]) < 1500) prevPos.set(id, s0);
      }
      players = [...next.values()]; playersAt = now; dirty = true;
    }
    // Jugadores de la zona que estás viendo, casi en tiempo real (cada 3 s)
    async function loadArea() {
      if (!cfg.layer || ppu < 0.02 || document.hidden) return;
      const [x1, y1] = toW(0, 0), [x2, y2] = toW(W(), H());
      try {
        let list;
        if (S.connected) list = (await api(`/api/map/area?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}&server=${cfg.server === 'auto' ? (curServer || 'auto') : cfg.server}`)).players;
        else { const q = `x1=${Math.round(x1)}&y1=${Math.round(y2)}&x2=${Math.round(x2)}&y2=${Math.round(y1)}&server=${curServer || 2}`; list = ((await directJson('https://tracker.ets2map.com/v3/area?' + q)).Data || []).map((p) => [p.X, p.Y, p.Heading, p.MpId, p.Name, p.Time || 0]); }
        // Los que estaban en la vista y ya no aparecen se han desconectado o se han ido
        const inView = new Set(list.map((p) => p[3]));
        const X1 = Math.min(x1, x2), X2 = Math.max(x1, x2), Y1 = Math.min(y1, y2), Y2 = Math.max(y1, y2);
        players = players.filter((p) => inView.has(p[3]) || !(p[0] >= X1 && p[0] <= X2 && p[1] >= Y1 && p[1] <= Y2));
        setPlayers(list, false);
      } catch {}
    }
    async function loadPlayers() {
      try {
        const r = await getPlayers(cfg.server);
        setPlayers(r.players, true); me = r.me; servers = r.servers; curServer = r.server;
        const sel = $('#mapServer'); if (!sel) return;
        const cur = cfg.server;
        sel.innerHTML = `<option value="auto">Mi servidor${r.me ? '' : ' (no conectado)'}</option>` + servers.map((s) => `<option value="${s.id}" ${String(s.id) === String(cur) ? 'selected' : ''}>${esc(s.name)} · ${s.players}</option>`).join('');
        $('#mapSub').textContent = `${n0(players.length)} jugadores en el mapa${me ? ' · estás conectado a TruckersMP' : ''}`;
        if (cfg.follow && !S.live?.truck?.x) centerMe();
        dirty = true;
      } catch (e) {
        // Plan B: pedirlo directamente desde la app
        try {
          const d = (await directJson('https://tracker.ets2map.com/v3/fullmap', 25000)).Data || [];
          players = d.filter((p) => p.ServerType !== 2).map((p) => [p.X, p.Y, p.Heading, p.MpId, p.Name, p.Time || 0]);
          $('#mapSub') && ($('#mapSub').textContent = `${n0(players.length)} jugadores en el mapa`); dirty = true;
        } catch (e2) { $('#mapSub') && ($('#mapSub').textContent = `Jugadores no disponibles ahora: ${e2.message}`); }
      }
    }
    async function loadVtc() { if (!S.connected) return; try { vtcMates = await api('/api/vtc/online'); dirty = true; } catch {} }
    async function loadHeat() {
      try {
        if (S.connected) { const r = await api(`/api/map/heat?game=${game}`); heat = r.cells; }
        else {
          // Sin PC: el mapa de calor se calcula con la instantánea de jugadores
          const cells = new Map();
          for (const p of players) { const k = Math.floor(p[0] / 1000) + ',' + Math.floor(p[1] / 1000); cells.set(k, (cells.get(k) || 0) + 1); }
          heat = [...cells].map(([k, v]) => { const [x, y] = k.split(','); return [(+x + 0.5) * 1000, (+y + 0.5) * 1000, v]; });
        }
        const vals = heat.map((h) => h[2]).sort((a, b) => a - b);
        heatMax = Math.max(1, vals[Math.floor(vals.length * 0.97)] || 1);
        dirty = true;
      } catch {}
    }
    async function loadRoute(force) {
      const j = S.live?.job;
      if (!S.connected || planning) return renderRoute();
      if (!j || !j.onJob) { if (!force) return renderRoute(); }
      const box = $('#routeCard'); if (box && force) box.querySelector('[data-rc]')?.setAttribute('disabled', '');
      try { S.navRoute = await api('/api/route', { timeout: 60000 }); emit('route'); }
      catch (e) { S.routeError = e.message; }
      renderRoute();
    }
    function renderRoute() {
      const box = $('#routeCard'); if (!box) return;
      const R = S.navRoute;
      const cityOpts = locs.filter((l) => l.t === 'city').map((l) => `<option value="${esc(l.n)}"></option>`).join('');
      const planner = `<div class="row wrap" style="gap:8px;margin-top:14px"><input class="input" list="cityList" id="rpFrom" placeholder="Origen (vacío = mi camión)" style="flex:1;min-width:150px">
        <input class="input" list="cityList" id="rpTo" placeholder="Destino" style="flex:1;min-width:150px"><button class="btn" id="rpGo">Ir aquí</button>${S.navRoute?.manual ? '<button class="btn ghost" id="rpClear">Quitar ruta</button>' : ''}<datalist id="cityList">${cityOpts}</datalist></div>`;
      if (!S.connected) { box.innerHTML = `<h2>Ruta recomendada</h2><p class="muted">Conecta con el PC para calcular rutas por las carreteras más concurridas.</p>`; return; }
      if (!R) {
        box.innerHTML = `<h2>Ruta recomendada</h2><p class="muted">${esc(S.routeError && S.live?.job?.onJob ? S.routeError : 'Cuando aceptes un trabajo calcularé por dónde pasa la ruta más concurrida de TruckersMP. También puedes planificar una ruta aquí.')}</p>${planner}`;
      } else {
        const P = R.popular, F = R.fastest, cur = R[routeView] || P || F;
        // Las distancias del mapa no están en km del juego: se escalan con la distancia real del GPS
        const navKm = S.live?.job?.onJob ? (S.live.nav?.distance || 0) / 1000 : 0;
        const estKm = (r) => (navKm > 0 && F && F.units > 0 ? U.dist(navKm * r.units / F.units, 0) : '—');
        box.innerHTML = `<h2>Ruta hacia ${esc(R.dest?.name || 'el destino')} <span class="row" style="gap:6px"><span class="chips" id="rvSeg">
            <button class="chip" data-v="popular" aria-pressed="${routeView === 'popular'}">Más concurrida</button><button class="chip" data-v="fastest" aria-pressed="${routeView === 'fastest'}">Más corta</button></span>
            <button class="btn ghost" data-rc style="padding:6px 10px" title="Recalcular">${ic('refresh')}</button></span></h2>
          <div class="grid g3 keep" style="gap:12px;margin-bottom:14px">
            <div class="kpi"><span class="v" style="font-size:26px">${estKm(cur)}</span><span class="l">Distancia estimada</span></div>
            <div class="kpi"><span class="v" style="font-size:26px">${P && F && F.crowd > 0 ? '×' + nf1.format(Math.max(1, P.crowd / F.crowd)) : '—'}</span><span class="l">Tráfico frente a la corta</span></div>
            <div class="kpi"><span class="v" style="font-size:26px">${P && F && F.units > 0 ? '+' + n0(Math.max(0, (P.units / F.units - 1) * 100)) + ' %' : '—'}</span><span class="l">Rodeo por ir acompañado</span></div>
          </div>
          ${cur.via?.length ? `<p class="muted" style="margin-bottom:8px">Pasa por estas ciudades, en este orden. Si tu GPS te manda por otro lado, guíate por ellas:</p>
          <div class="list">${cur.via.map((v, i) => `<div class="item"><span class="ico" style="font-weight:700">${i + 1}</span><span class="grow"><span class="t">${esc(v.name)}</span>${v.busy ? `<span class="s">${n0(v.busy)} jugadores ahora</span>` : ''}</span></div>`).join('')}
          <div class="item"><span class="ico good">${ic('check')}</span><span class="grow"><span class="t">${esc(R.dest?.name || 'Destino')}</span></span></div></div>`
          : '<p class="muted">La ruta más concurrida coincide con la directa: sigue tu GPS.</p>'}
          ${cur.offroad > 2000 ? '<p class="muted" style="font-size:13px;margin-top:8px">Incluye un tramo en ferry o sin carretera en el mapa.</p>' : ''}
          ${planner}`;
        $('#rvSeg').onclick = (e) => { const c = e.target.closest('[data-v]'); if (!c) return; routeView = c.dataset.v; dirty = true; renderRoute(); };
        box.querySelector('[data-rc]').onclick = () => { planning = false; loadRoute(true); };
      }
      if ($('#rpClear')) $('#rpClear').onclick = async () => { await post('/api/route/clear').catch(() => {}); S.navRoute = null; dirty = true; renderRoute(); };
      $('#rpGo').onclick = async () => {
        const find = (n) => locs.find((l) => l.t === 'city' && l.n.toLowerCase() === String(n).trim().toLowerCase());
        const to = find($('#rpTo').value); if (!to) return toast('Elige un destino de la lista', '', 'x', 'bad');
        let from = $('#rpFrom').value.trim() ? find($('#rpFrom').value) : null;
        if ($('#rpFrom').value.trim() && !from) return toast('Elige un origen de la lista', '', 'x', 'bad');
        const t = S.live?.truck;
        const fx = from ? from.x : t && (t.x || t.z) ? t.x : me?.x, fy = from ? from.y : t && (t.x || t.z) ? t.z : me?.y;
        if (fx == null) return toast('Indica un origen', 'No sé dónde está tu camión.', 'x', 'bad');
        $('#rpGo').disabled = true; $('#rpGo').textContent = 'Calculando…';
        try {
          planning = true;
          // Se guarda como ruta activa: aparece también en el mini mapa del overlay
          S.navRoute = await api('/api/route/manual', { method: 'POST', body: { game, fromX: from ? fx : '', fromY: from ? fy : '', toX: to.x, toY: to.y, toName: to.n }, timeout: 60000 });
          S.navRoute.manual = true;
          toast('Ruta activa', `Hacia ${to.n}: la verás en el mini mapa del overlay`, 'mapa', 'good');
          setFollow(false); const mid = S.navRoute.popular?.points || [];
          if (mid.length) { const xs = mid.map((p) => p[0]), ys = mid.map((p) => p[1]); cam.x = (Math.min(...xs) + Math.max(...xs)) / 2; cam.y = (Math.min(...ys) + Math.max(...ys)) / 2; ppu = Math.min(0.2, Math.min(W() / (Math.max(...xs) - Math.min(...xs) + 4000), H() / (Math.max(...ys) - Math.min(...ys) + 4000))); }
          dirty = true; renderRoute();
        } catch (e) { toast('No se pudo calcular', e.message, 'x', 'bad'); renderRoute(); }
      };
    }
    async function loadLocs() {
      try {
        locs = await getLocations(game); dirty = true; renderRoute();
        const dl = $('#mapSearchList');
        if (dl) dl.innerHTML = locs.filter((l) => l.t === 'city' || (l.t === 'company' && l.n)).slice(0, 2500).map((l) => `<option value="${esc(l.n)}">${l.t === 'city' ? esc(l.c || 'Ciudad') : 'Empresa'}</option>`).join('');
      } catch {}
    }
    async function loadTrail() {
      if (!S.connected) return;
      try { trail = (await api('/api/map/trail?max=25000')).trail || []; S.cities = await api('/api/map/cities'); dirty = true; } catch {}
    }
    async function loadFriends() {
      const list = $('#friendList'); if (!list) return;
      if (!S.connected) { list.innerHTML = '<p class="muted">Conecta con el PC para gestionar amigos.</p>'; return; }
      try { friends = await api('/api/friends'); } catch { friends = []; }
      list.innerHTML = friends.length ? friends.map((f) => `<div class="item"><img class="avatar sm" src="${esc(f.avatar || 'icon.png')}" alt="" loading="lazy">
        <span class="grow"><span class="t">${esc(f.name)}</span><span class="s">${f.online ? `En línea${f.dist != null ? ` · a ${n0(f.dist)} km de ti` : ''}` : 'Desconectado'}</span></span>
        <span class="dot ${f.online ? 'on' : ''}"></span>
        ${f.online ? `<button class="btn ghost" data-see="${f.id}" style="padding:6px 10px">Ver</button>` : ''}
        <button class="btn ghost" data-del="${f.id}" aria-label="Quitar amigo" style="padding:6px 8px">${ic('x')}</button></div>`).join('')
        : '<p class="muted">Añade a tus amigos por su ID de TruckersMP para verlos en el mapa.</p>';
      dirty = true;
    }
    async function addFriend(id) {
      id = String(id || '').replace(/\D/g, ''); if (!id) return;
      try {
        const p = await tmp('player', id);
        const list = [...(S.settings.friends || []), { id: p.id, name: p.name, avatar: p.smallAvatar || p.avatar }];
        S.settings = await post('/api/settings', { friends: list }); toast('Amigo añadido', p.name, 'vtc', 'good'); loadFriends();
      } catch (e) { toast('No se pudo añadir', e.message, 'x', 'bad'); }
    }
    $('#friendList').onclick = async (e) => {
      const see = e.target.closest('[data-see]'), del = e.target.closest('[data-del]');
      if (see) { const f = friends.find((x) => String(x.id) === see.dataset.see); if (f) { setFollow(false); [cam.x, cam.y] = tf(f.x, f.y); ppu = Math.max(ppu, 0.05); dirty = true; $('#main').scrollTo({ top: 0, behavior: 'smooth' }); } }
      if (del) { S.settings = await post('/api/settings', { friends: (S.settings.friends || []).filter((f) => String(f.id) !== del.dataset.del) }); loadFriends(); }
    };
    $('#addFriend').onclick = async () => {
      const id = await askInput({ title: 'Añadir amigo', text: 'Escribe su ID de TruckersMP (el número de truckersmp.com/user/…).', placeholder: 'Ej.: 1234567', ok: 'Añadir' });
      if (id) addFriend(id);
    };

    const onTel = () => {
      const t = S.live?.truck;
      if (t && (t.x || t.z)) {
        if (cfg.trail && S.live.sdk && !S.live.demo) { const last = trail[trail.length - 1]; if (!last || Math.hypot(t.x - last[0], t.z - last[1]) > 300) trail.push([Math.round(t.x), Math.round(t.z)]); }
        const info = $('#mapInfo');
        if (info) {
          const j = S.live.job;
          info.innerHTML = `<b class="num">${Math.round(U.speed(t.speed))} ${U.speedUnit()}</b>${j && j.onJob ? `<span>→ ${esc(j.toCity)} · ${U.dist(S.live.nav.distance / 1000, 0)}</span>` : '<span>Conducción libre</span>'}`;
        }
        dirty = true;
      }
    };
    if (cfg.follow) centerMe();
    loadLocs(); loadPlayers().then(loadHeat); loadTrail(); loadFriends(); renderRoute();
    if (S.live?.job?.onJob && !S.navRoute) loadRoute();
    loadVtc(); const iv5 = setInterval(loadVtc, 45000); const iv6 = setInterval(loadArea, 3000); const iv = setInterval(loadPlayers, 12000), iv2 = setInterval(loadFriends, 30000), iv3 = setInterval(loadHeat, 20000);
    let lastJobKey = null;
    const offs = [on('tel', onTel), on('theme', () => (dirty = true)), on('convoy', () => (dirty = true)), on('route', () => { dirty = true; renderRoute(); if (S.navRoute?.rerouted) toast('Ruta recalculada', 'Te habías salido de la ruta recomendada.', 'mapa', 'alt'); }),
      on('job', (d) => { if (d.phase !== 'started') { S.navRoute = null; renderRoute(); dirty = true; } }),
      on('tel', () => { const j = S.live?.job; const k = j && j.onJob ? j.toCity + j.cargo : null; if (k !== lastJobKey) { lastJobKey = k; if (k && !planning) loadRoute(); } }),
      on('conn', () => { loadPlayers(); loadTrail(); loadFriends(); loadHeat(); })];
    return () => { clearInterval(iv6); clearInterval(iv5); cancelAnimationFrame(raf); clearInterval(iv); clearInterval(iv2); clearInterval(iv3); ro.disconnect(); offs.forEach((f) => f()); };
  };

  // Mini mapa estático del recorrido de un trabajo (hoja de detalle)
  window.drawRouteMini = async function (canvas, path, gameKey = 'ets2', opts = {}) {
    if (!canvas || !path || path.length < 2) return false;
    const g = GAMES[gameKey] || GAMES.ets2;
    const r = canvas.getBoundingClientRect(); const d = devicePixelRatio || 1;
    canvas.width = r.width * d; canvas.height = r.height * d;
    const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    const tf = (x, y) => (gameKey === 'ets2' && y < -0.14 * x - 10040 && x < -30100 ? [0.75 * x - 8337, 0.75 * y - 1000] : [x, y]);
    const pts = path.filter(Boolean).map((p) => tf(p[0], p[1]));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = r.width, H = r.height, pad = 24;
    const ppu = Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY), 0.3);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const toS = (x, y) => [(x - cx) * ppu + W / 2, (y - cy) * ppu + H / 2];
    const C = getComputedStyle(document.documentElement);
    const paint = () => {
      ctx.fillStyle = C.getPropertyValue('--bg2'); ctx.fillRect(0, 0, W, H);
      const L = Math.max(1, Math.min(4, 1 + Math.floor(Math.log(0.256 / ppu) / Math.log(3))));
      const [lv, step, o] = LEVELS[L - 1]; const size = 1000 * Math.pow(3, lv - 1), suffix = lv > 1 ? `_${lv}` : '';
      for (let a = g.r.xMin; a <= g.r.xMax; a += step) for (let i = g.r.yMin; i <= g.r.yMax; i += step) {
        const tx = 1000 * a + g.off.x + o - size / 2, ty = 1000 * i + g.off.y + o - size / 2;
        const [sx, sy] = toS(tx, ty); const sz = size * ppu;
        if (sx > W || sy > H || sx + sz < 0 || sy + sz < 0) continue;
        const e = img(`${g.url}/${a}_${i}${suffix}.png`, () => requestAnimationFrame(paint));
        if (e.ok) ctx.drawImage(e.im, sx, sy, sz + 0.5, sz + 0.5);
      }
      ctx.strokeStyle = C.getPropertyValue('--accent'); ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Los huecos (null) separan tramos: ferris, trenes o cambios de partida
      ctx.beginPath(); let pen = false;
      for (const p of path) { if (!p) { pen = false; continue; } const [x, y] = toS(...tf(p[0], p[1])); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke();
      if (opts.noEnds) return;
      const [ax, ay] = toS(...pts[0]), [bx, by] = toS(...pts[pts.length - 1]);
      ctx.fillStyle = C.getPropertyValue('--accent2'); ctx.beginPath(); ctx.arc(ax, ay, 6, 0, 7); ctx.fill();
      ctx.fillStyle = C.getPropertyValue('--good'); ctx.beginPath(); ctx.arc(bx, by, 6, 0, 7); ctx.fill();
    };
    paint();
    return true;
  };
})();
