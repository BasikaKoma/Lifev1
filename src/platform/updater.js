export function isAvailable() {
  return Boolean(window.electronUpdater);
}

export function getInfo() {
  if (!window.electronUpdater) return Promise.resolve(null);
  return window.electronUpdater.getInfo();
}

export function checkForUpdates() {
  if (!window.electronUpdater) return Promise.resolve({ ok: false, error: 'Not available' });
  return window.electronUpdater.checkForUpdates();
}

export function onStatus(callback) {
  if (!window.electronUpdater) return undefined;
  return window.electronUpdater.onStatus(callback);
}
