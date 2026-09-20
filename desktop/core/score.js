// Puntuación de conducción (0-100) y clasificación del viaje: «Real» o «Carrera»
const GRADES = [[95, 'A+'], [88, 'A'], [78, 'B'], [65, 'C'], [50, 'D'], [0, 'E']];
const grade = (s) => GRADES.find(([min]) => s >= min)[1];

function newState() {
  return { driveSec: 0, speedingSec: 0, severeSec: 0, maxOver: 0, harshBrakes: 0, harshAccel: 0, truckDmg0: null, truckDmg: 0, lastSpeed: null, lastHarsh: 0 };
}
// Se llama con cada lectura de telemetría durante un trabajo
function sample(st, t, dt) {
  const tr = t.truck, lim = t.nav?.limit || 0, now = Date.now();
  const dmg = Math.max(tr.damage.engine, tr.damage.transmission, tr.damage.cabin, tr.damage.chassis, tr.damage.wheels);
  if (st.truckDmg0 == null) st.truckDmg0 = dmg;
  st.truckDmg = Math.max(0, dmg - st.truckDmg0);
  if (!t.paused && tr.speed > 2) {
    st.driveSec += dt;
    if (lim > 0) {
      const over = tr.speed - lim;
      if (over > 5) st.speedingSec += dt;
      if (over > 20) st.severeSec += dt;
      if (over > st.maxOver) st.maxOver = over;
    }
  }
  if (st.lastSpeed != null && dt > 0.05 && dt < 1 && !t.paused) {
    const acc = (tr.speed - st.lastSpeed) / dt; // km/h por segundo
    if (now - st.lastHarsh > 3000) {
      if (acc < -14 && st.lastSpeed > 25) { st.harshBrakes++; st.lastHarsh = now; }
      else if (acc > 9) { st.harshAccel++; st.lastHarsh = now; }
    }
  }
  st.lastSpeed = tr.speed;
}
function compute(st, { fines = 0, cargoDamage = 0 } = {}) {
  const pct = st.driveSec > 30 ? (st.speedingSec / st.driveSec) * 100 : 0;
  const pen = [
    ['Exceso de velocidad', Math.min(30, pct * 1.2)],
    ['Exceso grave (más de 20 km/h)', Math.min(15, st.severeSec / 10)],
    ['Multas', Math.min(30, fines * 8)],
    ['Daño de la carga', Math.min(25, cargoDamage * 250)],
    ['Daños del camión', Math.min(20, st.truckDmg * 200)],
    ['Frenazos bruscos', Math.min(10, st.harshBrakes * 1.5)],
    ['Acelerones', Math.min(5, st.harshAccel)]
  ].filter(([, v]) => v >= 0.5).map(([n, v]) => ({ name: n, points: Math.round(v) }));
  const score = Math.max(0, Math.min(100, Math.round(100 - pen.reduce((a, p) => a + p.points, 0))));
  const mode = pct > 15 || st.maxOver > 30 ? 'race' : 'real';
  return { score, grade: grade(score), mode, speedingPct: Math.round(pct), maxOver: Math.round(st.maxOver), harshBrakes: st.harshBrakes, penalties: pen };
}
// Nivel del conductor a partir de la suma de puntuaciones
const LEVELS = ['Novato', 'Aprendiz', 'Conductor', 'Conductor experto', 'Profesional', 'Maestro de la carretera', 'Élite', 'Leyenda viva'];
function driverLevel(points) {
  let lvl = 0, need = 500, acc = 0;
  while (points >= acc + need && lvl < LEVELS.length - 1) { acc += need; lvl++; need = Math.round(need * 1.8); }
  return { level: lvl + 1, name: LEVELS[lvl], points, from: acc, next: lvl < LEVELS.length - 1 ? acc + need : null, progress: lvl < LEVELS.length - 1 ? (points - acc) / need : 1 };
}
module.exports = { newState, sample, compute, grade, driverLevel };
