// Cálculo de estadísticas, rangos y logros a partir del historial
const { dayKey, emptyDay } = require('./store');
const Score = require('./score');

const RANKS = [
  [0, 'Aprendiz'], [1000, 'Conductor'], [5000, 'Camionero'], [15000, 'Profesional'],
  [40000, 'Veterano'], [100000, 'Rey de la carretera'], [250000, 'Leyenda']
];
function rank(km) {
  let i = 0; while (i + 1 < RANKS.length && km >= RANKS[i + 1][0]) i++;
  const cur = RANKS[i], next = RANKS[i + 1];
  return { name: cur[1], level: i + 1, from: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null,
    progress: next ? (km - cur[0]) / (next[0] - cur[0]) : 1 };
}
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
function top(map, n = 6) { return Object.entries(map).filter(([k]) => k && k !== 'undefined').sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, value: v })); }
const isPerfect = (j) => j.status === 'delivered' && (j.cargoDamage || 0) < 0.005 && !(j.finesTotal > 0);

// ---------- logros ----------
const ACH = [
  { id: 'first', name: 'Primer porte', desc: 'Completa tu primera entrega', goal: 1, v: (s) => s.delivered },
  { id: 'jobs10', name: 'Cogiendo ritmo', desc: 'Completa 10 entregas', goal: 10, v: (s) => s.delivered },
  { id: 'jobs50', name: 'Profesional del transporte', desc: 'Completa 50 entregas', goal: 50, v: (s) => s.delivered },
  { id: 'jobs100', name: 'Centenario', desc: 'Completa 100 entregas', goal: 100, v: (s) => s.delivered },
  { id: 'jobs500', name: 'Incansable', desc: 'Completa 500 entregas', goal: 500, v: (s) => s.delivered },
  { id: 'km1k', name: 'Mil kilómetros', desc: 'Conduce 1.000 km', goal: 1000, v: (s) => s.km },
  { id: 'km10k', name: 'Diez mil', desc: 'Conduce 10.000 km', goal: 10000, v: (s) => s.km },
  { id: 'km50k', name: 'Media vuelta al mundo', desc: 'Conduce 50.000 km', goal: 50000, v: (s) => s.km },
  { id: 'km100k', name: 'Cien mil', desc: 'Conduce 100.000 km', goal: 100000, v: (s) => s.km },
  { id: 'perfect1', name: 'Impecable', desc: 'Una entrega sin daños ni multas', goal: 1, v: (s) => s.perfect },
  { id: 'perfect25', name: 'Guante blanco', desc: '25 entregas perfectas', goal: 25, v: (s) => s.perfect },
  { id: 'streak10', name: 'Conductor ejemplar', desc: '10 entregas seguidas sin multas', goal: 10, v: (s) => s.cleanStreakBest },
  { id: 'long', name: 'Larga distancia', desc: 'Una entrega de más de 1.500 km', goal: 1500, v: (s) => s.longest },
  { id: 'heavy', name: 'Peso pesado', desc: 'Transporta más de 30 t en un viaje', goal: 30, v: (s) => s.heaviest },
  { id: 'money1m', name: 'Millonario', desc: 'Gana 1.000.000 en total', goal: 1000000, v: (s) => s.revenue },
  { id: 'cities25', name: 'Trotamundos', desc: 'Entrega en 25 ciudades distintas', goal: 25, v: (s) => s.cities },
  { id: 'ferry10', name: 'Lobo de mar', desc: 'Usa el ferry 10 veces', goal: 10, v: (s) => s.ferries },
  { id: 'hours100', name: 'Horas de carretera', desc: 'Pasa 100 horas al volante', goal: 100, v: (s) => s.hours },
  { id: 'aplus1', name: 'Matrícula de honor', desc: 'Consigue una nota A+ en una entrega', goal: 1, v: (s) => s.aplus },
  { id: 'aplus10', name: 'Conducción de libro', desc: '10 entregas con nota A+', goal: 10, v: (s) => s.aplus },
  { id: 'real50', name: 'Camionero de verdad', desc: '50 entregas en modo Real', goal: 50, v: (s) => s.real },
  { id: 'lvl5', name: 'Profesional acreditado', desc: 'Alcanza el nivel 5 de conductor', goal: 5, v: (s) => s.level }
];
function achievementState(data) {
  const del = data.jobs.filter((j) => j.status === 'delivered');
  // Mejor racha de entregas sin multas (de la más antigua a la más reciente)
  let streak = 0, best = 0;
  for (const j of [...del].reverse()) { if (j.finesTotal > 0) streak = 0; else best = Math.max(best, ++streak); }
  return {
    delivered: del.length, km: data.totals.km, perfect: del.filter(isPerfect).length, cleanStreakBest: best,
    longest: Math.max(0, ...del.map((j) => j.distanceKm || j.drivenKm || 0)),
    heaviest: Math.max(0, ...del.map((j) => (j.mass || 0) / 1000)),
    revenue: sum(del, (j) => j.revenue), cities: new Set(del.map((j) => j.toCity)).size,
    ferries: data.events.filter((e) => e.type === 'ferry').length, hours: data.totals.driveSec / 3600,
    aplus: del.filter((j) => j.grade === 'A+').length, real: del.filter((j) => j.mode === 'real').length,
    level: Score.driverLevel(sum(del, (j) => j.score || 0)).level
  };
}
function achievements(data) {
  const s = achievementState(data);
  return ACH.map((a) => {
    const val = a.v(s);
    return { id: a.id, name: a.name, desc: a.desc, goal: a.goal, value: val, done: val >= a.goal, progress: Math.min(1, val / a.goal) };
  });
}

// ---------- estadísticas por periodo ----------
const RANGES = { '7': 7, '30': 30, '365': 365, all: null };
function compute(data, range = 'all') {
  const days = RANGES[range] === undefined ? null : RANGES[range];
  const since = days ? Date.now() - days * 864e5 : 0;
  const jobs = data.jobs.filter((j) => (j.endedAt || 0) >= since);
  const events = data.events.filter((e) => (e.at || 0) >= since);
  const del = jobs.filter((j) => j.status === 'delivered');
  const cities = {}, cargos = {}, companies = {}, offences = {}, trucks = {};
  for (const j of del) {
    cities[j.toCity] = (cities[j.toCity] || 0) + 1;
    cargos[j.cargo] = (cargos[j.cargo] || 0) + 1;
    if (j.fromCompany) companies[j.fromCompany] = (companies[j.fromCompany] || 0) + 1;
    if (j.truck) trucks[j.truck] = (trucks[j.truck] || 0) + 1;
  }
  const fines = events.filter((e) => e.type === 'fined');
  for (const f of fines) offences[f.offence] = (offences[f.offence] || 0) + 1;

  // Totales de conducción: del contador global o sumando los días del periodo
  let km = data.totals.km, driveSec = data.totals.driveSec, fuel = data.totals.fuel;
  if (days) {
    km = 0; driveSec = 0; fuel = 0;
    for (let i = 0; i < days; i++) {
      const d = data.days[dayKey(Date.now() - i * 864e5)];
      if (d) { km += d.km; driveSec += d.driveSec; fuel += d.fuel; }
    }
  }

  // Serie para el gráfico: diaria (7/30 días) o mensual (año / todo)
  const series = [];
  if (days && days <= 30) {
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKey(Date.now() - i * 864e5);
      series.push({ date: k, label: `${+k.slice(8)}/${+k.slice(5, 7)}`, ...(data.days[k] || emptyDay()) });
    }
  } else {
    const keys = Object.keys(data.days).sort();
    const first = keys.length ? new Date(keys[0] + 'T12:00:00') : new Date();
    const now = new Date();
    let months = days ? 12 : Math.min(36, Math.max(6, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1));
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    for (let i = months - 1; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const pref = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const agg = emptyDay();
      for (const k of keys) if (k.startsWith(pref)) for (const f of Object.keys(agg)) agg[f] += data.days[k][f] || 0;
      series.push({ date: pref, label: `${MES[m.getMonth()]}${m.getMonth() === 0 ? ' ' + String(m.getFullYear()).slice(2) : ''}`, ...agg });
    }
  }
  const best = (f) => del.reduce((b, j) => (!b || f(j) > f(b) ? j : b), null);
  const revenue = sum(del, (j) => j.revenue);
  const jobKm = sum(del, (j) => j.distanceKm || j.drivenKm);
  return {
    range,
    totals: {
      km, driveSec, fuel,
      delivered: del.length, cancelled: jobs.filter((j) => j.status === 'cancelled').length,
      revenue, xp: sum(del, (j) => j.xp),
      finesTotal: sum(fines, (f) => -f.amount), finesCount: fines.length,
      tolls: sum(events.filter((e) => e.type === 'tollgate'), (e) => -e.amount),
      jobKm, mass: sum(del, (j) => j.mass) / 1000,
      avgDamage: del.length ? sum(del, (j) => j.cargoDamage) / del.length : 0,
      avgRevenue: del.length ? revenue / del.length : 0,
      perKm: jobKm > 0 ? revenue / jobKm : 0,
      consumption: km > 0 ? (fuel / km) * 100 : 0,
      perfect: del.filter(isPerfect).length,
      avgScore: (() => { const sc = del.filter((j) => j.score != null); return sc.length ? Math.round(sum(sc, (j) => j.score) / sc.length) : null; })(),
      net: sum(del.filter((j) => j.net != null), (j) => j.net), fuelCost: sum(del, (j) => j.fuelCost || 0),
      real: del.filter((j) => j.mode === 'real').length, race: del.filter((j) => j.mode === 'race').length,
      realKm: sum(del.filter((j) => j.mode === 'real'), (j) => j.distanceKm || j.drivenKm), raceKm: sum(del.filter((j) => j.mode === 'race'), (j) => j.distanceKm || j.drivenKm)
    },
    driver: Score.driverLevel(sum(data.jobs.filter((j) => j.status === 'delivered'), (j) => j.score || 0)),
    rank: rank(data.totals.km),
    days: series,
    top: { cities: top(cities), cargos: top(cargos), companies: top(companies), offences: top(offences), trucks: top(trucks, 4) },
    records: {
      longest: best((j) => j.distanceKm || j.drivenKm || 0),
      richest: best((j) => j.revenue || 0),
      heaviest: best((j) => j.mass || 0),
      fastest: best((j) => j.maxSpeed || 0)
    },
    achievements: achievements(data),
    goals: goals(data),
    calendar: calendar(data),
    fleet: fleet(data)
  };
}
// Progreso de objetivos (día y semana de lunes a domingo)
function goals(data) {
  const g = data.settings.goals || {};
  const now = new Date();
  const today = data.days[dayKey(now)] || emptyDay();
  const dow = (now.getDay() + 6) % 7;
  const week = emptyDay();
  for (let i = 0; i <= dow; i++) { const d = data.days[dayKey(Date.now() - i * 864e5)]; if (d) for (const k of Object.keys(week)) week[k] += d[k] || 0; }
  const item = (id, name, value, goal, unit) => ({ id, name, value, goal: goal || 0, unit, progress: goal > 0 ? Math.min(1, value / goal) : 0 });
  return [
    item('dailyKm', 'Kilómetros hoy', today.km, g.dailyKm, 'km'),
    item('weeklyKm', 'Kilómetros esta semana', week.km, g.weeklyKm, 'km'),
    item('weeklyRevenue', 'Ingresos esta semana', week.revenue, g.weeklyRevenue, 'money'),
    item('weeklyJobs', 'Entregas esta semana', week.jobs, g.weeklyJobs, 'n')
  ].filter((x) => x.goal > 0);
}
// Actividad del último año para el calendario tipo «contribuciones»
function calendar(data) {
  const out = [];
  for (let i = 370; i >= 0; i--) { const k = dayKey(Date.now() - i * 864e5); const d = data.days[k]; out.push([k, d ? Math.round(d.km) : 0, d ? d.jobs : 0]); }
  return out;
}
// Flujo de los últimos 7 días (como el widget de finanzas del juego)
function finance(data) {
  const price = +(data.settings.costs?.fuelPrice ?? 1.6);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(Date.now() - i * 864e5), d = data.days[k] || emptyDay();
    days.push({ date: k, revenue: Math.round(d.revenue), fines: Math.round(d.fines), fuel: Math.round(d.fuel * price), net: Math.round(d.revenue - d.fines - d.fuel * price) });
  }
  return { days, week: days.reduce((a, d) => a + d.net, 0), today: days[6].net };
}
// Mis camiones (por matrícula o modelo)
function fleet(data) {
  const m = {};
  for (const j of data.jobs.filter((x) => x.status === 'delivered')) {
    const k = j.plate || j.truck || 'Camión';
    const f = m[k] || (m[k] = { key: k, truck: j.truck, plate: j.plate || '', jobs: 0, km: 0, revenue: 0, fuel: 0, scoreSum: 0, scoreN: 0, last: 0 });
    f.jobs++; f.km += j.distanceKm || j.drivenKm || 0; f.revenue += j.revenue || 0; f.fuel += j.fuelUsed || 0;
    if (j.score != null) { f.scoreSum += j.score; f.scoreN++; }
    f.last = Math.max(f.last, j.endedAt || 0);
  }
  return Object.values(m).map((f) => ({ ...f, avgScore: f.scoreN ? Math.round(f.scoreSum / f.scoreN) : null, consumption: f.km ? (f.fuel / f.km) * 100 : 0 })).sort((a, b) => b.km - a.km);
}
module.exports = { compute, rank, achievements, goals, calendar, finance, fleet };
