import { getSupabaseClient, isSupabaseConfigured } from '../supabase';

const LOCAL_KEY = 'lifev1-open-items';
const SOURCES = new Set(['manual', 'mail', 'call', 'day', 'commitment']);

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

const SOURCE_LABELS = {
  manual: 'Χέρι',
  mail: 'Mail',
  call: 'Κλήση',
  day: 'Μέρα',
  commitment: 'Δέσμευση',
};

export function openSourceLabel(source) {
  return SOURCE_LABELS[source] || source || '';
}

function compactOpenRecordItem(item) {
  return {
    id: String(item?.id || ''),
    title: String(item?.title || '').trim(),
    source: String(item?.source || ''),
  };
}

/** Per due-date archive: done vs still open. Dates with no due date land on fallbackDate. */
export function openRecordsByDate(items, fallbackDate) {
  const map = {};
  for (const item of items || []) {
    if (!item || item.status === 'deleted') continue;
    const title = String(item.title || '').trim();
    if (!title) continue;
    const date = item.dueOn || fallbackDate;
    if (!date) continue;
    if (!map[date]) map[date] = { done: [], missed: [] };
    const compact = compactOpenRecordItem({ ...item, title });
    if (item.status === 'done') map[date].done.push(compact);
    else map[date].missed.push(compact);
    map[date].done = map[date].done.slice(0, 40);
    map[date].missed = map[date].missed.slice(0, 40);
  }
  return map;
}

export function openRecordsEqual(left, right) {
  const signature = (record) => {
    const line = (list) => (Array.isArray(list) ? list : [])
      .map((item) => `${item?.id || ''}|${String(item?.title || '').trim()}|${item?.source || ''}`)
      .sort()
      .join('\n');
    return `${line(record?.done)}\n--\n${line(record?.missed)}`;
  };
  return signature(left) === signature(right);
}

export function normalizeOpenItem(row) {
  if (!row) return null;
  const level = row.level === 'business' ? 'business' : 'human';
  const source = SOURCES.has(row.source) ? row.source : 'manual';
  const status = row.status === 'done' || row.status === 'deleted' ? row.status : 'open';
  return {
    id: row.id,
    title: String(row.title || '').trim(),
    body: String(row.body || ''),
    dueOn: row.dueOn || row.due_on || '',
    level,
    source,
    sourceRef: row.sourceRef || row.source_ref || '',
    status,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function toCloudRow(item, userId) {
  return {
    user_id: userId,
    title: item.title,
    body: item.body || '',
    due_on: item.dueOn || null,
    level: item.level === 'business' ? 'business' : 'human',
    source: SOURCES.has(item.source) ? item.source : 'manual',
    source_ref: item.sourceRef || '',
    status: item.status || 'open',
  };
}

async function userId() {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

async function cloudAvailable() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  const id = await userId();
  if (!supabase || !id) return null;
  return { supabase, id };
}

export async function listOpenItems() {
  const cloud = await cloudAvailable();
  if (!cloud) return readLocal().map(normalizeOpenItem).filter((item) => item?.title);
  const { data, error } = await cloud.supabase
    .from('open_items')
    .select('id, title, body, due_on, level, source, source_ref, status, created_at, updated_at')
    .neq('status', 'deleted')
    .order('due_on', { ascending: true });
  if (error) return readLocal().map(normalizeOpenItem).filter((item) => item?.title);
  const items = (data || []).map(normalizeOpenItem).filter((item) => item?.title);
  writeLocal(items);
  return items;
}

export async function createOpenItem(input) {
  const item = normalizeOpenItem({
    ...input,
    id: input.id || `local-${crypto.randomUUID()}`,
    status: 'open',
    title: input.title,
  });
  if (!item?.title) throw new Error('Η εκκρεμότητα χρειάζεται τίτλο.');
  const cloud = await cloudAvailable();
  if (!cloud) {
    const next = [item, ...readLocal()];
    writeLocal(next);
    return item;
  }
  const { data, error } = await cloud.supabase
    .from('open_items')
    .insert(toCloudRow(item, cloud.id))
    .select('id, title, body, due_on, level, source, source_ref, status, created_at, updated_at')
    .single();
  if (error) throw error;
  return normalizeOpenItem(data);
}

export async function setOpenItemStatus(id, status) {
  if (!id) throw new Error('Λείπει η εκκρεμότητα.');
  const nextStatus = status === 'done' || status === 'deleted' ? status : 'open';
  const cloud = await cloudAvailable();
  if (!cloud || String(id).startsWith('local-')) {
    const next = readLocal().map((item) => (
      item.id === id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item
    ));
    writeLocal(next);
    return next.find((item) => item.id === id) || null;
  }
  const { data, error } = await cloud.supabase
    .from('open_items')
    .update({ status: nextStatus })
    .eq('id', id)
    .select('id, title, body, due_on, level, source, source_ref, status, created_at, updated_at')
    .single();
  if (error) throw error;
  return normalizeOpenItem(data);
}

export async function findOpenItem(hint) {
  const needle = String(hint || '').trim().toLowerCase();
  if (!needle) return null;
  const items = await listOpenItems();
  return items.find((item) => item.id === hint)
    || items.find((item) => item.title.toLowerCase() === needle)
    || items.find((item) => item.title.toLowerCase().includes(needle))
    || null;
}
