// Detección de Steam, instalaciones de ETS2/ATS e instalación del plugin de telemetría
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const GAMES = [
  { key: 'ets2', name: 'Euro Truck Simulator 2', folder: 'Euro Truck Simulator 2' },
  { key: 'ats', name: 'American Truck Simulator', folder: 'American Truck Simulator' }
];

function regQuery(key, value) {
  return new Promise((res) => {
    if (process.platform !== 'win32') return res(null);
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, out) => {
      if (err) return res(null);
      const m = out.match(new RegExp(value + '\\s+REG_\\w+\\s+(.+)'));
      res(m ? m[1].trim() : null);
    });
  });
}

async function steamPath() {
  const p = (await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath'))
    || (await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'));
  const cands = [p, 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'].filter(Boolean).map((x) => x.replace(/\//g, '\\'));
  return cands.find((c) => fs.existsSync(c)) || null;
}

function libraries(steam) {
  const libs = new Set([steam]);
  try {
    const vdf = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch {}
  return [...libs];
}

async function findGames(extraPaths = []) {
  const found = [];
  const steam = await steamPath();
  const roots = steam ? libraries(steam).map((l) => path.join(l, 'steamapps', 'common')) : [];
  for (const g of GAMES) {
    const cands = roots.map((r) => path.join(r, g.folder)).concat(extraPaths);
    for (const c of cands) {
      const bin = path.join(c, 'bin', 'win_x64');
      if (fs.existsSync(bin) && fs.existsSync(path.join(c, 'base.scs'))) {
        const plugin = path.join(bin, 'plugins', 'scs-telemetry.dll');
        found.push({ ...g, dir: c, plugin, installed: fs.existsSync(plugin) });
        break;
      }
    }
  }
  return found;
}

function copyElevated(src, destDir) {
  const os = require('os');
  const bat = path.join(os.tmpdir(), 'xito-truckhub-plugin.cmd');
  fs.writeFileSync(bat, `@echo off\r\nif not exist "${destDir}" mkdir "${destDir}"\r\ncopy /Y "${src}" "${destDir}\\scs-telemetry.dll"\r\n`);
  return new Promise((res, rej) => {
    execFile('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`],
      { windowsHide: true }, (err) => err ? rej(new Error('Permiso de administrador denegado')) : res());
  });
}

async function installPlugin(resourcesDir, game) {
  const src = path.join(resourcesDir, 'plugin', 'win64', 'scs-telemetry.dll');
  const dest = path.dirname(game.plugin);
  if (!fs.existsSync(src)) throw new Error('Falta el archivo del plugin en la instalación del HUB. Reinstala Xito Truck Hub.');
  try {
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(src, game.plugin);
  } catch (e) {
    if (process.platform !== 'win32') throw e;
    await copyElevated(src, dest);
  }
  return fs.existsSync(game.plugin);
}

// Busca la cuenta de Steam usada más recientemente (para detectar el ID de TruckersMP)
async function recentSteamId() {
  const steam = await steamPath();
  if (!steam) return null;
  try {
    const vdf = fs.readFileSync(path.join(steam, 'config', 'loginusers.vdf'), 'utf8');
    const blocks = [...vdf.matchAll(/"(7656\d{13})"\s*\{([^}]*)\}/g)];
    const recent = blocks.find((b) => /"MostRecent"\s+"1"/i.test(b[2])) || blocks[0];
    return recent ? recent[1] : null;
  } catch { return null; }
}

module.exports = { findGames, installPlugin, recentSteamId, GAMES };
