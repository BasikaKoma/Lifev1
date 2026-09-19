import { isCloudSyncEnabled, isVaultEnabled } from './config';
import { queueVaultJson, vaultReadJson } from './io';

export function mirrorVaultJson(relativePath, value) {
  if (!isVaultEnabled() || value == null) return;
  queueVaultJson(relativePath, value);
}

export async function readVaultJsonIfEnabled(relativePath) {
  if (!isVaultEnabled()) return null;
  try {
    return await vaultReadJson(relativePath);
  } catch {
    return null;
  }
}

export { isCloudSyncEnabled, isVaultEnabled };
