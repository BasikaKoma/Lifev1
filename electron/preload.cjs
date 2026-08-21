const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__lifev1Platform', 'electron');

contextBridge.exposeInMainWorld('electronSave', {
  onFlushBeforeClose(callback) {
    const handler = () => {
      Promise.resolve(callback())
        .then((ok) => ipcRenderer.send('flush-save-complete', ok === true))
        .catch(() => ipcRenderer.send('flush-save-complete', false));
    };
    ipcRenderer.on('request-flush-save', handler);
    return () => ipcRenderer.removeListener('request-flush-save', handler);
  },
});

contextBridge.exposeInMainWorld('electronScale', {
  setBackgroundEnabled(enabled) {
    ipcRenderer.send('scale-background-enabled', Boolean(enabled));
  },
});

contextBridge.exposeInMainWorld('electronBrain', {
  pickFolder() {
    return ipcRenderer.invoke('brain:pick-folder');
  },
  listRoots() {
    return ipcRenderer.invoke('brain:list-roots');
  },
  removeRoot(rootId) {
    return ipcRenderer.invoke('brain:remove-root', rootId);
  },
  listDir(rootId, relativePath) {
    return ipcRenderer.invoke('brain:list-dir', rootId, relativePath);
  },
  readText(rootId, relativePath) {
    return ipcRenderer.invoke('brain:read-text', rootId, relativePath);
  },
  readImage(rootId, relativePath) {
    return ipcRenderer.invoke('brain:read-image', rootId, relativePath);
  },
  hasCloudKey() {
    return ipcRenderer.invoke('brain:has-cloud-key');
  },
  setCloudKey(key) {
    return ipcRenderer.invoke('brain:set-cloud-key', key);
  },
  clearCloudKey() {
    return ipcRenderer.invoke('brain:clear-cloud-key');
  },
  run(payload) {
    return ipcRenderer.invoke('brain:run', payload);
  },
});

contextBridge.exposeInMainWorld('electronUpdater', {
  getInfo() {
    return ipcRenderer.invoke('updater:get-info');
  },
  checkForUpdates() {
    return ipcRenderer.invoke('updater:check');
  },
  onStatus(callback) {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
});
