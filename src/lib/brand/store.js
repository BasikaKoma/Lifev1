import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { waitForAuthSession } from '../auth';
import { loadLocalProfile, saveLocalProfile } from '../../brain/memory/localStore';
import {
  createEmptyDna,
  normalizeBrandItem,
  normalizeDna,
  nowIso,
} from './schema';

const STORAGE_KEY = 'lifev1-personal-brand';

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeBundle(parsed);
  } catch {
    return createEmptyBundle();
  }
}

function writeLocal(bundle) {
  const next = normalizeBundle(bundle);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function createEmptyBundle() {
  return {
    handle: '',
    dna: createEmptyDna(),
    items: [],
    dismissedSignalIds: [],
    activeItemId: null,
    updatedAt: nowIso(),
  };
}

export function normalizeBundle(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const dna = normalizeDna(source.dna, { handle: source.handle });
  return {
    handle: String(source.handle || dna.handle || ''),
    dna: { ...dna, handle: String(source.handle || dna.handle || '') },
    items: (Array.isArray(source.items) ? source.items : []).map(normalizeBrandItem),
    dismissedSignalIds: Array.isArray(source.dismissedSignalIds)
      ? source.dismissedSignalIds.map(String)
      : Array.isArray(source.dismissed_signal_ids)
        ? source.dismissed_signal_ids.map(String)
        : [],
    activeItemId: source.activeItemId || source.active_item_id || null,
    updatedAt: source.updatedAt || source.updated_at || nowIso(),
  };
}

function rowToItem(row) {
  return normalizeBrandItem({
    id: row.id,
    stage: row.stage,
    kind: row.kind,
    title: row.title,
    hook: row.hook,
    body: row.body,
    why: row.why,
    angle: row.angle,
    sourceLabel: row.source_label,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    platforms: row.platforms,
    pillarId: row.pillar_id,
    progress: row.progress,
    variations: row.variations,
    publishedAt: row.published_at,
    publishedUrl: row.published_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function itemToRow(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    stage: item.stage,
    kind: item.kind,
    title: item.title,
    hook: item.hook,
    body: item.body,
    why: item.why,
    angle: item.angle,
    source_label: item.sourceLabel,
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    platforms: item.platforms,
    pillar_id: item.pillarId,
    progress: item.progress,
    variations: item.variations || {},
    published_at: item.publishedAt,
    published_url: item.publishedUrl || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
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
  const localNewer = String(local.updatedAt || '') >= String(cloud.updatedAt || '');
  const byId = new Map();
  for (const item of cloud.items || []) byId.set(item.id, item);
  for (const item of local.items || []) {
    const existing = byId.get(item.id);
    if (!existing || String(item.updatedAt || '') >= String(existing.updatedAt || '')) {
      byId.set(item.id, item);
    }
  }
  return {
    handle: localNewer ? local.handle : (cloud.handle || local.handle),
    dna: localNewer ? local.dna : cloud.dna,
    items: [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    dismissedSignalIds: [...new Set([...(cloud.dismissedSignalIds || []), ...(local.dismissedSignalIds || [])])],
    activeItemId: localNewer ? local.activeItemId : (cloud.activeItemId || local.activeItemId),
    updatedAt: localNewer ? local.updatedAt : cloud.updatedAt,
  };
}

export async function pullBrandBundle() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = requireClient();
  const [metaRes, itemsRes] = await Promise.all([
    supabase.from('personal_brand').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('brand_items').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
  ]);
  if (metaRes.error) {
    if (isMissingTable(metaRes.error)) return null;
    throw metaRes.error;
  }
  if (itemsRes.error) {
    if (isMissingTable(itemsRes.error)) return null;
    throw itemsRes.error;
  }
  const meta = metaRes.data;
  if (!meta && !(itemsRes.data || []).length) return createEmptyBundle();
  return normalizeBundle({
    handle: meta?.handle || '',
    dna: meta?.dna || {},
    dismissedSignalIds: meta?.dismissed_signal_ids || [],
    activeItemId: meta?.active_item_id || null,
    updatedAt: meta?.updated_at,
    items: (itemsRes.data || []).map(rowToItem),
  });
}

export async function pushBrandBundle(bundle) {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: 'offline-or-signed-out' };
  const supabase = requireClient();
  const next = normalizeBundle(bundle);
  const { error: metaError } = await supabase.from('personal_brand').upsert({
    user_id: user.id,
    handle: next.handle || next.dna.handle || null,
    dna: next.dna,
    dismissed_signal_ids: next.dismissedSignalIds,
    active_item_id: next.activeItemId,
    updated_at: next.updatedAt || nowIso(),
  });
  if (metaError) {
    if (isMissingTable(metaError)) return { ok: false, reason: 'missing-table' };
    throw metaError;
  }

  const { data: existing, error: listError } = await supabase
    .from('brand_items')
    .select('id')
    .eq('user_id', user.id);
  if (listError) throw listError;
  const keep = new Set(next.items.map((item) => item.id));
  const stale = (existing || []).map((row) => row.id).filter((id) => !keep.has(id));
  if (stale.length) {
    const { error: deleteError } = await supabase.from('brand_items').delete().in('id', stale);
    if (deleteError) throw deleteError;
  }
  if (next.items.length) {
    const { error: upsertError } = await supabase.from('brand_items').upsert(
      next.items.map((item) => itemToRow(item, user.id)),
    );
    if (upsertError) throw upsertError;
  }
  return { ok: true };
}

export function seedDnaFromBrain(dna) {
  const profile = loadLocalProfile();
  const next = normalizeDna(dna);
  if (!next.whoYouAre && profile.identity) next.whoYouAre = profile.identity;
  if (!next.standFor && profile.values) next.standFor = profile.values;
  if (!next.voice && profile.style) next.voice = profile.style;
  if (!next.audience && profile.brand) {
    next.audience = '';
    if (!next.whoYouAre) next.whoYouAre = profile.brand;
  }
  return next;
}

export function syncDnaToBrain(dna) {
  const profile = loadLocalProfile();
  const summary = [
    dna.whoYouAre && `Who: ${dna.whoYouAre}`,
    dna.standFor && `Stands for: ${dna.standFor}`,
    dna.voice && `Voice: ${dna.voice}`,
    dna.donts && `Don't: ${dna.donts}`,
    dna.audience && `Audience: ${dna.audience}`,
  ].filter(Boolean).join('\n');
  if (!summary) return profile;
  return saveLocalProfile({
    ...profile,
    brand: summary.slice(0, 1200),
    identity: dna.whoYouAre || profile.identity,
    values: dna.standFor || profile.values,
    style: dna.voice || profile.style,
  });
}

export async function loadBrandBundle() {
  const local = readLocal();
  try {
    const cloud = await pullBrandBundle();
    const merged = mergeBundles(local, cloud);
    const seeded = {
      ...merged,
      dna: seedDnaFromBrain(merged.dna),
    };
    writeLocal(seeded);
    return seeded;
  } catch {
    return {
      ...local,
      dna: seedDnaFromBrain(local.dna),
    };
  }
}

export async function saveBrandBundle(bundle) {
  const next = writeLocal({
    ...normalizeBundle(bundle),
    updatedAt: nowIso(),
  });
  try {
    syncDnaToBrain(next.dna);
  } catch {
    /* local brain profile is best-effort */
  }
  try {
    await pushBrandBundle(next);
  } catch {
    /* stay local if cloud is down */
  }
  return next;
}

export function readBrandBundleLocal() {
  return readLocal();
}
