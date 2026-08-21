export function hasElectronBrain() {
  return Boolean(typeof window !== 'undefined' && window.electronBrain);
}

export function getElectronBrain() {
  return window.electronBrain || null;
}

async function invoke(method, ...args) {
  const api = getElectronBrain();
  if (!api?.[method]) throw new Error('Folder access is only available in the desktop app.');
  const result = await api[method](...args);
  if (result && typeof result === 'object' && result.ok === false) {
    throw new Error(result.error || 'Brain error');
  }
  if (result && typeof result === 'object' && result.ok === true && 'data' in result) {
    return result.data;
  }
  return result;
}

export async function brainPickFolder() {
  return invoke('pickFolder');
}

export async function brainListRoots() {
  if (!hasElectronBrain()) return [];
  return (await invoke('listRoots')) || [];
}

export async function brainRemoveRoot(rootId) {
  return invoke('removeRoot', rootId);
}

export async function brainListDir(rootId, relativePath = '') {
  return invoke('listDir', rootId, relativePath);
}

export async function brainReadText(rootId, relativePath) {
  return invoke('readText', rootId, relativePath);
}

export async function brainReadImage(rootId, relativePath) {
  return invoke('readImage', rootId, relativePath);
}

export async function brainHasCloudKey() {
  if (!hasElectronBrain()) return { configured: false };
  return (await invoke('hasCloudKey')) || { configured: false };
}

export async function brainSetCloudKey(key) {
  return invoke('setCloudKey', key);
}

export async function brainClearCloudKey() {
  return invoke('clearCloudKey');
}

export async function brainRunNative(payload) {
  return invoke('run', payload);
}
