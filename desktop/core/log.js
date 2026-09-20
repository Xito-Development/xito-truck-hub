// Registro de errores en un archivo (para poder diagnosticar fallos en el PC del usuario)
const fs = require('fs');
const path = require('path');
let file = null;
function init(dir) {
  file = path.join(dir, 'xito-truckhub.log');
  try { if (fs.existsSync(file) && fs.statSync(file).size > 1e6) fs.renameSync(file, file + '.old'); } catch {}
  const orig = { error: console.error, warn: console.warn };
  const hook = (lvl) => (...a) => { orig[lvl === 'ERROR' ? 'error' : 'warn'](...a); write(lvl, a.map((x) => (x instanceof Error ? x.stack : typeof x === 'object' ? safe(x) : String(x))).join(' ')); };
  console.error = hook('ERROR'); console.warn = hook('WARN');
  process.on('uncaughtException', (e) => write('FATAL', e && e.stack || String(e)));
  process.on('unhandledRejection', (e) => write('ERROR', 'Promesa rechazada: ' + (e && e.stack || String(e))));
  write('INFO', `Inicio · Node ${process.version} · ${process.platform}`);
}
function safe(o) { try { return JSON.stringify(o).slice(0, 2000); } catch { return String(o); } }
function write(lvl, msg) {
  if (!file) return;
  try { fs.appendFileSync(file, `${new Date().toISOString()} [${lvl}] ${msg}\n`); } catch {}
}
function tail(n = 300) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-n); } catch { return []; }
}
module.exports = { init, write, tail, get file() { return file; } };
