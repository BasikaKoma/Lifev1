import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { waitForAuthSession } from '../auth';
import { createEmptyBundle, normalizeBundle, nowIso } from './schema';

const STORAGE_KEY = 'lifev1-path';
const SAVE_DEBOUNCE_MS = 400;

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeBundle(raw ? JSON.parse(raw) : null);
  } catch {
    return createEmptyBundle();
  }
}

function writeLocal(bundle) {
  const next = normalizeBundle(bundle);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const session = await waitForAuthSession();
  return session?.user || null;
}

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');
  return supabase;
}

function mergeBundles(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;
  return String(local.updatedAt || '') >= String(cloud.updatedAt || '') ? local : cloud;
}

function rowToBundle(row) {
  if (!row) return createEmptyBundle();
  return normalizeBundle({
    plan: row.plan,
    goals: row.goals,
    blocks: row.blocks,
    templates: row.templates,
    metrics: row.metrics,
    updatedAt: row.updated_at,
  });
}

export async function pullPathBundle() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('path_state')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return rowToBundle(data);
}

export async function pushPathBundle(bundle) {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: 'offline-or-signed-out' };
  const supabase = requireClient();
  const next = normalizeBundle(bundle);
  const { error } = await supabase.from('path_state').upsert({
    user_id: user.id,
    plan: next.plan,
    goals: next.goals,
    blocks: next.blocks,
    templates: next.templates,
    metrics: next.metrics,
    updated_at: next.updatedAt || nowIso(),
  });
  if (error) {
    if (isMissingTable(error)) return { ok: false, reason: 'missing-table' };
    throw error;
  }
  return { ok: true };
}

export async function loadPathBundle() {
  const local = readLocal();
  try {
    const cloud = await pullPathBundle();
    const merged = mergeBundles(local, cloud);
    writeLocal(merged);
    return merged;
  } catch {
    return local;
  }
}

let pendingBundle = null;
let saveTimer = null;
let savePromise = null;
let pendingCloud = false;
let saving = false;
let lastError = '';
const listeners = new Set();

function pathSaveSnapshot() {
  return {
    pending: pendingCloud || Boolean(pendingBundle),
    saving,
    error: lastError,
  };
}

function notifyPathSave() {
  const snapshot = pathSaveSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribePathSave(listener) {
  listeners.add(listener);
  listener(pathSaveSnapshot());
  return () => listeners.delete(listener);
}

export function hasPendingPathSave() {
  return pendingCloud || Boolean(pendingBundle) || Boolean(saveTimer);
}

export function queuePathSave(bundle) {
  const next = writeLocal({
    ...normalizeBundle(bundle),
    updatedAt: bundle?.updatedAt || nowIso(),
  });
  pendingBundle = next;
  pendingCloud = true;
  lastError = '';
  notifyPathSave();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushPathNow().catch(() => {});
  }, SAVE_DEBOUNCE_MS);
  return next;
}

export async function flushPathNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingBundle && !pendingCloud) return { ok: true };
  if (savePromise) return savePromise;

  savePromise = (async () => {
    saving = true;
    notifyPathSave();
    try {
      while (pendingBundle || pendingCloud) {
        const next = pendingBundle || readLocal();
        pendingBundle = null;
        writeLocal(next);
        const result = await pushPathBundle(next);
        if (result?.ok === false && (result.reason === 'missing-table' || result.reason === 'offline-or-signed-out')) {
          if (!pendingBundle) pendingCloud = false;
          lastError = '';
          if (!pendingBundle) return { ok: true, localOnly: true };
          continue;
        }
        lastError = '';
        if (!pendingBundle) {
          pendingCloud = false;
          return { ok: true };
        }
      }
      return { ok: true };
    } catch (err) {
      pendingCloud = true;
      lastError = err?.message || 'Path could not save.';
      throw err;
    } finally {
      saving = false;
      savePromise = null;
      notifyPathSave();
    }
  })();

  return savePromise;
}

export async function savePathBundle(bundle) {
  queuePathSave(bundle);
  return flushPathNow();
}

export function readPathBundleLocal() {
  return readLocal();
}
