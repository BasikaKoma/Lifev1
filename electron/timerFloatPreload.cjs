const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerFloat', {
  onState(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('timer-float:state', handler);
    ipcRenderer.send('timer-float:ready');
    return () => ipcRenderer.removeListener('timer-float:state', handler);
  },
  command(action) {
    ipcRenderer.send('timer-float:command', String(action || ''));
  },
});
