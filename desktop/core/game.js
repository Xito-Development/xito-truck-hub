// Detecta si ETS2/ATS está abierto y lanza el juego o el launcher de TruckersMP
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const EXES = { 'eurotrucks2.exe': 'ets2', 'amtrucks.exe': 'ats' };
const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { windowsHide: true, maxBuffer: 4e6 }, (e, out) => res(e ? '' : String(out))));

class Game extends EventEmitter {
  constructor() { super(); this.state = { running: false, game: null, tmp: false }; this.timer = null; }
  start() {
    const tick = async () => {
      if (process.platform === 'win32') {
        const out = (await run('tasklist', ['/FO', 'CSV', '/NH'])).toLowerCase();
        let game = null;
        for (const [exe, g] of Object.entries(EXES)) if (out.includes(`"${exe}"`)) game = g;
        // TruckersMP se carga dentro del propio juego: se detecta por su módulo (core_ets2mp.dll / core_atsmp.dll)
        let tmp = out.includes('truckersmp');
        if (game && !tmp) {
          const mod = game === 'ats' ? 'core_atsmp.dll' : 'core_ets2mp.dll';
          const m = (await run('tasklist', ['/M', mod, '/FO', 'CSV', '/NH'])).toLowerCase();
          tmp = m.includes('.exe');
        }
        const next = { running: !!game, game, tmp };
        if (next.running !== this.state.running || next.game !== this.state.game || next.tmp !== this.state.tmp) { this.state = next; this.emit('change', next); }
      }
      this.timer = setTimeout(tick, 8000);
    };
    tick();
  }
  stop() { clearTimeout(this.timer); }

  async findLauncher() {
    if (process.platform !== 'win32') return null;
    const la = process.env.LOCALAPPDATA || '', pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const cands = [
      path.join(la, 'Programs', 'TruckersMP Launcher', 'TruckersMP Launcher.exe'),
      path.join(la, 'Programs', 'truckersmp-launcher', 'TruckersMP Launcher.exe'),
      path.join(la, 'Programs', 'TruckersMP Launcher', 'TruckersMP-Launcher.exe'),
      path.join(la, 'TruckersMP Launcher', 'TruckersMP-Launcher.exe'),
      path.join(pf, 'TruckersMP Launcher', 'TruckersMP-Launcher.exe'),
      path.join(pf86, 'TruckersMP Launcher', 'TruckersMP-Launcher.exe')
    ];
    const hit = cands.find((c) => fs.existsSync(c));
    if (hit) return hit;
    // Busca en los programas instalados del registro
    for (const hive of ['HKCU', 'HKLM']) {
      const out = await run('reg', ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall`, '/s', '/f', 'TruckersMP', '/d']);
      const icon = out.match(/DisplayIcon\s+REG_\w+\s+"?([^"\r\n,]+\.exe)/i);
      if (icon && fs.existsSync(icon[1])) return icon[1];
      const loc = out.match(/InstallLocation\s+REG_\w+\s+"?([^"\r\n]+)/i);
      if (loc) { const dir = loc[1].trim(); for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (/truckersmp.*\.exe$/i.test(f) && !/uninstall/i.test(f)) return path.join(dir, f); }
    }
    return null;
  }
}
module.exports = Game;
