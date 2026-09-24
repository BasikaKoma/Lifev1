const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__lifev1Platform', 'electron');

contextBridge.exposeInMainWorld('electronAuth', {
  storageGet(key) {
    return ipcRenderer.invoke('auth:storage-get', key);
  },
  storageSet(key, value) {
    return ipcRenderer.invoke('auth:storage-set', key, value);
  },
  storageRemove(key) {
    return ipcRenderer.invoke('auth:storage-remove', key);
  },
  getLogin() {
    return ipcRenderer.invoke('auth:get-login');
  },
  getBootstrap() {
    return ipcRenderer.invoke('auth:get-bootstrap');
  },
  saveLogin(payload) {
    return ipcRenderer.invoke('auth:save-login', payload);
  },
  clearLogin() {
    return ipcRenderer.invoke('auth:clear-login');
  },
  markSignedOut() {
    return ipcRenderer.invoke('auth:mark-signed-out');
  },
  clearSignedOut() {
    return ipcRenderer.invoke('auth:clear-signed-out');
  },
});

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

contextBridge.exposeInMainWorld('electronCameras', {
  snapshot(camera) {
    return ipcRenderer.invoke('cameras:snapshot', camera);
  },
});

contextBridge.exposeInMainWorld('electronVault', {
  getStatus() {
    return ipcRenderer.invoke('vault:get-status');
  },
  pickFolder() {
    return ipcRenderer.invoke('vault:pick-folder');
  },
  disconnect() {
    return ipcRenderer.invoke('vault:disconnect');
  },
  writeText(relativePath, contents) {
    return ipcRenderer.invoke('vault:write-text', relativePath, contents);
  },
  readText(relativePath) {
    return ipcRenderer.invoke('vault:read-text', relativePath);
  },
  exists(relativePath) {
    return ipcRenderer.invoke('vault:exists', relativePath);
  },
  listDir(relativePath) {
    return ipcRenderer.invoke('vault:list-dir', relativePath);
  },
  remove(relativePath) {
    return ipcRenderer.invoke('vault:remove', relativePath);
  },
  reveal() {
    return ipcRenderer.invoke('vault:reveal');
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
  openFile(rootId, relativePath) {
    return ipcRenderer.invoke('brain:open-file', rootId, relativePath);
  },
  openUrl(url) {
    return ipcRenderer.invoke('brain:open-url', url);
  },
  writeText(rootId, relativePath, text) {
    return ipcRenderer.invoke('brain:write-text', rootId, relativePath, text);
  },
  fillText(rootId, relativePath, pairs) {
    return ipcRenderer.invoke('brain:fill-text', rootId, relativePath, pairs);
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
  installUpdate() {
    return ipcRenderer.invoke('updater:install');
  },
  onStatus(callback) {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
});
