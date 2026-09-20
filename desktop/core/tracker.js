// Seguimiento de trabajos, kilómetros, combustible y eventos a partir de la telemetría
const { EventEmitter } = require('events');
const crypto = require('crypto');
const Score = require('./score');

class Tracker extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.live = null;
    this.status = { state: 'waiting', msg: '' };
    this.lastTs = 0; this.lastOdo = null; this.lastFuel = null; this.offJobSince = 0;
    this.demoCur = null; // en modo demostración nada se guarda en el historial
    this.lastPt = null;
    this.newSession();
  }
  newSession() { this.session = { start: Date.now(), km: 0, driveSec: 0, revenue: 0, jobs: 0, fines: 0, finesTotal: 0, xp: 0, fuel: 0 }; }
  get cur() { return this.demo ? this.demoCur : this.store.data.current; }
  set cur(v) { if (this.demo) this.demoCur = v; else this.store.data.current = v; }
  save(now) { if (!this.demo) this.store.save(now); }

  onStatus(s) {
    // Nueva sesión cada vez que el juego se vuelve a conectar tras un rato cerrado
    if (s.state === 'connected' && this.status.state !== 'connected' && Date.now() - (this.lastLive || 0) > 30 * 60000) this.newSession();
    this.status = s;
    this.emit('status', s);
    if (s.state !== 'connected') { this.lastOdo = null; this.lastFuel = null; }
  }

  startJob(j, t, partial) {
    this.cur = {
      id: crypto.randomUUID(), partial: !!partial, game: t.game, demo: !!t.demo,
      startedAt: Date.now(), cargo: j.cargo, cargoId: j.cargoId, mass: j.mass,
      fromCity: j.fromCity, fromCompany: j.fromCompany, toCity: j.toCity, toCompany: j.toCompany,
      fromCityId: j.fromCityId, toCityId: j.toCityId, income: j.income, market: j.market, special: j.special, deadline: j.deadline,
      truck: [t.truck.brand, t.truck.name].filter(Boolean).join(' '), trailer: t.trailer?.name || '',
      plate: t.truck.plate || '',
      drivenKm: 0, fuelUsed: 0, maxSpeed: 0, speedSum: 0, speedN: 0, speedingSec: 0,
      fines: [], tolls: 0, transport: 0, startDistance: t.nav?.distance || 0, cargoDamage: j.cargoDamage || 0,
      path: [[Math.round(t.truck.x), Math.round(t.truck.z)]], note: '', rating: 0, sc: Score.newState()
    };
    if (!partial) this.learnCity(j.fromCity, j.fromCityId, t);
    this.save();
    this.emit('job', { phase: 'started', job: this.cur });
  }

  finishJob(status, extra) {
    const c = this.cur; if (!c) return;
    const job = {
      ...c, status, endedAt: Date.now(),
      realMinutes: Math.round((Date.now() - c.startedAt) / 60000),
      avgSpeed: c.speedN ? c.speedSum / c.speedN : 0,
      finesTotal: c.fines.reduce((a, f) => a + (f.amount || 0), 0),
      ...extra
    };
    delete job.speedSum; delete job.speedN;
    // El recorrido se guarda simplificado: suficiente para el mini mapa y mucho más ligero
    if (Array.isArray(job.path) && job.path.length > 260) {
      const step = Math.ceil(job.path.length / 260);
      const last = job.path[job.path.length - 1];
      job.path = job.path.filter((_, i) => i % step === 0);
      if (job.path[job.path.length - 1] !== last) job.path.push(last);
    }
    if (c.sc) Object.assign(job, Score.compute(c.sc, { fines: c.fines.length, cargoDamage: job.cargoDamage || c.cargoDamage || 0 }));
    // Beneficio neto: ingresos menos combustible, peajes, ferris y multas
    const price = +(this.store.data.settings.costs?.fuelPrice ?? 1.6);
    job.fuelCost = Math.round((job.fuelUsed || 0) * price);
    job.net = Math.round((job.revenue || 0) - job.fuelCost - (job.tolls || 0) - (job.transport || 0) - (job.finesTotal || 0));
    delete job.sc;
    const km = job.distanceKm || job.drivenKm || 0;
    job.perKm = km > 0 && job.revenue > 0 ? job.revenue / km : 0;
    this.cur = null;
    if (status === 'delivered') {
      this.learnCity(job.toCity, job.toCityId, this.live);
      const S = this.session; S.jobs++; S.revenue += job.revenue || 0; S.xp += job.xp || 0;
    }
    if (!this.demo) {
      this.store.data.jobs.unshift(job);
      if (this.store.data.jobs.length > 3000) this.store.data.jobs.length = 3000;
      if (status === 'delivered') {
        const d = this.store.day();
        d.jobs += 1; d.revenue += job.revenue || 0; d.xp += job.xp || 0;
      }
      this.store.save(true);
    }
    this.emit('job', { phase: status, job });
  }

  learnCity(name, id, t) {
    if (this.demo || !name || !t || !t.truck) return;
    const k = String(id || name).toLowerCase();
    const c = this.store.data.cities[k] || { name, visits: 0 };
    c.name = name; c.x = Math.round(t.truck.x); c.z = Math.round(t.truck.z); c.visits++; c.last = Date.now();
    this.store.data.cities[k] = c;
  }

  onTel(t) {
    this.live = t;
    if (t.sdk) this.lastLive = Date.now();
    const now = Date.now();
    const dt = Math.min(1, (now - (this.lastTs || now)) / 1000);
    this.lastTs = now;
    if (!!t.demo !== !!this.demo) { this.demo = !!t.demo; this.lastOdo = null; this.lastFuel = null; this.offJobSince = 0; }
    if (!t.sdk) return;
    const tr = t.truck;
    const persist = !this.demo;
    const day = persist ? this.store.day() : null, tot = this.store.data.totals;

    if (!t.paused && tr.speed > 2) { this.session.driveSec += dt; if (persist) { tot.driveSec += dt; day.driveSec += dt; } }
    // Histogramas: velocidad (tramos de 10 km/h) y horas de conducción por día de la semana y hora
    if (persist && !t.paused && tr.speed > 2) {
      const H = this.store.data.hist || (this.store.data.hist = { speed: new Array(15).fill(0), hours: Array.from({ length: 7 }, () => new Array(24).fill(0)) });
      H.speed[Math.min(14, Math.floor(tr.speed / 10))] += dt;
      const n = new Date(); H.hours[(n.getDay() + 6) % 7][n.getHours()] += dt;
    }
    if (this.lastOdo != null) {
      const d = tr.odometer - this.lastOdo;
      if (d > 0 && d < 3) { this.session.km += d; if (persist) { tot.km += d; day.km += d; } if (this.cur) this.cur.drivenKm += d; }
    }
    // Rastro de rutas para el mapa: un punto cada ~300 m (un salto grande = ferry/tren/teletransporte → nuevo tramo)
    if (tr.x || tr.z) {
      const p = [Math.round(tr.x), Math.round(tr.z)];
      const lp = this.lastPt;
      const dd = lp ? Math.hypot(p[0] - lp[0], p[1] - lp[1]) : Infinity;
      if (dd > 300) {
        if (persist) {
          const trail = this.store.data.trail;
          if (dd > 5000) trail.push(null);
          trail.push(p);
          if (trail.length > 40000) trail.splice(0, trail.length - 40000);
        }
        if (this.cur) {
          const path = this.cur.path || (this.cur.path = []);
          const last = path[path.length - 1];
          if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 800) { path.push(p); if (path.length > 1500) path.splice(1, 2); }
        }
        this.lastPt = p;
      }
    }
    this.lastOdo = tr.odometer;
    if (this.lastFuel != null) {
      const f = this.lastFuel - tr.fuel;
      if (f > 0 && f < 2) { this.session.fuel += f; if (persist) { tot.fuel += f; day.fuel += f; } if (this.cur) this.cur.fuelUsed += f; }
    }
    this.lastFuel = tr.fuel;

    const j = t.job || {};
    if (j.onJob) {
      this.offJobSince = 0;
      if (!this.cur) this.startJob(j, t, true);
      const c = this.cur;
      if (!t.paused && tr.speed > 2) {
        c.maxSpeed = Math.max(c.maxSpeed, tr.speed);
        c.speedSum += tr.speed; c.speedN++;
        if (t.nav?.limit > 0 && tr.speed > t.nav.limit + 5) c.speedingSec += dt;
      }
      // La ruta del GPS puede tardar unos segundos en calcularse al aceptar el trabajo
      if ((t.nav?.distance || 0) > (c.startDistance || 0)) c.startDistance = t.nav.distance;
      if (j.cargoDamage != null) c.cargoDamage = j.cargoDamage;
      if (!c.sc) c.sc = Score.newState();
      Score.sample(c.sc, t, dt);
    } else if (this.cur) {
      if (!this.offJobSince) this.offJobSince = now;
      else if (now - this.offJobSince > 15000) {
        // El trabajo terminó sin evento (cambio de perfil, etc.)
        if (this.cur.drivenKm > 1) this.finishJob('interrupted', {});
        else { this.cur = null; this.save(); }
        this.offJobSince = 0;
      }
    }
    this.save();
  }

  onEv(e) {
    const t = this.live;
    if (!!e.demo !== !!this.demo) { this.demo = !!e.demo; }
    const persist = !this.demo;
    const day = persist ? this.store.day() : null;
    const base = { id: crypto.randomUUID(), at: Date.now(), type: e.type };
    switch (e.type) {
      case 'job_started':
        if (this.cur && this.cur.fromCity === e.job.fromCity && this.cur.toCity === e.job.toCity && this.cur.cargo === e.job.cargo) break;
        this.cur = null;
        if (t) this.startJob(e.job, t, false);
        break;
      case 'job_delivered': {
        if (!this.cur && t) this.startJob(e.job, t, true);
        this.finishJob('delivered', {
          revenue: e.revenue, xp: e.xp, distanceKm: e.distanceKm, cargoDamage: e.cargoDamage,
          autoParked: e.autoParked, autoLoaded: e.autoLoaded, gameMinutes: e.deliveryMinutes
        });
        this.pushEvent({ ...base, amount: e.revenue, xp: e.xp, text: `${e.job.fromCity} → ${e.job.toCity}` });
        break;
      }
      case 'job_cancelled':
        if (!this.cur && t) this.startJob(e.job, t, true);
        this.finishJob('cancelled', { penalty: e.penalty, revenue: -Math.abs(e.penalty || 0) });
        this.pushEvent({ ...base, amount: -Math.abs(e.penalty || 0), text: `${e.job.fromCity} → ${e.job.toCity}` });
        break;
      case 'fined':
        if (day) day.fines += e.amount || 0;
        this.session.fines++; this.session.finesTotal += e.amount || 0;
        if (this.cur) this.cur.fines.push({ amount: e.amount, offence: e.offence, at: Date.now() });
        this.pushEvent({ ...base, amount: -(e.amount || 0), offence: e.offence });
        break;
      case 'tollgate':
        if (this.cur) this.cur.tolls += e.amount || 0;
        this.pushEvent({ ...base, amount: -(e.amount || 0) });
        break;
      case 'ferry': case 'train':
        if (this.cur) this.cur.transport += e.amount || 0;
        this.pushEvent({ ...base, amount: -(e.amount || 0), text: `${e.from} → ${e.to}` });
        break;
      case 'refuel':
        this.pushEvent({ ...base, liters: e.liters });
        break;
    }
    this.save();
    this.emit('ev', e);
  }

  pushEvent(ev) {
    if (this.demo) return;
    const list = this.store.data.events;
    list.unshift(ev);
    if (list.length > 5000) list.length = 5000;
  }
}
Tracker.prototype.liveScore = function () {
  const c = this.cur; if (!c || !c.sc) return null;
  return Score.compute(c.sc, { fines: c.fines.length, cargoDamage: c.cargoDamage || 0 });
};
module.exports = Tracker;
