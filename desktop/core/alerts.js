// Avisos de conducción: descanso, combustible, velocidad, daños y logros
const { EventEmitter } = require('events');
const { achievements } = require('./stats');

class Alerts extends EventEmitter {
  constructor(store, tracker) {
    super();
    this.store = store; this.tracker = tracker;
    this.last = {}; this.overSince = 0; this.lastDamage = null; this.restStage = null; this.fuelWarned = false;
    this.revSince = 0; this.flags = {}; this.arrived = false;
    tracker.on('telemetry', (t) => this.onTel(t));
    tracker.on('job', (j) => { if (j.phase === 'delivered') setTimeout(() => this.checkAchievements(), 1500); });
    tracker.on('status', (s) => { if (s.state !== 'connected') { this.lastDamage = null; this.overSince = 0; } });
  }
  get cfg() { return this.store.data.settings.alerts || {}; }
  fire(id, title, text, level = 'warn', cooldown = 60000, extra = {}) {
    if (Date.now() - (this.last[id] || 0) < cooldown) return;
    this.last[id] = Date.now();
    this.emit('alert', { id, title, text, level, at: Date.now(), ...extra });
  }
  // Mensajes del «sistema» del camión (como los avisos del propio juego): se disparan una vez al cruzar un umbral
  sys(id, cond, title, text, level = 'warn') {
    if (cond && !this.flags[id]) { this.flags[id] = true; this.emit('alert', { id: 'sys-' + id, kind: 'sys', title, text, level, at: Date.now() }); }
    else if (!cond) this.flags[id] = false;
  }
  onTel(t) {
    if (!t || !t.sdk || t.paused) return;
    const c = this.cfg, tr = t.truck;
    // Descanso: aviso a 60 y 15 minutos de juego
    if (c.rest !== false && t.restStop > 0) {
      const first = Math.max(20, +c.restMinutes || 60);
      const stage = t.restStop <= 15 ? 15 : t.restStop <= first ? first : null;
      if (stage && stage !== this.restStage) {
        this.fire('rest' + (stage === 15 ? 15 : 'first'), stage === 15 ? 'Necesitas descansar ya' : `Descanso en menos de ${first >= 60 && first % 60 === 0 ? (first / 60) + (first === 60 ? ' hora' : ' horas') : first + ' minutos'}`,
          stage === 15 ? 'Busca un área de servicio para dormir.' : 'Ve pensando dónde parar a dormir.', stage === 15 ? 'bad' : 'warn', 30 * 60000);
      }
      this.restStage = stage;
    }
    // Combustible: autonomía baja (se reinicia al repostar)
    if (c.fuel !== false && tr.fuelCap > 0) {
      const lowKm = Math.max(20, +c.fuelKm || 120);
      const low = tr.fuelRange > 0 ? tr.fuelRange < lowKm : tr.fuel / tr.fuelCap < 0.12;
      if (low && !this.fuelWarned) { this.fuelWarned = true; this.fire('fuel', 'Combustible bajo', `Autonomía de unos ${Math.round(tr.fuelRange || 0)} km. Busca una gasolinera.`, 'warn', 10 * 60000); }
      if (tr.fuel / tr.fuelCap > 0.3) this.fuelWarned = false;
    }
    // Velocidad: más de 8 km/h por encima del límite durante 4 segundos
    const lim = t.nav?.limit || 0;
    const tol = Math.max(1, +c.speedTolerance || 8);
    if (c.speeding !== false && lim > 0 && tr.speed > lim + tol) {
      if (!this.overSince) this.overSince = Date.now();
      else if (Date.now() - this.overSince > 4000) this.fire('speed', 'Exceso de velocidad', `Vas a ${Math.round(tr.speed)} km/h en una vía de ${Math.round(lim)}.`, 'bad', 90000);
    } else this.overSince = 0;
    // Daños: salto brusco en el camión o la carga
    const dmg = Math.max(tr.damage.engine, tr.damage.transmission, tr.damage.cabin, tr.damage.chassis, tr.damage.wheels, t.job?.cargoDamage || 0);
    if (c.damage !== false && this.lastDamage != null && dmg - this.lastDamage > Math.max(1, +c.damageJump || 3) / 100) {
      this.fire('damage', 'Has sufrido daños', `Daño máximo ahora: ${Math.round(dmg * 100)} %`, 'bad', 20000);
    }
    this.lastDamage = dmg;

    // ---- mensajes del sistema ----
    if (c.system !== false) {
      const w = tr.warn || {}, D = tr.damage || {};
      this.sys('dmg15', dmg >= 0.15 && dmg < 0.4, 'Vehículo dañado', `Daño del ${Math.round(dmg * 100)} %. Pasa por un taller cuando puedas.`, 'warn');
      this.sys('dmg40', dmg >= 0.4, 'Vehículo muy dañado', `Daño del ${Math.round(dmg * 100)} %. Repara el camión cuanto antes.`, 'bad');
      this.sys('engine', (D.engine || 0) >= 0.3, 'Fallo en el motor', 'El motor está muy dañado: puede perder potencia.', 'bad');
      this.sys('trans', (D.transmission || 0) >= 0.3, 'Fallo en la transmisión', 'La caja de cambios está dañada.', 'bad');
      this.sys('wheels', (D.wheels || 0) >= 0.3, 'Neumáticos desgastados', 'Revisa las ruedas en un taller.', 'warn');
      this.sys('cargo', (t.job?.cargoDamage || 0) >= 0.1, 'Carga dañada', `La carga tiene un ${Math.round((t.job.cargoDamage || 0) * 100)} % de daño: cobrarás menos.`, 'warn');
      this.sys('air', !!w.air, 'Presión de aire baja', 'No arranques hasta que se recupere la presión de frenos.', 'bad');
      this.sys('oil', !!w.oil, 'Presión de aceite baja', 'Detén el motor y revisa el camión.', 'bad');
      this.sys('water', !!w.water, 'Temperatura del motor alta', 'El motor se está calentando.', 'warn');
      this.sys('battery', !!w.battery, 'Batería baja', 'El voltaje de la batería es bajo.', 'warn');
      this.sys('adblue', !!w.adblue, 'AdBlue bajo', 'Rellena AdBlue en la próxima gasolinera.', 'warn');
      this.sys('parkmove', tr.parking && (t.input?.throttle || 0) > 0.3 && tr.speed < 1, 'Freno de estacionamiento puesto', 'Quita el freno de mano para arrancar.', 'info');
      const j = t.job, dist = t.nav?.distance || 0;
      const near = !!(j && j.onJob && dist > 0 && dist < 3000);
      this.sys('arrive', near, 'Llegando a destino', `${j?.toCompany || ''} en ${j?.toCity || ''}: quedan menos de 3 km.`, 'good');
      this.sys('late', !!(j && j.onJob && j.deadline > 0 && t.gameTime > 0 && j.deadline - t.gameTime < 60 && j.deadline - t.gameTime > 0), 'Vas justo de tiempo', 'Queda menos de 1 hora de juego para entregar a tiempo.', 'warn');
    }

    // ---- normas de TruckersMP ----
    if (c.rules !== false) {
      const ats = String(t.game).toLowerCase() === 'ats';
      const [from, to] = ats ? [20, 6] : [21, 5];
      const hour = Math.floor(((t.gameTime || 0) % 1440) / 60), min = (t.gameTime || 0) % 60;
      const night = hour >= from || hour < to;
      const soon = hour === from - 1 && min >= 50;
      const lightsOn = tr.lights?.low || tr.lights?.high;
      if (tr.speed > 3 && !lightsOn && night)
        this.fire('rule-lights', 'Norma TruckersMP: enciende las luces', `Las luces son obligatorias de ${from}:00 a ${String(to).padStart(2, '0')}:00 en ${ats ? 'ATS' : 'ETS2'}.`, 'bad', 120000, { rule: '§2.x' });
      else if (soon && !lightsOn && tr.speed > 3)
        this.fire('rule-lights-soon', 'Pronto necesitarás las luces', `A las ${from}:00 serán obligatorias en TruckersMP.`, 'warn', 600000);
      // Marcha atrás rápida (§2.5 conducción temeraria)
      if (tr.gear < 0 && tr.speed > 15) {
        if (!this.revSince) this.revSince = Date.now();
        else if (Date.now() - this.revSince > 3000) this.fire('rule-reverse', 'Norma TruckersMP §2.5', 'Circular marcha atrás a esa velocidad se considera conducción temeraria.', 'bad', 120000);
      } else this.revSince = 0;
      // Exceso de velocidad claro (§2.5)
      if (lim > 0 && tr.speed > lim + 25) this.fire('rule-speed', 'Norma TruckersMP §2.5', `Vas ${Math.round(tr.speed - lim)} km/h por encima del límite: el exceso puede influir en una sanción.`, 'bad', 180000);
      // Golpe fuerte con jugadores alrededor → recordar «Remolcar al taller» (§2.3)
      if (this.traffic && this.lastBigHit !== undefined && dmg - this.lastBigHit > 0.08 && (this.traffic.nearby?.around || 0) >= 3)
        this.fire('rule-tow', 'Si has quedado bloqueando la vía', 'Usa «Remolcar al taller» (F7 → Enter → opción 1) para no molestar a otros jugadores.', 'warn', 180000);
      this.lastBigHit = dmg;
      // Convoyes en Calais–Duisburg (§2.6)
      const cd = (this.traffic?.nearby?.server?.top || []).some((h) => /calais|duisburg/i.test(h.name));
      if (cd && (this.traffic?.nearby?.around || 0) > 40) this.fire('rule-cd', 'Zona C-D muy concurrida', 'Recuerda: no se permiten convoyes de más de 5 jugadores en Calais–Duisburg (§2.6).', 'info', 1800000);
    }
  }
  checkAchievements(silent = false) {
    const got = new Set(this.store.data.achievements);
    for (const a of achievements(this.store.data)) {
      if (a.done && !got.has(a.id)) {
        this.store.data.achievements.push(a.id);
        if (!silent) this.emit('alert', { id: 'ach-' + a.id, title: 'Logro desbloqueado', text: a.name, level: 'good', at: Date.now(), achievement: a.id });
      }
    }
    this.store.save();
  }
}
module.exports = Alerts;
