// Copia la interfaz compartida del PC a la app Android
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'desktop', 'ui');
const dst = path.join(__dirname, '..', 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !/overlay\.(html|js)$/.test(p) });
console.log('Interfaz copiada a www/');
