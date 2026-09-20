// Lanza el puente de telemetría (Windows) o un simulador de demostración
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const Demo = require('./demo');

class Bridge extends EventEmitter {
  constructor(resourcesDir) {
    super();
    this.resourcesDir = resourcesDir; this.proc = null; this.demo = null; this.stopped = true;
    this.retry = null; this.fails = 0;
  }

  start(demo) {
    this.stop();
    this.stopped = false;
    if (demo || process.platform !== 'win32') return this.startDemo();
    const exe = path.join(this.resourcesDir, 'bin', 'XitoTelemetryBridge.exe');
    if (!fs.existsSync(exe)) { this.emit('status', { t: 'status', state: 'error', msg: 'No se encuentra el puente de telemetría' }); return; }
    let p;
    try {
      // stderr se ignora: si se acumulara sin leerse podría bloquear el proceso
      p = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      p.stdin.on('error', () => {});
    } catch (e) {
      this.emit('status', { t: 'status', state: 'error', msg: e.message });
      return this.scheduleRetry();
    }
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      if (this.proc !== p) return;
      let m; try { m = JSON.parse(line); } catch { return; }
      this.fails = 0;
      if (m.t === 'tel') this.emit('tel', m);
      else if (m.t === 'ev') this.emit('ev', m);
      else if (m.t === 'status') { if (m.state === 'keyerror') this.emit('keyerror', m.msg); else this.emit('status', m); }
    });
    p.on('error', () => {});
    p.on('exit', () => {
      // Solo reinicia si este sigue siendo el proceso activo (evita puentes duplicados)
      if (this.proc !== p) return;
      this.proc = null;
      this.emit('status', { t: 'status', state: 'waiting', msg: 'Reiniciando telemetría' });
      if (!this.stopped) this.scheduleRetry();
    });
  }
  scheduleRetry() {
    clearTimeout(this.retry);
    this.fails++;
    const wait = Math.min(30000, 3000 * this.fails);
    this.retry = setTimeout(() => { if (!this.stopped) this.start(false); }, wait);
  }
  // Botonera: envía una tecla al juego (a través del puente, que usa códigos de escaneo)
  sendKey(k, a = 'tap') {
    if (this.demo || !this.proc || process.platform !== 'win32') { this.emit('key', { k, a, simulated: true }); return false; }
    try { this.proc.stdin.write(JSON.stringify({ k, a }) + '\n'); this.emit('key', { k, a }); return true; } catch { return false; }
  }
  startDemo() {
    this.demo = new Demo();
    this.demo.on('tel', (t) => this.emit('tel', t));
    this.demo.on('ev', (e) => this.emit('ev', e));
    this.emit('status', { t: 'status', state: 'connected', msg: 'Modo demostración' });
    this.demo.start();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    const p = this.proc; this.proc = null;
    if (p) { try { p.kill(); } catch {} }
    if (this.demo) { this.demo.stop(); this.demo = null; }
  }
  restart(demo) {
    this.stop();
    this.emit('status', { t: 'status', state: 'waiting', msg: demo ? 'Iniciando demostración' : 'Esperando al juego' });
    setTimeout(() => this.start(demo), 400);
  }
}
module.exports = Bridge;
