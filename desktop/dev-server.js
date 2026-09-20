// Arranca el núcleo sin Electron (útil para probar en cualquier sistema)
const path = require('path');
const core = require('./core');
core.start({
  dataDir: path.join(__dirname, '.devdata'), resourcesDir: path.join(__dirname, 'resources'),
  uiDir: path.join(__dirname, 'ui'), port: +process.env.PORT || 25580, hooks: {}
});
console.log('Xito Truck Hub en http://localhost:25580');
