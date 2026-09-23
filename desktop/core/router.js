// Rutas recomendadas: lee las carreteras de las teselas del mapa y busca el camino
// más concurrido (según el tráfico de TruckersMP) y el más corto, con A*.
const { PNG } = require('pngjs');

const GAMES = {
  ets2: { url: 'https://map-cdn.krashnz.com/ets2map/ets2/v1.60', off: { x: -22, y: -22 }, r: { xMin: -100, xMax: 88, yMin: -124, yMax: 91 } },
  promods: { url: 'https://map-cdn.krashnz.com/ets2map/promods/v2.80', off: { x: -145, y: -18 }, r: { xMin: -144, xMax: 206, yMin: -166, yMax: 130 } },
  ats: { url: 'https://map-cdn.krashnz.com/ets2map/ats-promods/v1.6.3', off: { x: -18, y: -18 }, r: { xMin: -122, xMax: 39, yMin: -88, yMax: 100 } }
};
// Niveles de tesela: [nivel, paso entre índices, desplazamiento, lado en unidades]
const LEVELS = { 3: [3, 9, 4000, 9000], 4: [4, 27, 13000, 27000] };
// Misma corrección de escala de Reino Unido que usa el mapa de TruckersMP
const tf = (game, x, y) => (game === 'ets2' && y < -0.14 * x - 10040 && x < -30100 ? [0.75 * x - 8337, 0.75 * y - 1000] : [x, y]);

const tileCache = new Map();
async function tile(game, a, i, lv) {
  const key = `${game}:${a}:${i}:${lv}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    try {
      const r = await fetch(`${GAMES[game].url}/${a}_${i}_${lv}.png`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('png')) return null;
      const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      return { w: png.width, h: png.height, data: png.data };
    } catch { return null; }
  })();
  tileCache.set(key, p);
  if (tileCache.size > 120) tileCache.delete(tileCache.keys().next().value);
  const v = await p;
  if (!v) tileCache.delete(key);
  return v;
}

// Montículo binario mínimo para A*
class Heap {
  constructor(n) { this.k = new Int32Array(n); this.p = new Float64Array(n); this.n = 0; }
  push(k, p) {
    let i = this.n++;
    if (i >= this.k.length) { const k2 = new Int32Array(this.k.length * 2); k2.set(this.k); this.k = k2; const p2 = new Float64Array(this.p.length * 2); p2.set(this.p); this.p = p2; }
    while (i > 0) { const j = (i - 1) >> 1; if (this.p[j] <= p) break; this.k[i] = this.k[j]; this.p[i] = this.p[j]; i = j; }
    this.k[i] = k; this.p[i] = p;
  }
  pop() {
    const top = this.k[0], lk = this.k[--this.n], lp = this.p[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && this.p[c + 1] < this.p[c]) c++;
      if (this.p[c] >= lp) break;
      this.k[i] = this.k[c]; this.p[i] = this.p[c]; i = c;
    }
    this.k[i] = lk; this.p[i] = lp;
    return top;
  }
}

async function buildGrid(game, A, B) {
  const g = GAMES[game];
  const span = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]));
  const margin = Math.max(6000, span * 0.25);
  const x0 = Math.min(A[0], B[0]) - margin, x1 = Math.max(A[0], B[0]) + margin;
  const y0 = Math.min(A[1], B[1]) - margin, y1 = Math.max(A[1], B[1]) + margin;
  // Se usan teselas detalladas siempre que el trayecto no sea enorme: así la ruta se ciñe a las carreteras
  const tilesAt = (step, sz) => Math.ceil((x1 - x0 + sz) / (step * 1000)) * Math.ceil((y1 - y0 + sz) / (step * 1000));
  const useFine = tilesAt(LEVELS[3][1], LEVELS[3][3]) <= 110;
  const [lv, STEP, OFF, SIZE] = useFine ? LEVELS[3] : LEVELS[4];
  let C = useFine ? 60 : 70;
  while (((x1 - x0) / C) * ((y1 - y0) / C) > 4.5e6) C *= 1.4;
  const W = Math.ceil((x1 - x0) / C), H = Math.ceil((y1 - y0) / C);
  const road = new Uint8Array(W * H);
  // Teselas que tocan el área
  const idx = (min, max, off, lo, hi) => { const out = []; for (let a = min; a <= max; a += STEP) { const c = 1000 * a + off + OFF; if (c + SIZE / 2 >= lo && c - SIZE / 2 <= hi) out.push(a); } return out; };
  const as = idx(g.r.xMin, g.r.xMax, g.off.x, x0, x1), is = idx(g.r.yMin, g.r.yMax, g.off.y, y0, y1);
  if (as.length * is.length > 180) throw new Error('La ruta es demasiado larga para calcularla');
  const tiles = await Promise.all(as.flatMap((a) => is.map(async (i) => ({ a, i, t: await tile(game, a, i, lv) }))));
  for (const { a, i, t } of tiles) {
    if (!t) continue;
    const tx = 1000 * a + g.off.x + OFF - SIZE / 2, ty = 1000 * i + g.off.y + OFF - SIZE / 2;
    const sx = SIZE / t.w, sy = SIZE / t.h;
    for (let py = 0; py < t.h; py++) {
      const wy = ty + py * sy; if (wy < y0 || wy >= y1) continue;
      const gy = ((wy - y0) / C) | 0;
      for (let px = 0; px < t.w; px++) {
        const o = (py * t.w + px) * 4;
        if (t.data[o + 3] < 90) continue;
        const lum = t.data[o] + t.data[o + 1] + t.data[o + 2];
        if (lum < 330) continue;
        const wx = tx + px * sx; if (wx < x0 || wx >= x1) continue;
        road[gy * W + (((wx - x0) / C) | 0)] = 1;
      }
    }
  }
  // Se engordan las carreteras un poco para cerrar los huecos de los cruces y los trazos finos
  const fat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!road[y * W + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H) fat[Y * W + X] = 1;
    }
  }
  return { x0, y0, C, W, H, road: fat };
}

function snap(G, x, y) {
  const cx = Math.max(0, Math.min(G.W - 1, ((x - G.x0) / G.C) | 0)), cy = Math.max(0, Math.min(G.H - 1, ((y - G.y0) / G.C) | 0));
  for (let r = 0; r < 60; r++) {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= G.W || Y >= G.H) continue;
      if (G.road[Y * G.W + X]) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = Y * G.W + X; } }
    }
    if (best >= 0) return best;
  }
  return cy * G.W + cx;
}

// weight(celda) → coste de recorrer la celda; fuera de carretera es muy caro (ferris, huecos del mapa)
function astar(G, s, t, weight, minW) {
  const N = G.W * G.H, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = t % G.W, ty = (t / G.W) | 0;
  const h = (k) => { const dx = (k % G.W) - tx, dy = ((k / G.W) | 0) - ty; return Math.sqrt(dx * dx + dy * dy) * minW; };
  const heap = new Heap(1 << 16);
  gs[s] = 0; heap.push(s, h(s));
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let it = 0;
  while (heap.n) {
    const k = heap.pop();
    if (k === t) break;
    if (closed[k]) continue; closed[k] = 1;
    if (++it > 6e6) break;
    const x = k % G.W, y = (k / G.W) | 0;
    for (const [dx, dy, d] of D) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= G.W || Y >= G.H) continue;
      const n = Y * G.W + X; if (closed[n]) continue;
      const c = gs[k] + d * weight(n);
      if (c < gs[n]) { gs[n] = c; from[n] = k; heap.push(n, c + h(n)); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const path = []; for (let k = t; k >= 0; k = from[k]) { path.push(k); if (k === s) break; }
  return path.reverse();
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, md = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; idx = i; } }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

async function route({ game = 'ets2', from, to, heat = [], cities = [], hot = [] }, opts = {}) {
  const A = tf(game, from[0], from[1]), B = tf(game, to[0], to[1]);
  const G = await buildGrid(game, A, B);
  // Mapa de calor (jugadores recientes) proyectado sobre la rejilla
  const hv = new Float32Array(G.W * G.H);
  const spread = Math.max(1, Math.round(1000 / G.C / 2));
  let hmax = 0;
  for (const [wx, wy, v] of heat) {
    const [x, y] = tf(game, wx, wy);
    const cx = ((x - G.x0) / G.C) | 0, cy = ((y - G.y0) / G.C) | 0;
    if (cx < -spread || cy < -spread || cx >= G.W + spread || cy >= G.H + spread) continue;
    for (let dy = -spread; dy <= spread; dy++) for (let dx = -spread; dx <= spread; dx++) {
      const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= G.W || Y >= G.H) continue;
      const k = Y * G.W + X; hv[k] += v; if (hv[k] > hmax) hmax = hv[k];
    }
  }
  const norm = hmax > 0 ? 1 / Math.min(hmax, 40) : 0;
  const s = snap(G, A[0], A[1]), t = snap(G, B[0], B[1]);
  const OFFROAD = 400, ALPHA = 5; // salirse de la carretera sale carísimo: solo para ferris y huecos del mapa
  const wFast = (k) => (G.road[k] ? 1 : OFFROAD);
  const wPop = (k) => (G.road[k] ? 1 / (1 + ALPHA * Math.min(1, hv[k] * norm)) : OFFROAD);
  const toPts = (p) => p.map((k) => [G.x0 + ((k % G.W) + 0.5) * G.C, G.y0 + (((k / G.W) | 0) + 0.5) * G.C]);
  const describe = (p) => {
    if (!p) return null;
    const pts = toPts(p);
    let len = 0, crowd = 0, off = 0;
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len += d;
      crowd += hv[p[i]] * d; if (!G.road[p[i]]) off += d;
    }
    const simple = simplify(pts, G.C * 1.2).map(([x, y]) => [Math.round(x), Math.round(y)]);
    // Ciudades por las que pasa (en orden), para marcarlas en el GPS
    const via = [];
    const cm = cities.map((c) => ({ ...c, m: tf(game, c.x, c.y) }));
    for (const c of cm) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < pts.length; i += 3) { const d = Math.hypot(pts[i][0] - c.m[0], pts[i][1] - c.m[1]); if (d < best) { best = d; bi = i; } }
      const dStart = Math.hypot(c.m[0] - A[0], c.m[1] - A[1]), dEnd = Math.hypot(c.m[0] - B[0], c.m[1] - B[1]);
      if (best < 1800 && dStart > 3000 && dEnd > 3000) via.push({ name: c.n, at: bi, x: c.x, y: c.y, busy: (hot.find((h) => h.name === c.n) || {}).players || 0 });
    }
    via.sort((a, b) => a.at - b.at);
    return { points: simple, units: Math.round(len), crowd: len > 0 ? crowd / (len / 1000) : 0, offroad: Math.round(off), via: via.slice(0, 12).map(({ at, ...v }) => v) };
  };
  const popular = describe(astar(G, s, t, wPop, 1 / (1 + ALPHA)));
  const fastest = describe(astar(G, s, t, wFast, 1));
  if (!popular && !fastest) throw new Error('No se encontró un camino por carretera');
  // Rutas alternativas para adivinar cuál sigue el GPS del juego (se elige la que cuadra con su distancia)
  const alts = [];
  if (opts.alternatives && G.W * G.H < 1.6e6) {
    // Alternativas de verdad: se penalizan las carreteras ya usadas por las rutas anteriores
    const pen = new Uint8Array(G.W * G.H);
    const mark = (path) => { for (const k of path) { const x = k % G.W, y = (k / G.W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < G.W && Y < G.H) pen[Y * G.W + X] = 1; } } };
    let last = astar(G, s, t, wFast, 1);
    for (let i = 0; i < 3 && last; i++) {
      mark(last);
      const w = (k) => (G.road[k] ? (pen[k] ? 2.2 : 1) : OFFROAD);
      last = astar(G, s, t, w, 1);
      const d = describe(last);
      if (d && !alts.some((a) => Math.abs(a.units - d.units) < 300) && Math.abs(d.units - (fastest?.units || 0)) > 300) alts.push(d);
    }
  }
  return { game, popular, fastest, alts, heatCells: heat.length, grid: { cell: G.C, w: G.W, h: G.H } };
}
module.exports = { route, tf };
