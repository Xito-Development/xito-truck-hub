const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hubOverlay', {
  onEdit: (cb) => ipcRenderer.on('edit', (_e, on) => cb(!!on)),
  onCmd: (cb) => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  editDone: () => ipcRenderer.send('overlay-edit-done')
});
