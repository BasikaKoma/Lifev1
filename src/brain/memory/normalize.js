import { MEMORY_KINDS, MEMORY_STATUSES, SOURCE_KINDS } from './kinds';

export function createMemoryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newerIso(a, b) {
  return String(a || '') >= String(b || '') ? a : b;
}

export function isNewer(a, b) {
  return String(a || '') > String(b || '');
}

function normalizeLaws(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const laws = [];
  for (const item of source) {
    const text = String(item || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    laws.push(text.slice(0, 180));
    if (laws.length >= 10) break;
  }
  return laws;
}

export function createEmptyProfile() {
  return {
    identity: '',
    values: '',
    goals: '',
    style: '',
    brand: '',
    laws: [],
    preferences: {},
    updatedAt: nowIso(),
  };
}

export function normalizeProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preferences = source.preferences && typeof source.preferences === 'object'
    ? { ...source.preferences }
    : {};
  const laws = normalizeLaws(source.laws || preferences.__laws);
  delete preferences.__laws;
  return {
    identity: String(source.identity || ''),
    values: String(source.values || source.values_text || ''),
    goals: String(source.goals || ''),
    style: String(source.style || ''),
    brand: String(source.brand || ''),
    laws,
    preferences,
    updatedAt: source.updatedAt || source.updated_at || nowIso(),
  };
}

export function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  const body = String(raw.body || '').trim();
  if (!title && !body) return null;
  const kind = MEMORY_KINDS.includes(raw.kind) ? raw.kind : 'insight';
  const status = MEMORY_STATUSES.includes(raw.status) ? raw.status : 'current';
  const sourceKind = SOURCE_KINDS.includes(raw.sourceKind || raw.source_kind)
    ? (raw.sourceKind || raw.source_kind)
    : 'user';
  return {
    id: raw.id || createMemoryId(),
    kind,
    status,
    title: title || kind,
    body,
    data: raw.data && typeof raw.data === 'object' ? raw.data : {},
    sourceKind,
    sourceId: raw.sourceId || raw.source_id || null,
    conversationId: raw.conversationId || raw.conversation_id || null,
    supersededBy: raw.supersededBy || raw.superseded_by || null,
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || nowIso(),
  };
}

export function createMemory(partial = {}) {
  return normalizeMemory({
    id: createMemoryId(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...partial,
  });
}
