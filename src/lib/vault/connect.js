import { loadLocalBundle } from '../../brain/memory/localStore';
import { PERSISTABLE_COLUMNS } from '../../utils/projectSavePatch';
import { readBrandBundleLocal } from '../brand/store';
import { readNutritionBundleLocal } from '../nutrition/store';
import { readLocalPathBundle } from '../path/store';
import { getVaultBackend } from './backend';
import { getVaultConfig, saveVaultConfig } from './config';
import {
  flushVaultWrites,
  isVaultReady,
  vaultDisconnectBackend,
  vaultExists,
  vaultPickFolder,
  vaultReadJson,
  vaultReveal,
  vaultStatus,
  vaultWriteText,
} from './io';
import {
  VAULT_META_FILE,
  VAULT_README,
  VAULT_README_FILE,
  brandPath,
  brainConversationsPath,
  brainMemoriesPath,
  brainProfilePath,
  nutritionPath,
  pathBundlePath,
  prettyJson,
} from './paths';
import { getLiveVaultProjects } from './liveSource';
import { queueVaultProjectWrite } from './projects';

function nowIso() {
  return new Date().toISOString();
}

async function writeSidecars() {
  let nutrition = null;
  let pathBundle = null;
  let brand = null;
  try {
    nutrition = readNutritionBundleLocal();
  } catch {
    nutrition = null;
  }
  try {
    pathBundle = readLocalPathBundle();
  } catch {
    pathBundle = null;
  }
  try {
    brand = readBrandBundleLocal();
  } catch {
    brand = null;
  }

  if (nutrition) await vaultWriteText(nutritionPath(), prettyJson(nutrition));
  if (pathBundle) await vaultWriteText(pathBundlePath(), prettyJson(pathBundle));
  if (brand) await vaultWriteText(brandPath(), prettyJson(brand));

  try {
    const bundle = loadLocalBundle();
    await vaultWriteText(brainProfilePath(), prettyJson(bundle.profile));
    await vaultWriteText(brainMemoriesPath(), prettyJson(bundle.memories));
    await vaultWriteText(brainConversationsPath(), prettyJson({
      conversations: bundle.conversations,
      activeConversationId: bundle.activeConversationId,
    }));
  } catch {
    /* brain is optional */
  }
}

async function exportLocalProjects() {
  const { listLocalProjectMetas, readLocalProject, flushLocalWrites } = await import('../../utils/projectLocalStore');
  await flushLocalWrites();
  const byId = new Map();
  for (const state of await getLiveVaultProjects()) {
    byId.set(state.projectId, state);
  }
  const metas = await listLocalProjectMetas();
  for (const meta of metas) {
    if (byId.has(meta.projectId)) continue;
    const state = await readLocalProject(meta.projectId);
    if (state?.projectId) byId.set(state.projectId, state);
  }
  for (const state of byId.values()) {
    queueVaultProjectWrite(state, PERSISTABLE_COLUMNS, state.dirtyColumns || []);
  }
  await flushVaultWrites();
}

export async function connectFolderVault() {
  const backend = getVaultBackend();
  let status;
  try {
    status = await vaultPickFolder();
  } catch (err) {
    if (err?.name === 'AbortError') return getVaultConfig();
    throw err;
  }
  if (status?.canceled) return getVaultConfig();
  if (!status?.connected) {
    throw new Error('Δεν επιλέχθηκε φάκελος.');
  }

  saveVaultConfig({
    enabled: true,
    cloudSync: false,
    backend: backend?.kind || (typeof window !== 'undefined' && window.electronVault ? 'electron' : 'web'),
    displayPath: status.path || '',
    displayName: status.displayName || 'Folder',
  });

  const existing = await vaultReadJson(VAULT_META_FILE);
  const adopting = existing?.app === 'next-move';
  await vaultWriteText(VAULT_README_FILE, VAULT_README);
  await vaultWriteText(VAULT_META_FILE, prettyJson({
    version: 1,
    app: 'next-move',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  }));

  if (!adopting) {
    await exportLocalProjects();
    await writeSidecars();
  } else {
    const hasProjects = await vaultExists('projects/_index.json');
    if (!hasProjects) await exportLocalProjects();
  }

  await flushVaultWrites();
  return getVaultConfig();
}

export async function disconnectFolderVault() {
  await flushVaultWrites();
  try {
    await vaultDisconnectBackend();
  } catch {
    /* renderer config still clears */
  }
  return saveVaultConfig({
    enabled: false,
    cloudSync: true,
    backend: null,
    displayPath: '',
    displayName: '',
  });
}

export async function setVaultCloudSync(cloudSync) {
  return saveVaultConfig({ cloudSync: cloudSync === true });
}

export async function revealVaultFolder() {
  return vaultReveal();
}

export async function refreshVaultConnection() {
  const status = await vaultStatus();
  const config = getVaultConfig();
  if (config.enabled && status.connected) {
    saveVaultConfig({
      displayPath: status.path || config.displayPath,
      displayName: status.displayName || config.displayName,
      backend: status.kind || config.backend,
    });
  }
  return { ...status, config: getVaultConfig(), ready: await isVaultReady() };
}

export async function changeVaultFolder() {
  return connectFolderVault();
}
