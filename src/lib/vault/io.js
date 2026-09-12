import { getVaultBackend } from './backend';
import { isVaultEnabled } from './config';

let writeChain = Promise.resolve();

function requireBackend() {
  const backend = getVaultBackend();
  if (!backend) throw new Error('Folder vault is not available on this device.');
  return backend;
}

export async function vaultStatus() {
  const backend = getVaultBackend();
  if (!backend) return { connected: false, path: null, displayName: null, available: false };
  try {
    return { ...(await backend.getStatus()), available: true, kind: backend.kind };
  } catch {
    return { connected: false, path: null, displayName: null, available: true, kind: backend.kind };
  }
}

export async function vaultPickFolder() {
  return requireBackend().pickFolder();
}

export async function vaultDisconnectBackend() {
  const backend = getVaultBackend();
  if (!backend) return { connected: false };
  return backend.disconnect();
}

export async function vaultReveal() {
  return requireBackend().reveal();
}

export async function vaultWriteText(relativePath, contents) {
  return requireBackend().writeText(relativePath, contents);
}

export async function vaultReadText(relativePath) {
  return requireBackend().readText(relativePath);
}

export async function vaultExists(relativePath) {
  const backend = getVaultBackend();
  if (!backend) return false;
  try {
    return await backend.exists(relativePath);
  } catch {
    return false;
  }
}

export async function vaultListDir(relativePath = '') {
  return requireBackend().listDir(relativePath);
}

export async function vaultRemove(relativePath) {
  return requireBackend().remove(relativePath);
}

export async function vaultReadJson(relativePath) {
  const raw = await vaultReadText(relativePath);
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function enqueueVaultWrite(task) {
  writeChain = writeChain.then(() => task()).catch((err) => {
    console.warn('Vault write failed', err);
  });
  return writeChain;
}

export function flushVaultWrites() {
  return writeChain.catch(() => {});
}

export function queueVaultJson(relativePath, value, encode = (next) => `${JSON.stringify(next, null, 2)}\n`) {
  if (!isVaultEnabled()) return;
  enqueueVaultWrite(async () => {
    await vaultWriteText(relativePath, encode(value));
  });
}

export async function isVaultReady() {
  if (!isVaultEnabled()) return false;
  const status = await vaultStatus();
  return status.connected === true;
}
