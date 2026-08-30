import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { waitForAuthSession } from '../auth';
import { createEmptyBundle, normalizeBundle, nowIso } from './schema';

const STORAGE_KEY = 'lifev1-path';

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

export async function savePathBundle(bundle) {
  const next = writeLocal({
    ...normalizeBundle(bundle),
    updatedAt: nowIso(),
  });
  try {
    await pushPathBundle(next);
  } catch {
    /* stay local if cloud is down */
  }
  return next;
}

export function readPathBundleLocal() {
  return readLocal();
}
