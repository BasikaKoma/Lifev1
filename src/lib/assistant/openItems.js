import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { addDaysIso, compareBlocks } from '../path/logic';
import { toIsoDate } from '../path/schema';
import { readPathBundleLocal } from '../path/store';
import { localTodayIsoDate } from '../../utils/selfDateUtils';

const LOCAL_KEY = 'lifev1-open-items';
const SOURCES = new Set(['manual', 'mail', 'call', 'day', 'commitment']);

// Weekly-plan blocks are read from Path itself; rows with source 'day' are old server copies.
export const OPEN_WINDOW_DAYS = 14;
const RECORD_LIMIT = 40;

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
  day: 'Weekly plan',
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

function localDayOf(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : toIsoDate(date);
}

/** Rows that come from the assistant (mail, calls, manual), not copies of plan blocks. */
function assistantItems(items) {
  return (items || []).filter((item) => item?.title && item.source !== 'day' && item.status !== 'deleted');
}

function itemDay(item) {
  return item.dueOn || localDayOf(item.createdAt);
}

// Planned and Moved blocks are still open.
function blockRowStatus(status) {
  if (status === 'Done') return 'done';
  if (status === 'Skipped') return 'skipped';
  return 'open';
}

/**
 * Per-day archive for the last OPEN_WINDOW_DAYS days: what got done and what stayed open.
 * Skipped blocks count as neither. The server builds the same map in _shared/daily.ts.
 */
export function buildOpenRecords({ items = [], blocks = [], today, days = OPEN_WINDOW_DAYS }) {
  const map = {};
  for (let offset = days; offset >= 0; offset -= 1) {
    map[addDaysIso(today, -offset)] = { done: [], missed: [] };
  }
  const add = (date, bucket, entry) => {
    if (map[date] && entry.title) map[date][bucket].push(entry);
  };
  for (const block of blocks || []) {
    const status = blockRowStatus(block?.status);
    if (status === 'skipped') continue;
    add(block.date, status === 'done' ? 'done' : 'missed', compactOpenRecordItem({ ...block, source: 'day' }));
  }
  for (const item of assistantItems(items)) {
    add(itemDay(item), item.status === 'done' ? 'done' : 'missed', compactOpenRecordItem(item));
  }
  // Plain code-unit order, same as the server, so both write identical arrays.
  const byId = (a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
  for (const record of Object.values(map)) {
    record.done = record.done.sort(byId).slice(0, RECORD_LIMIT);
    record.missed = record.missed.sort(byId).slice(0, RECORD_LIMIT);
  }
  return map;
}

/**
 * What Self shows: today's open work, overdue work and what closed today,
 * merging Path blocks with assistant items. Overdue plan blocks stop after OPEN_WINDOW_DAYS.
 */
export function buildSelfOpenList({ items = [], blocks = [], today, days = OPEN_WINDOW_DAYS }) {
  const from = addDaysIso(today, -days);
  const rows = [];
  for (const block of blocks || []) {
    if (!block?.date || block.date < from || block.date > today) continue;
    const status = blockRowStatus(block.status);
    rows.push({
      key: `block:${block.id}`,
      kind: 'block',
      id: block.id,
      title: String(block.title || '').trim(),
      date: block.date,
      status,
      closedToday: status !== 'open' && (block.date === today || localDayOf(block.updatedAt) === today),
      block,
    });
  }
  for (const item of assistantItems(items)) {
    const date = item.dueOn || '';
    if (date > today) continue;
    rows.push({
      key: `item:${item.id}`,
      kind: 'item',
      id: item.id,
      title: item.title,
      date,
      status: item.status === 'done' ? 'done' : 'open',
      closedToday: item.status === 'done' && localDayOf(item.updatedAt) === today,
      item,
    });
  }
  const byDay = (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'block' ? -1 : 1;
    if (a.kind === 'block') return compareBlocks(a.block, b.block);
    return a.title.localeCompare(b.title, 'el');
  };
  const open = rows.filter((row) => row.status === 'open');
  return {
    today: open.filter((row) => !row.date || row.date === today).sort(byDay),
    overdue: open
      .filter((row) => row.date && row.date < today)
      .sort((a, b) => b.date.localeCompare(a.date) || byDay(a, b)),
    closedToday: rows.filter((row) => row.closedToday).sort(byDay),
  };
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

/** True when items live in Supabase, so the server pull (mail, calls) can run. */
export async function openItemsCloudReady() {
  return Boolean(await cloudAvailable());
}

function readLocalItems() {
  return readLocal().map(normalizeOpenItem).filter((item) => item?.title && item.source !== 'day');
}

/** Assistant items (mail, calls, manual). Plan blocks are not here: they live in Path. */
export async function listOpenItems() {
  const cloud = await cloudAvailable();
  if (!cloud) return readLocalItems();
  const { data, error } = await cloud.supabase
    .from('open_items')
    .select('id, title, body, due_on, level, source, source_ref, status, created_at, updated_at')
    .neq('status', 'deleted')
    .neq('source', 'day')
    .order('due_on', { ascending: true });
  if (error) return readLocalItems();
  const items = (data || []).map(normalizeOpenItem).filter((item) => item?.title);
  writeLocal(items);
  return items;
}

function openPlanRows(today = localTodayIsoDate()) {
  const blocks = readPathBundleLocal().blocks;
  const list = buildSelfOpenList({ blocks, today });
  return [...list.today, ...list.overdue];
}

/** Open items plus today's and overdue plan blocks, shaped alike, for the assistant. */
export async function listOpenWork() {
  const items = await listOpenItems();
  const plan = openPlanRows().map((row) => ({
    id: row.id,
    title: row.title,
    body: '',
    dueOn: row.date,
    level: 'human',
    source: 'day',
    sourceRef: row.id,
    status: 'open',
    createdAt: row.block.createdAt || null,
    updatedAt: row.block.updatedAt || null,
  }));
  return [...plan, ...items];
}

/** An open plan block (today or overdue) by id or title, for assistant actions. */
export function findOpenPlanBlock(hint) {
  const needle = String(hint || '').trim().toLowerCase();
  if (!needle) return null;
  const rows = openPlanRows();
  const row = rows.find((item) => item.id === hint)
    || rows.find((item) => item.title.toLowerCase() === needle)
    || rows.find((item) => item.title.toLowerCase().includes(needle));
  return row?.block || null;
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
