// Simulador de conducción para probar el HUB sin el juego
const { EventEmitter } = require('events');
// [origen, empresa, destino, empresa, carga, kg, km, [x, z origen], [x, z destino]]
const ROUTES = [
  ['Madrid', 'Transinet', 'Valencia', 'Tradeaux', 'Palets de azulejos', 18200, 355, [-65898, 48203], [-52433, 56537]],
  ['Barcelona', 'Aria Food', 'Lyon', 'Chimi', 'Productos lácteos', 14100, 640, [-40360, 47102], [-24478, 24958]],
  ['Madrid', 'Fui Mare', 'Málaga', 'Posped', 'Aceite de oliva', 21300, 530, [-65898, 48203], [-74294, 68210]],
  ['Bilbao', 'Lintech', 'Bordeaux', 'Stokes', 'Piezas de motor', 9800, 320, [-58855, 32583], [-46189, 27204]],
  ['Zaragoza', 'Sellplan', 'Madrid', 'Kaarfor', 'Fruta fresca', 16500, 315, [-51575, 43274], [-65898, 48203]]
];
const OFFENCES = ['Speeding', 'Speeding_camera', 'Red_signal', 'No_lights', 'Crash'];

class Demo extends EventEmitter {
  constructor() { super(); this.timer = null; this.reset(); this.odo = 184320; this.fuel = 540; this.gameTime = 12 * 60; }
  reset() {
    this.r = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    this.dist = this.r[6] * 1000; this.total = this.dist; this.speed = 0; this.gear = 0; this.onJob = true; this.startedEv = false;
    this.damage = 0.01; this.limit = 90; this.tick = 0;
  }
  start() { this.timer = setInterval(() => this.step(), 200); }
  stop() { clearInterval(this.timer); }
  job() {
    const r = this.r;
    return { onJob: this.onJob, cargo: r[4], cargoId: 'demo', mass: r[5], cargoDamage: this.damage, units: 1,
      fromCity: r[0], fromCompany: r[1], toCity: r[2], toCompany: r[3], income: Math.round(r[6] * 58),
      special: false, market: 'freight_market', loaded: true, deadline: this.gameTime + 900, remainingMin: 800 };
  }
  step() {
    this.tick++;
    if (!this.startedEv) { this.startedEv = true; this.emit('ev', { demo: true, t: 'ev', type: 'job_started', job: this.job() }); }
    if (this.tick % 150 === 0) this.limit = [50, 60, 80, 90, 100, 120][Math.floor(Math.random() * 6)];
    const target = Math.min(this.limit + 6, 90) * (0.85 + 0.2 * Math.sin(this.tick / 40));
    this.speed += (target - this.speed) * 0.04;
    this.gear = Math.max(1, Math.min(12, Math.round(this.speed / 7.5)));
    const ms = this.speed / 3.6 * 0.2 * 18; // tiempo acelerado x18
    this.dist = Math.max(0, this.dist - ms);
    this.odo += ms / 1000;
    this.fuel = Math.max(40, this.fuel - ms / 1000 * 0.33);
    this.gameTime += 0.06;
    if (Math.random() < 0.002) this.emit('ev', { demo: true, t: 'ev', type: 'fined', amount: 250 + Math.round(Math.random() * 1000), offence: OFFENCES[Math.floor(Math.random() * OFFENCES.length)] });
    if (Math.random() < 0.002) this.emit('ev', { demo: true, t: 'ev', type: 'tollgate', amount: 30 + Math.round(Math.random() * 90) });
    if (Math.random() < 0.004) this.damage = Math.min(0.2, this.damage + 0.003);
    const prog = 1 - this.dist / this.total, A = this.r[7], B = this.r[8];
    const wob = Math.sin(this.tick / 60) * 400;
    const px = A[0] + (B[0] - A[0]) * prog + wob * 0.3, pz = A[1] + (B[1] - A[1]) * prog + wob * 0.2;
    const heading = (Math.atan2(-(B[0] - A[0]), -(B[1] - A[1])) / (Math.PI * 2) + 1) % 1;
    const t = {
      t: 'tel', demo: true, game: 'Ets2', sdk: true, paused: false, gameTime: Math.round(this.gameTime), restStop: 540, mpOffset: 0,
      truck: { brand: 'Scania', name: 'S 730', plate: '4812 XTD', plateCountry: 'España', speed: this.speed, cruise: this.speed > 70,
        cruiseSpeed: 85, rpm: 900 + (this.speed % 7.5) * 120, rpmMax: 2500, gear: this.gear, fwdGears: 12,
        fuel: this.fuel, fuelCap: 1400, fuelAvg: 0.33, fuelRange: this.fuel / 0.33, adblue: 70, adblueCap: 90,
        odometer: this.odo, oilTemp: 88, waterTemp: 82, oilPressure: 4.2, battery: 26.5, air: 128, parking: false,
        engineBrake: false, retarder: 0, engineOn: true, electricOn: true,
        lights: { low: true, high: false, beacon: false, left: false, right: false, hazard: false, parking: true },
        warn: { fuel: false, air: false, adblue: false, oil: false, water: false, battery: false },
        damage: { engine: 0.02, transmission: 0.01, cabin: 0.03, chassis: 0.02, wheels: 0.04 }, x: px, z: pz, heading },
      trailer: { attached: true, name: 'Lona', brand: 'Krone', plate: '', damage: { body: 0.02, cargo: this.damage, chassis: 0.01, wheels: 0.02 } },
      nav: { distance: this.dist, time: this.dist / 22, limit: this.limit },
      input: { throttle: 0.4, brake: 0, clutch: 0 },
      job: this.job()
    };
    this.emit('tel', t);
    if (this.dist <= 0 && this.onJob) {
      this.onJob = false;
      this.emit('ev', { demo: true, t: 'ev', type: 'job_delivered', job: this.job(), revenue: this.job().income, xp: Math.round(this.r[6] * 3.2),
        distanceKm: this.r[6], cargoDamage: this.damage, autoParked: false, autoLoaded: false, deliveryMinutes: 700 });
      setTimeout(() => this.reset(), 4000);
    }
  }
}
module.exports = Demo;
