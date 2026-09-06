import { LOCAL_INK_WRITE_MS } from '../constants/save';
import {
  INK_COLUMNS,
  PERSISTABLE_COLUMNS,
  applyColumnValuesToState,
  capturePersistable,
  getStateValueForColumn,
} from './projectSavePatch';

const DB_NAME = 'next-move-local';
const DB_VERSION = 1;
const META_STORE = 'project_meta';
const COLUMN_STORE = 'project_columns';
const ACTIVE_KEY = '__active__';

let dbPromise = null;
const pendingWrites = new Map();
let flushTimer = null;
let flushChain = Promise.resolve();

function columnKey(projectId, column) {
  return `${projectId}:${column}`;
}

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB unavailable'));
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(COLUMN_STORE)) {
        const store = db.createObjectStore(COLUMN_STORE, { keyPath: 'key' });
        store.createIndex('byProject', 'projectId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export async function readLocalMeta(projectId) {
  if (!projectId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, 'readonly');
    const row = await requestToPromise(tx.objectStore(META_STORE).get(projectId));
    return row || null;
  } catch {
    return null;
  }
}

export async function readLastActiveProjectId() {
  const row = await readLocalMeta(ACTIVE_KEY);
  return row?.activeProjectId || null;
}

export async function readLocalColumns(projectId, columns) {
  if (!projectId || !columns?.length) return {};
  try {
    const db = await openDb();
    const tx = db.transaction(COLUMN_STORE, 'readonly');
    const store = tx.objectStore(COLUMN_STORE);
    const reads = columns.map((column) => requestToPromise(store.get(columnKey(projectId, column))));
    const rows = await Promise.all(reads);
    const values = {};
    columns.forEach((column, index) => {
      if (rows[index] && 'value' in rows[index]) values[column] = rows[index].value;
    });
    return values;
  } catch {
    return {};
  }
}

export async function readLocalProject(projectId) {
  if (!projectId) return null;
  const meta = await readLocalMeta(projectId);
  const values = await readLocalColumns(projectId, PERSISTABLE_COLUMNS);
  if (!meta && !Object.keys(values).length) return null;

  const persistable = applyColumnValuesToState(
    {
      projectId,
      projectTitle: meta?.title || 'My Business',
      isLifeline: meta?.isLifeline === true,
      cloudUpdatedAt: meta?.cloudUpdatedAt || null,
    },
    values
  );

  return {
    ...persistable,
    isLifeline: meta?.isLifeline === true,
    cloudUpdatedAt: meta?.cloudUpdatedAt || null,
    activeView: meta?.ui?.activeView || 'projects',
    selectedStageId: meta?.ui?.selectedStageId || null,
    focusMode: meta?.ui?.focusMode === true,
    dirtyColumns: meta?.dirtyColumns || [],
  };
}

function scheduleFlush(delayMs) {
  if (delayMs <= 0) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushChain = flushChain.then(() => flushPendingWrites()).catch(() => {});
    return;
  }
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushChain = flushChain.then(() => flushPendingWrites()).catch(() => {});
  }, delayMs);
}

async function flushPendingWrites() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (pendingWrites.size) {
    const batch = [...pendingWrites.values()];
    pendingWrites.clear();
    try {
      const db = await openDb();
      const tx = db.transaction([META_STORE, COLUMN_STORE], 'readwrite');
      const metaStore = tx.objectStore(META_STORE);
      const columnStore = tx.objectStore(COLUMN_STORE);
      for (const entry of batch) {
        if (entry.type === 'meta') metaStore.put(entry.value);
        else if (entry.type === 'column') columnStore.put(entry.value);
        else if (entry.type === 'deleteProject') metaStore.delete(entry.projectId);
        else if (entry.type === 'deleteColumn') columnStore.delete(entry.key);
      }
      await transactionDone(tx);
    } catch {
      /* private mode / quota — cloud sync still runs */
    }
  }
}

export function flushLocalWrites() {
  return flushChain.then(() => flushPendingWrites()).catch(() => {});
}

function metaRecord(state, dirtyColumns) {
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

function queueLocalColumnWrites(state, columns, dirtyColumns, { touchActive = true } = {}) {
  if (!state?.projectId || !columns?.length) return;
  const now = Date.now();
  const delay = columns.some((column) => INK_COLUMNS.has(column)) ? LOCAL_INK_WRITE_MS : 0;
  for (const column of columns) {
    pendingWrites.set(columnKey(state.projectId, column), {
      type: 'column',
      key: columnKey(state.projectId, column),
      value: {
        key: columnKey(state.projectId, column),
        projectId: state.projectId,
        column,
        value: getStateValueForColumn(state, column),
        updatedAt: now,
      },
    });
  }
  pendingWrites.set(`meta:${state.projectId}`, {
    type: 'meta',
    key: `meta:${state.projectId}`,
    value: metaRecord(state, dirtyColumns),
  });
  if (touchActive) {
    pendingWrites.set(ACTIVE_KEY, {
      type: 'meta',
      key: ACTIVE_KEY,
      value: { projectId: ACTIVE_KEY, activeProjectId: state.projectId },
    });
  }
  scheduleFlush(delay);
}

export function writeLocalColumns(state, columns, dirtyColumns) {
  queueLocalColumnWrites(state, columns, dirtyColumns, { touchActive: true });
}

/** Write another project's columns without changing the active workspace pointer. */
export function writeLocalColumnsQuiet(state, columns, dirtyColumns) {
  queueLocalColumnWrites(state, columns, dirtyColumns, { touchActive: false });
}

export function writeFullLocalProject(state, dirtyColumns = []) {
  if (!state?.projectId) return;
  writeLocalColumns(state, PERSISTABLE_COLUMNS, dirtyColumns);
  scheduleFlush(0);
}

export function writeLocalMeta(state, dirtyColumns) {
  if (!state?.projectId) return;
  pendingWrites.set(`meta:${state.projectId}`, {
    type: 'meta',
    key: `meta:${state.projectId}`,
    value: metaRecord(state, dirtyColumns),
  });
  scheduleFlush(0);
}

export async function mergeUnsyncedLocal(projectState) {
  if (!projectState?.projectId) {
    return { state: projectState, synced: true, dirtyColumns: [] };
  }

  const meta = await readLocalMeta(projectState.projectId);
  if (!meta) {
    writeFullLocalProject(projectState, []);
    return { state: projectState, synced: true, dirtyColumns: [] };
  }

  const ui = meta.ui || {};
  let state = {
    ...projectState,
    activeView: ui.activeView || projectState.activeView,
    selectedStageId: ui.selectedStageId ?? projectState.selectedStageId ?? null,
    focusMode: typeof ui.focusMode === 'boolean' ? ui.focusMode : projectState.focusMode,
  };

  const sameCloud = !meta.cloudUpdatedAt || meta.cloudUpdatedAt === projectState.cloudUpdatedAt;
  if (sameCloud && meta.dirtyColumns?.length) {
    const values = await readLocalColumns(projectState.projectId, meta.dirtyColumns);
    state = applyColumnValuesToState(state, values);
    writeLocalMeta(state, meta.dirtyColumns);
    return { state, synced: false, dirtyColumns: meta.dirtyColumns };
  }

  writeFullLocalProject(state, []);
  return { state, synced: true, dirtyColumns: [] };
}

export async function clearLocalProject(projectId) {
  if (!projectId) return;
  await flushLocalWrites();
  try {
    const db = await openDb();
    const tx = db.transaction([META_STORE, COLUMN_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(projectId);
    const columnStore = tx.objectStore(COLUMN_STORE);
    for (const column of PERSISTABLE_COLUMNS) {
      columnStore.delete(columnKey(projectId, column));
    }
    await transactionDone(tx);
  } catch {
    /* ignore */
  }
}

export { capturePersistable };
