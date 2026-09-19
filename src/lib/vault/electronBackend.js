function getApi() {
  return typeof window !== 'undefined' ? window.electronVault : null;
}

export function hasElectronVault() {
  return Boolean(getApi());
}

async function invoke(method, ...args) {
  const api = getApi();
  if (!api?.[method]) throw new Error('Folder vault is only available in the desktop app.');
  const result = await api[method](...args);
  if (result && typeof result === 'object' && result.ok === false) {
    throw new Error(result.error || 'Vault error');
  }
  if (result && typeof result === 'object' && result.ok === true && 'data' in result) {
    return result.data;
  }
  return result;
}

export function createElectronVaultBackend() {
  return {
    kind: 'electron',
    async getStatus() {
      return (await invoke('getStatus')) || { connected: false, path: null, displayName: null };
    },
    async pickFolder() {
      return invoke('pickFolder');
    },
    async disconnect() {
      return invoke('disconnect');
    },
    async writeText(relativePath, contents) {
      return invoke('writeText', relativePath, contents);
    },
    async readText(relativePath) {
      return invoke('readText', relativePath);
    },
    async exists(relativePath) {
      return Boolean(await invoke('exists', relativePath));
    },
    async listDir(relativePath) {
      return (await invoke('listDir', relativePath)) || [];
    },
    async remove(relativePath) {
      return invoke('remove', relativePath);
    },
    async reveal() {
      return invoke('reveal');
    },
  };
}
