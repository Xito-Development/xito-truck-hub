// Calcula las rutas en un hilo aparte: así el HUB (y la telemetría) no se congelan mientras tanto
const { parentPort, workerData } = require('worker_threads');
const router = require('./router');
if (workerData && workerData.cacheDir) router.setCacheDir(workerData.cacheDir);
parentPort.on('message', async ({ id, args, opts, kind }) => {
  try { parentPort.postMessage({ id, ok: true, result: kind === 'follow' ? await router.follow(args) : await router.route(args, opts) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, error: e.message }); }
});
