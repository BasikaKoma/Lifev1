const DB_NAME = 'next-move-vault';
const STORE = 'handles';
const ROOT_KEY = 'root';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, ROOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle() {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(ROOT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function clearHandle() {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(ROOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

async function ensurePermission(handle, { interactive = false } = {}) {
  if (!handle?.queryPermission) return false;
  const mode = { mode: 'readwrite' };
  let state = await handle.queryPermission(mode);
  if (state === 'granted') return true;
  if (!interactive || !handle.requestPermission) return false;
  state = await handle.requestPermission(mode);
  return state === 'granted';
}

function splitRel(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid path');
  }
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
}

async function getDirectory(root, dirs, { create = false } = {}) {
  let current = root;
  for (const name of dirs) {
    current = await current.getDirectoryHandle(name, { create });
  }
  return current;
}

export function canUseWebVault() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function createWebVaultBackend() {
  let rootHandle = null;

  async function requireRoot() {
    if (rootHandle) return rootHandle;
    const stored = await loadHandle();
    if (stored && await ensurePermission(stored)) {
      rootHandle = stored;
      return rootHandle;
    }
    throw new Error('Διάλεξε ξανά τον φάκελο αποθήκευσης.');
  }

  return {
    kind: 'web',
    async getStatus() {
      if (rootHandle) {
        return {
          connected: true,
          path: rootHandle.name,
          displayName: rootHandle.name,
        };
      }
      const stored = await loadHandle();
      if (!stored) return { connected: false, path: null, displayName: null };
      const ok = await ensurePermission(stored);
      if (!ok) {
        return { connected: false, path: stored.name, displayName: stored.name, needsPermission: true };
      }
      rootHandle = stored;
      return { connected: true, path: stored.name, displayName: stored.name };
    },
    async pickFolder() {
      const handle = await window.showDirectoryPicker({
        id: 'next-move-vault',
        mode: 'readwrite',
        startIn: 'documents',
      });
      const ok = await ensurePermission(handle, { interactive: true });
      if (!ok) throw new Error('Χρειάζεται άδεια εγγραφής στον φάκελο.');
      await saveHandle(handle);
      rootHandle = handle;
      return {
        connected: true,
        path: handle.name,
        displayName: handle.name,
      };
    },
    async disconnect() {
      rootHandle = null;
      await clearHandle();
      return { connected: false, path: null, displayName: null };
    },
    async writeText(relativePath, contents) {
      const root = await requireRoot();
      const { dirs, name } = splitRel(relativePath);
      const dir = await getDirectory(root, dirs, { create: true });
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(String(contents ?? ''));
      await writable.close();
      return { ok: true, path: relativePath };
    },
    async readText(relativePath) {
      try {
        const root = await requireRoot();
        const { dirs, name } = splitRel(relativePath);
        const dir = await getDirectory(root, dirs, { create: false });
        const file = await dir.getFileHandle(name, { create: false });
        const blob = await file.getFile();
        return await blob.text();
      } catch (err) {
        if (err?.name === 'NotFoundError') return null;
        throw err;
      }
    },
    async exists(relativePath) {
      try {
        const text = await this.readText(relativePath);
        return text != null;
      } catch {
        return false;
      }
    },
    async listDir(relativePath = '') {
      const root = await requireRoot();
      const parts = String(relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
      const dir = parts.length ? await getDirectory(root, parts, { create: false }) : root;
      const prefix = parts.length ? `${parts.join('/')}/` : '';
      const entries = [];
      for await (const [name, handle] of dir.entries()) {
        entries.push({
          name,
          kind: handle.kind === 'directory' ? 'dir' : 'file',
          relativePath: `${prefix}${name}`,
        });
      }
      return entries;
    },
    async remove(relativePath) {
      const root = await requireRoot();
      const { dirs, name } = splitRel(relativePath);
      const dir = await getDirectory(root, dirs, { create: false });
      await dir.removeEntry(name, { recursive: true });
      return { ok: true };
    },
    async reveal() {
      throw new Error('Άνοιξε τον φάκελο χειροκίνητα από τα αρχεία του υπολογιστή.');
    },
  };
}
