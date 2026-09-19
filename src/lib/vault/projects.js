import {
  PERSISTABLE_COLUMNS,
  applyColumnValuesToState,
  getStateValueForColumn,
} from '../../utils/projectSavePatch';
import { isCloudSyncEnabled, isVaultEnabled } from './config';
import {
  enqueueVaultWrite,
  flushVaultWrites,
  vaultReadJson,
  vaultRemove,
  vaultWriteText,
} from './io';
import {
  PROJECT_INDEX_FILE,
  encodeJson,
  prettyJson,
  projectColumnPath,
  projectMetaPath,
  sanitizeVaultId,
} from './paths';

const pending = new Map();

function indexEntry(state) {
  return {
    id: state.projectId,
    title: state.projectTitle || 'My Business',
    isLifeline: state.isLifeline === true,
    updatedAt: new Date().toISOString(),
  };
}

function metaPayload(state, dirtyColumns) {
  return {
    projectId: state.projectId,
    title: state.projectTitle || 'My Business',
    isLifeline: state.isLifeline === true,
    cloudUpdatedAt: state.cloudUpdatedAt || null,
    dirtyColumns: [...(dirtyColumns || [])],
    localUpdatedAt: Date.now(),
    ui: {
      activeView: state.activeView || 'projects',
      selectedStageId: state.selectedStageId || null,
      focusMode: state.focusMode === true,
    },
  };
}

async function upsertIndex(state) {
  if (!sanitizeVaultId(state?.projectId)) return;
  const current = (await vaultReadJson(PROJECT_INDEX_FILE)) || [];
  const list = Array.isArray(current) ? current.filter((row) => row && row.id !== state.projectId) : [];
  list.unshift(indexEntry(state));
  await vaultWriteText(PROJECT_INDEX_FILE, prettyJson(list));
}

async function flushPendingProjectWrites() {
  while (pending.size) {
    const batch = [...pending.values()];
    pending.clear();
    for (const entry of batch) {
      if (entry.type === 'delete') {
        await vaultRemove(entry.dir);
        const current = (await vaultReadJson(PROJECT_INDEX_FILE)) || [];
        const list = Array.isArray(current) ? current.filter((row) => row?.id !== entry.projectId) : [];
        await vaultWriteText(PROJECT_INDEX_FILE, prettyJson(list));
        continue;
      }
      const { state, columns, dirtyColumns } = entry;
      if (!sanitizeVaultId(state?.projectId)) continue;
      await vaultWriteText(projectMetaPath(state.projectId), prettyJson(metaPayload(state, dirtyColumns)));
      for (const column of columns) {
        await vaultWriteText(
          projectColumnPath(state.projectId, column),
          encodeJson(column, getStateValueForColumn(state, column)),
        );
      }
      await upsertIndex(state);
    }
  }
}

export function queueVaultProjectWrite(state, columns, dirtyColumns) {
  if (!isVaultEnabled() || !state?.projectId || !columns?.length) return;
  if (!sanitizeVaultId(state.projectId)) return;
  const prev = pending.get(state.projectId);
  pending.set(state.projectId, {
    type: 'project',
    state,
    columns: [...new Set([...(prev?.columns || []), ...columns])],
    dirtyColumns,
  });
  enqueueVaultWrite(() => flushPendingProjectWrites());
}

export async function readVaultProject(projectId) {
  if (!sanitizeVaultId(projectId)) return null;
  try {
    const meta = await vaultReadJson(projectMetaPath(projectId));
    const values = {};
    await Promise.all(
      PERSISTABLE_COLUMNS.map(async (column) => {
        const value = await vaultReadJson(projectColumnPath(projectId, column));
        if (value !== null && value !== undefined) values[column] = value;
      }),
    );
    if (!meta && !Object.keys(values).length) return null;
    return { meta: meta || { projectId }, values };
  } catch {
    return null;
  }
}

export function overlayVaultValues(data, vault) {
  if (!data || !vault?.values) return data;
  const next = applyColumnValuesToState(data, vault.values);
  if (vault.meta?.title) next.projectTitle = vault.meta.title;
  if (typeof vault.meta?.isLifeline === 'boolean') next.isLifeline = vault.meta.isLifeline;
  if (vault.meta?.ui?.activeView) next.activeView = vault.meta.ui.activeView;
  return next;
}

export async function overlayVaultProjectData(data) {
  if (!isVaultEnabled() || isCloudSyncEnabled() || !data?.projectId) return data;
  const vault = await readVaultProject(data.projectId);
  if (!vault) return data;
  return overlayVaultValues(data, vault);
}

export function queueVaultProjectDelete(projectId) {
  if (!isVaultEnabled() || !sanitizeVaultId(projectId)) return;
  pending.set(projectId, { type: 'delete', projectId, dir: `projects/${projectId}` });
  enqueueVaultWrite(() => flushPendingProjectWrites());
}

export { flushVaultWrites };
