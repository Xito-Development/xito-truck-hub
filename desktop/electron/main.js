// Xito Truck Hub — proceso principal de Electron (Windows)
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, screen, nativeImage, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const core = require('../core');

const PORT = 25580;
const START_HIDDEN = process.argv.includes('--hidden');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.xitodev.truckhub');

const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
const uiDir = path.join(__dirname, '..', 'ui');
const icon = path.join(__dirname, 'assets', 'icon.png');
let win = null, overlay = null, tray = null, hub = null, quitting = false, editMode = false, f5Handler = null;

const S = () => hub.store.data.settings;
const saveOverlay = (patch) => { hub.store.updateSettings({ overlay: patch }); hub.srv.broadcast({ t: 'settings', settings: S() }); };

// ---------- ventana principal (sin marco: la barra de título y los botones son nuestros) ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640, show: false, icon,
    frame: false, backgroundColor: '#0e1522', title: 'Xito Truck Hub', roundedCorners: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  win.loadURL(`http://localhost:${PORT}/`);
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => { if (isMain && code !== -3) setTimeout(() => win && !win.isDestroyed() && win.loadURL(`http://localhost:${PORT}/`), 1000); });
  win.once('ready-to-show', () => { if (!START_HIDDEN && !S().startMinimized) win.show(); });
  const sendState = () => win && !win.isDestroyed() && win.webContents.send('win-state', { maximized: win.isMaximized(), focused: win.isFocused() });
  ['maximize', 'unmaximize', 'focus', 'blur', 'restore'].forEach((ev) => win.on(ev, sendState));
  // Con el HUB en primer plano el overlay se aparta para no tapar la ventana
  win.on('focus', () => { if (overlay && !editMode) overlay.hide(); });
  win.on('blur', () => applyOverlay());
  win.on('hide', () => applyOverlay());
  win.on('minimize', () => applyOverlay());
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!S().trayHintShown && tray && process.platform === 'win32') {
      tray.displayBalloon({ title: 'Xito Truck Hub sigue funcionando', content: 'Seguirá registrando tus viajes desde la bandeja. Para cerrarlo del todo, clic derecho → Salir.', iconType: 'info' });
      S().trayHintShown = true; hub.store.save();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://localhost:${PORT}`)) { e.preventDefault(); shell.openExternal(url); } });
}
function showMain() { if (!win) createWindow(); win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
function toggleMain() { if (win && win.isVisible() && win.isFocused()) win.hide(); else showMain(); }

// ---------- overlay: una capa transparente del tamaño de la pantalla con widgets colocables ----------
function gameDisplay() {
  const id = S().overlay.displayId;
  return (id && screen.getAllDisplays().find((d) => d.id === id)) || screen.getPrimaryDisplay();
}
function displays() {
  const prim = screen.getPrimaryDisplay().id, cur = gameDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, name: `Pantalla ${i + 1} (${d.size.width}×${d.size.height})${d.id === prim ? ' · principal' : ''}`, current: d.id === cur }));
}
function setDisplay(id) { saveOverlay({ displayId: id }); fitOverlay(); refreshTray(); }
function createOverlay() {
  const d = gameDisplay();
  overlay = new BrowserWindow({
    ...d.bounds, transparent: true, frame: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, hasShadow: false, show: false, backgroundColor: '#00000000', title: 'Xito Truck Hub Overlay', fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.loadURL(`http://localhost:${PORT}/overlay.html`);
  overlay.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => { if (isMain && code !== -3) setTimeout(() => overlay && !overlay.isDestroyed() && overlay.loadURL(`http://localhost:${PORT}/overlay.html`), 1000); });
  overlay.once('ready-to-show', applyOverlay);
  overlay.on('closed', () => { overlay = null; });
}
function fitOverlay() { if (overlay) overlay.setBounds(gameDisplay().bounds); }
function applyOverlay() {
  if (!overlay) return;
  const hubFocused = win && !win.isDestroyed() && win.isVisible() && win.isFocused() && !win.isMinimized();
  if ((S().overlay.enabled && !hubFocused) || editMode) overlay.showInactive(); else overlay.hide();
  refreshTray();
}
function setEdit(on) {
  if (!overlay) return;
  editMode = on;
  overlay.setIgnoreMouseEvents(!on);
  overlay.setFocusable(on);
  overlay.webContents.send('edit', on);
  if (on) { overlay.showInactive(); overlay.focus(); } else applyOverlay();
  refreshTray();
}
function toggleOverlay() { saveOverlay({ enabled: !S().overlay.enabled }); applyOverlay(); }
function sendOverlay(cmd) { if (overlay) overlay.webContents.send('cmd', cmd); }

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Xito Truck Hub', click: showMain },
    { label: 'Jugar a TruckersMP', click: () => hub.srv.call('POST', '/api/launch', { target: 'tmp' }) },
    { type: 'separator' },
    { label: 'Mostrar overlay', type: 'checkbox', checked: !!S().overlay.enabled, click: toggleOverlay },
    { label: editMode ? 'Terminar de colocar widgets' : 'Colocar widgets del overlay', click: () => setEdit(!editMode) },
    ...(screen.getAllDisplays().length > 1 ? [{ label: 'Pantalla del overlay', submenu: displays().map((d) => ({ label: d.name, type: 'radio', checked: d.current, click: () => setDisplay(d.id) })) }] : []),
    { label: 'Restablecer posición de los widgets', click: () => { saveOverlay({ widgets: null }); sendOverlay('reset'); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } }
  ]));
}

// Atajos globales (funcionan con el juego en primer plano)
const SHORTCUTS = {
  'CommandOrControl+Shift+O': () => toggleOverlay(),
  'CommandOrControl+Shift+L': () => setEdit(!editMode),
  'CommandOrControl+Shift+M': () => sendOverlay('toggle-map'),
  'CommandOrControl+Shift+K': () => sendOverlay('clear-messages'),
  'CommandOrControl+Shift+U': () => { const s = S().overlay.scale || 1; saveOverlay({ scale: s >= 1.3 ? 0.8 : Math.round((s + 0.15) * 100) / 100 }); },
  'CommandOrControl+Shift+Y': () => sendOverlay('cycle-style'),
  'CommandOrControl+Shift+H': () => toggleMain(),
  'CommandOrControl+Shift+Z': () => sendOverlay('zoom-map')
};

function applyInstallerOptions() {
  const f = path.join(app.getPath('userData'), 'installer-options.json');
  if (!fs.existsSync(f)) return;
  let o = null;
  try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  try { fs.unlinkSync(f); } catch {}
  if (o && o.autoStart) { hub.store.updateSettings({ autoStart: true }); app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); }
}

// ---------- actualizador propio: descarga el instalador con barra de progreso y actualiza en silencio ----------
async function installUpdate(url, version) {
  const os = require('os');
  const { execFile } = require('child_process');
  const send = (d) => hub.srv.broadcast({ t: 'update', d: { version, ...d } });
  try {
    send({ phase: 'download', pct: 0 });
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`La descarga respondió ${r.status}`);
    const total = +r.headers.get('content-length') || 0;
    const file = path.join(os.tmpdir(), `XitoTruckHub-Setup-${version || 'nuevo'}.exe`);
    const out = fs.createWriteStream(file);
    const reader = r.body.getReader();
    let got = 0, lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length; out.write(Buffer.from(value));
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; send({ phase: 'download', pct, got, total }); }
    }
    await new Promise((ok) => out.end(ok));
    if (got < 5e6) throw new Error('El archivo descargado no parece un instalador');
    send({ phase: 'install', pct: 100 });
    // Instalación silenciosa con permisos de administrador; el instalador vuelve a abrir el HUB al terminar
    const ps = `Start-Process -FilePath '${file.replace(/'/g, "''")}' -ArgumentList '/S','--force-run','--updated' -Verb RunAs`;
    execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true }, (err) => {
      if (err) return send({ phase: 'error', error: 'Cancelaste el permiso de administrador' });
      send({ phase: 'restart' });
      setTimeout(() => { quitting = true; app.quit(); }, 1500);
    });
  } catch (e) { send({ phase: 'error', error: e.message }); }
}

app.on('second-instance', showMain);
app.whenReady().then(() => {
  // El mapa oficial de TruckersMP no deja incrustarse: dentro de nuestra app se permite
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://map.truckersmp.com/*'] }, (d, cb) => {
    const h = { ...d.responseHeaders };
    for (const k of Object.keys(h)) if (/^x-frame-options$/i.test(k) || /^content-security-policy$/i.test(k)) delete h[k];
    cb({ responseHeaders: h });
  });
  hub = core.start({
    dataDir: app.getPath('userData'), resourcesDir, uiDir, port: PORT, version: app.getVersion(),
    hooks: {
      electron: true,
      setAutoStart: (v) => app.setLoginItemSettings({ openAtLogin: !!v, args: ['--hidden'] }),
      openExternal: (url) => shell.openExternal(url),
      openPath: (p) => shell.openPath(p),
      serverError: (msg) => dialog.showErrorBox('Xito Truck Hub', `${msg}\n\n¿Tienes el HUB abierto dos veces o otro programa usando el puerto ${PORT}?`),
      installUpdate: (url, version) => installUpdate(url, version),
      displays: () => displays(),
      setDisplay: (id) => setDisplay(id),
      overlay: (action) => {
        if (action === 'edit') setEdit(!editMode);
        else if (action === 'toggle') toggleOverlay();
        else {
          // F5 (zoom del mini mapa) se activa o desactiva según los ajustes
          if (S().overlay.f5Zoom === false) globalShortcut.unregister('F5');
          else if (f5Handler && !globalShortcut.isRegistered('F5')) { try { globalShortcut.register('F5', f5Handler); } catch {} }
          const c = S().overlay.corner || 'br';
          if (lastCorner !== null && c !== lastCorner) placeCorner(c);
          lastCorner = c;
          applyOverlay();
        }
      }
    }
  });
  applyInstallerOptions();
  ipcMain.on('win', (_e, cmd) => {
    if (!win) return;
    if (cmd === 'min') win.minimize();
    else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (cmd === 'close') win.close();
  });
  ipcMain.handle('win-state', () => ({ maximized: !!win?.isMaximized() }));
  ipcMain.on('theme', (_e, bg) => { if (win && bg) try { win.setBackgroundColor(bg); } catch {} });
  ipcMain.on('overlay-edit-done', () => setEdit(false));
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
  tray.setToolTip('Xito Truck Hub');
  tray.on('click', showMain);
  refreshTray();
  setTimeout(() => { createWindow(); createOverlay(); }, 400);
  for (const [acc, fn] of Object.entries(SHORTCUTS)) { try { globalShortcut.register(acc, fn); } catch {} }
  // F5: cambia el zoom del mini mapa del overlay y deja pasar la tecla al juego (que la usa para su navegador)
  f5Handler = () => {
    sendOverlay('zoom-map');
    globalShortcut.unregister('F5');
    hub.bridge.sendKey('F5');
    setTimeout(() => { if (S().overlay.f5Zoom !== false) try { globalShortcut.register('F5', f5Handler); } catch {} }, 250);
  };
  if (S().overlay.f5Zoom !== false) try { globalShortcut.register('F5', f5Handler); } catch {}
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-added', fitOverlay);
  screen.on('display-removed', fitOverlay);
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
app.on('before-quit', () => { quitting = true; try { hub && hub.stop(); } catch {} });
app.on('will-quit', () => globalShortcut.unregisterAll());
