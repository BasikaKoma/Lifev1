import { createElectronVaultBackend, hasElectronVault } from './electronBackend';
import { canUseWebVault, createWebVaultBackend } from './webBackend';

let cached = null;

export function getVaultBackend() {
  if (cached) return cached;
  if (hasElectronVault()) {
    cached = createElectronVaultBackend();
    return cached;
  }
  if (canUseWebVault()) {
    cached = createWebVaultBackend();
    return cached;
  }
  return null;
}

export function resetVaultBackendCache() {
  cached = null;
}
