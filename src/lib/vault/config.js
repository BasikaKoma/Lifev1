const STORAGE_KEY = 'lifev1-vault';

const DEFAULT_CONFIG = {
  enabled: false,
  cloudSync: true,
  backend: null,
  displayPath: '',
  displayName: '',
};

const listeners = new Set();

function asBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeVaultConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const backend = source.backend === 'electron' || source.backend === 'web' ? source.backend : null;
  return {
    enabled: asBool(source.enabled, false),
    cloudSync: asBool(source.cloudSync, true),
    backend,
    displayPath: String(source.displayPath || ''),
    displayName: String(source.displayName || ''),
  };
}

export function getVaultConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeVaultConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveVaultConfig(partial) {
  const next = normalizeVaultConfig({ ...getVaultConfig(), ...partial });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeVaultConfig(listener) {
  listeners.add(listener);
  listener(getVaultConfig());
  return () => listeners.delete(listener);
}

export function isVaultEnabled() {
  return getVaultConfig().enabled === true;
}

/** When a folder vault is on, cloud upload is off unless the user opts back in. */
export function isCloudSyncEnabled() {
  const config = getVaultConfig();
  if (config.enabled && config.cloudSync !== true) return false;
  return true;
}

export function canUseFolderVault() {
  if (typeof window === 'undefined') return false;
  if (window.electronVault) return true;
  return typeof window.showDirectoryPicker === 'function';
}

export function folderVaultUnavailableReason() {
  if (canUseFolderVault()) return null;
  return 'Η αποθήκευση σε φάκελο δουλεύει στο desktop app και στο Chrome. Στο κινητό τα δεδομένα μένουν τοπικά στη συσκευή.';
}
