import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { waitForAuthSession } from '../auth';
import { createPathId, nowIso } from './schema';

const DB_NAME = 'lifev1-path-files';
const DB_VERSION = 1;
const STORE = 'files';
const BUCKET = 'path-plans';
const IMPORT_FILE_META_KEY = 'lifev1-path-import-file';
export const MAX_PLAN_FILE_BYTES = 20 * 1024 * 1024;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB unavailable'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
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

async function withStore(mode, fn) {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  return fn(tx.objectStore(STORE));
}

function asPdfBlob(file) {
  if (file instanceof Blob) {
    return file.slice(0, file.size, file.type || 'application/pdf');
  }
  return new Blob([file], { type: 'application/pdf' });
}

export function formatPlanFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertPlanPdf(file) {
  if (!file) throw new Error('Choose a PDF file.');
  const namedPdf = file.name?.toLowerCase().endsWith('.pdf');
  if (file.type && file.type !== 'application/pdf' && !namedPdf) {
    throw new Error('Only PDF files are supported.');
  }
  if (file.size > MAX_PLAN_FILE_BYTES) {
    throw new Error('PDF must be 20 MB or smaller.');
  }
}

export function saveImportFileMeta(meta) {
  try {
    if (!meta?.id) {
      localStorage.removeItem(IMPORT_FILE_META_KEY);
      return;
    }
    const { blob, ...safe } = meta;
    localStorage.setItem(IMPORT_FILE_META_KEY, JSON.stringify(safe));
  } catch {
    /* ignore quota */
  }
}

export function loadImportFileMeta() {
  try {
    const raw = localStorage.getItem(IMPORT_FILE_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function metaFromRow(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'plan.pdf',
    size: Number.isFinite(row.size) ? row.size : extras.size ?? null,
    type: row.type || 'application/pdf',
    uploadedAt: row.uploadedAt || nowIso(),
    storagePath: row.storagePath || extras.storagePath || null,
  };
}

export async function readPlanFileRecord(id) {
  if (!id) return null;
  try {
    return await withStore('readonly', (store) => requestToPromise(store.get(id))) || null;
  } catch {
    return null;
  }
}

export async function writePlanFileRecord(record) {
  if (!record?.id || !record.blob) return;
  await withStore('readwrite', (store) => requestToPromise(store.put(record)));
}

export async function deleteLocalPlanFile(id) {
  if (!id) return;
  try {
    await withStore('readwrite', (store) => requestToPromise(store.delete(id)));
  } catch {
    /* ignore */
  }
}

async function getSessionUserId() {
  if (!isSupabaseConfigured()) return null;
  const session = await waitForAuthSession();
  return session?.user?.id || null;
}

async function uploadPlanFileToCloud(id, blob) {
  const supabase = getSupabaseClient();
  const userId = await getSessionUserId();
  if (!supabase || !userId) return null;
  const path = `${userId}/${id}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

async function downloadPlanFileFromCloud(storagePath) {
  const supabase = getSupabaseClient();
  if (!supabase || !storagePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  return data || null;
}

export async function getPlanFileSignedUrl(storagePath) {
  if (!storagePath) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function deleteCloudPlanFile(storagePath) {
  if (!storagePath || !isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
}

export async function savePlanSourceFile(file) {
  assertPlanPdf(file);
  const blob = asPdfBlob(file);
  const meta = {
    id: createPathId('planfile'),
    name: file.name || 'plan.pdf',
    size: blob.size,
    type: blob.type || 'application/pdf',
    uploadedAt: nowIso(),
    storagePath: null,
  };
  await writePlanFileRecord({ ...meta, blob });
  saveImportFileMeta(meta);
  try {
    const storagePath = await uploadPlanFileToCloud(meta.id, blob);
    if (storagePath) {
      meta.storagePath = storagePath;
      await writePlanFileRecord({ ...meta, blob });
      saveImportFileMeta(meta);
    }
  } catch {
    /* keep the local copy even if cloud upload fails */
  }
  return meta;
}

export async function syncPlanSourceFile(sourceFile) {
  const meta = metaFromRow(sourceFile);
  if (!meta?.id || meta.storagePath) return meta;
  const local = await readPlanFileRecord(meta.id);
  if (!local?.blob) return meta;
  try {
    const storagePath = await uploadPlanFileToCloud(meta.id, local.blob);
    if (!storagePath) return meta;
    const next = { ...meta, storagePath };
    await writePlanFileRecord({ ...local, ...next });
    saveImportFileMeta(next);
    return next;
  } catch {
    return meta;
  }
}

export async function getPlanFileBlob(sourceFile) {
  const meta = metaFromRow(sourceFile);
  if (meta?.id) {
    const local = await readPlanFileRecord(meta.id);
    if (local?.blob) return local.blob;
  }
  if (!meta?.storagePath) return null;
  const downloaded = await downloadPlanFileFromCloud(meta.storagePath);
  if (!downloaded) return null;
  if (meta.id) {
    await writePlanFileRecord({ ...meta, blob: downloaded, size: downloaded.size });
  }
  return downloaded;
}

export async function deletePlanSourceFile(sourceFile) {
  const meta = metaFromRow(sourceFile);
  if (!meta) return;
  await deleteLocalPlanFile(meta.id);
  await deleteCloudPlanFile(meta.storagePath);
}

export async function replacePlanSourceFile(previous, nextFile) {
  const next = await savePlanSourceFile(nextFile);
  if (previous?.id && previous.id !== next.id) {
    await deletePlanSourceFile(previous);
  }
  return next;
}

export async function loadPdfDocument(data) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = worker.default;
  return getDocument({ data }).promise;
}
