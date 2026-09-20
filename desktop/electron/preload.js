const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hubNative', {
  setTheme: (bg, fg) => ipcRenderer.send('theme', bg, fg),
  win: (cmd) => ipcRenderer.send('win', cmd),
  winState: () => ipcRenderer.invoke('win-state'),
  onWinState: (cb) => ipcRenderer.on('win-state', (_e, s) => cb(s))
});
