import { listOpenConversations, normalizeConversation } from '../conversations';
import { pullCloudBundle, pushCloudBundle, deleteCloudConversation } from './cloudStore';
import { loadLocalBundle, loadLocalProfile, saveLocalBundle, saveLocalMemories, saveLocalProfile } from './localStore';
import { createMemory, isNewer, normalizeMemory, normalizeProfile, nowIso } from './normalize';
import { DURABLE_KINDS, IDENTITY_KINDS } from './kinds';
import { normalizeSearchText } from '../snapshot/loadAppCatalog';

const SEARCH_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'what', 'when',
  'your', 'you', 'are', 'was', 'can', 'how', 'why', 'please',
  'και', 'για', 'να', 'το', 'τα', 'τη', 'την', 'του', 'των', 'με', 'μου', 'σου',
  'που', 'πως', 'τι', 'αν', 'δε', 'δεν', 'θα', 'ειναι', 'μια', 'ενα', 'στο', 'στη', 'στην',
]);

function tokensFrom(text) {
  return normalizeSearchText(text)
    .split(' ')
    .filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
}

function memoryKey(memory) {
  return `${memory.kind}:${normalizeSearchText(memory.title).slice(0, 64)}`;
}

function appendUnique(existing, addition, max = 800) {
  const next = String(addition || '').trim();
  if (!next) return existing;
  const current = String(existing || '').trim();
  if (!current) return next.slice(0, max);
  if (normalizeSearchText(current).includes(normalizeSearchText(next).slice(0, 48))) return current;
  const merged = `${current}\n${next}`;
  return merged.length <= max ? merged : current;
}

function foldMemoriesIntoProfile(memories) {
  const profile = loadLocalProfile();
  const next = { ...profile, preferences: { ...(profile.preferences || {}) }, laws: [...(profile.laws || [])] };
  let changed = false;

  for (const memory of memories || []) {
    if (memory.kind === 'preference') {
      const key = normalizeSearchText(memory.title).replace(/\s+/g, '_').slice(0, 40) || 'note';
      if (!next.preferences[key]) {
        next.preferences[key] = String(memory.body || '').slice(0, 200);
        changed = true;
      }
      continue;
    }
    if (memory.kind === 'style' && !String(next.style || '').trim()) {
      next.style = String(memory.body || '').slice(0, 400);
      changed = true;
      continue;
    }
    if (memory.kind === 'brand' && !String(next.brand || '').trim()) {
      next.brand = String(memory.body || '').slice(0, 400);
      changed = true;
      continue;
    }
    if (memory.kind === 'value') {
      const merged = appendUnique(next.values, memory.body, 800);
      if (merged !== next.values) {
        next.values = merged;
        changed = true;
      }
    }
    if (memory.kind === 'goal') {
      const merged = appendUnique(next.goals, memory.body, 800);
      if (merged !== next.goals) {
        next.goals = merged;
        changed = true;
      }
    }
    if (memory.kind === 'law') {
      const text = String(memory.body || memory.title || '').replace(/\s+/g, ' ').trim();
      if (text) {
        const laws = Array.isArray(next.laws) ? [...next.laws] : [];
        const exists = laws.some((law) => normalizeSearchText(law) === normalizeSearchText(text));
        if (!exists && laws.length < 10) {
          next.laws = [...laws, text.slice(0, 180)];
          changed = true;
        }
      }
    }
  }

  if (changed) persistProfile(next);
}

function mergeById(localItems, cloudItems, getUpdatedAt) {
  const map = new Map();
  for (const item of [...(cloudItems || []), ...(localItems || [])]) {
    if (!item?.id) continue;
    const existing = map.get(item.id);
    if (!existing || isNewer(getUpdatedAt(item), getUpdatedAt(existing))) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function mergeConversations(localList, cloudList) {
  const merged = mergeById(localList, cloudList, (item) => item.updatedAt);
  return merged.map((item) => {
    const local = (localList || []).find((row) => row.id === item.id);
    const cloud = (cloudList || []).find((row) => row.id === item.id);
    const messages = mergeById(local?.messages || [], cloud?.messages || [], (message) => message.createdAt);
    return normalizeConversation({
      ...item,
      messages: messages.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    });
  }).filter(Boolean);
}

function mergeProfile(local, cloud) {
  if (!cloud) return normalizeProfile(local);
  if (!local) return normalizeProfile(cloud);
  return isNewer(local.updatedAt, cloud.updatedAt) ? normalizeProfile(local) : normalizeProfile(cloud);
}

export function loadMemoryRepository() {
  const local = loadLocalBundle();
  return {
    ...local,
    conversations: listOpenConversations(local.conversations),
    allConversations: local.conversations,
  };
}

export async function syncMemoryRepository() {
  const local = loadLocalBundle();
  let cloud = null;
  try {
    cloud = await pullCloudBundle();
  } catch {
    cloud = null;
  }

  const merged = {
    profile: mergeProfile(local.profile, cloud?.profile),
    conversations: mergeConversations(local.conversations, cloud?.conversations),
    memories: mergeById(local.memories, cloud?.memories, (item) => item.updatedAt).map(normalizeMemory).filter(Boolean),
    activeConversationId: local.activeConversationId,
  };

  saveLocalBundle(merged);
  try {
    await pushCloudBundle(merged);
  } catch {
    /* offline or unsigned-in is fine; local copy remains */
  }

  return {
    ...merged,
    conversations: listOpenConversations(merged.conversations),
    allConversations: merged.conversations,
  };
}

export function persistConversations(conversations, activeConversationId) {
  const bundle = saveLocalBundle({
    conversations,
    activeConversationId: activeConversationId || undefined,
  });
  pushCloudBundle(bundle).catch(() => {});
  return listOpenConversations(bundle.conversations);
}

let profilePushTimer = null;

export function persistProfile(profile) {
  const next = saveLocalProfile({ ...profile, updatedAt: nowIso() });
  if (profilePushTimer) window.clearTimeout(profilePushTimer);
  profilePushTimer = window.setTimeout(() => {
    pushCloudBundle(loadLocalBundle()).catch(() => {});
  }, 800);
  return next;
}

export function persistMemory(partial) {
  const memory = createMemory(partial);
  const memories = [memory, ...loadLocalBundle().memories.filter((item) => item.id !== memory.id)];
  saveLocalMemories(memories);
  const bundle = loadLocalBundle();
  pushCloudBundle(bundle).catch(() => {});
  return memory;
}

export function persistMemories(incoming = []) {
  const incomingList = incoming.map(normalizeMemory).filter(Boolean);
  if (!incomingList.length) return loadLocalBundle().memories;
  const existing = loadLocalBundle().memories;
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incomingList) map.set(item.id, item);
  const memories = [...map.values()];
  saveLocalMemories(memories);
  pushCloudBundle(loadLocalBundle()).catch(() => {});
  return memories;
}

export function supersedeMemory(id, nextPartial) {
  const next = createMemory({ ...nextPartial, status: 'current' });
  const memories = loadLocalBundle().memories.map((item) => (
    item.id === id
      ? { ...item, status: 'superseded', supersededBy: next.id, updatedAt: nowIso() }
      : item
  ));
  memories.unshift(next);
  saveLocalMemories(memories);
  pushCloudBundle(loadLocalBundle()).catch(() => {});
  return next;
}

export async function archiveConversationRemote(id) {
  try {
    await deleteCloudConversation(id);
  } catch {
    /* local archive still stands */
  }
}

export function persistLearnedMemories(incoming = [], { conversationId = null } = {}) {
  const learned = incoming
    .map((item) => normalizeMemory({
      ...item,
      status: 'current',
      sourceKind: item.sourceKind || 'brain',
      conversationId: item.conversationId || conversationId || null,
    }))
    .filter((item) => item && DURABLE_KINDS.includes(item.kind));

  if (!learned.length) return [];

  const existing = loadLocalBundle().memories;
  const currentByKey = new Map();
  for (const item of existing) {
    if (item.status === 'current') currentByKey.set(memoryKey(item), item);
  }

  const nextById = new Map(existing.map((item) => [item.id, item]));
  const created = [];

  for (const item of learned) {
    const key = memoryKey(item);
    const previous = currentByKey.get(key);
    if (previous && normalizeSearchText(previous.body) === normalizeSearchText(item.body)) continue;
    if (previous) {
      nextById.set(previous.id, {
        ...previous,
        status: 'superseded',
        supersededBy: item.id,
        updatedAt: nowIso(),
      });
    }
    nextById.set(item.id, item);
    currentByKey.set(key, item);
    created.push(item);
  }

  if (!created.length) return [];

  const memories = [...nextById.values()].sort((a, b) => (
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  ));
  saveLocalMemories(memories);
  pushCloudBundle(loadLocalBundle()).catch(() => {});
  foldMemoriesIntoProfile(created);
  return created;
}

export function searchMemories(query, { status = 'current', limit = 12 } = {}) {
  const memories = loadLocalBundle().memories.filter((item) => !status || item.status === status);
  const tokens = tokensFrom(query);
  if (!tokens.length) {
    return memories
      .filter((item) => DURABLE_KINDS.includes(item.kind))
      .slice(0, limit);
  }

  return memories
    .map((item) => {
      const hay = normalizeSearchText(`${item.title} ${item.body} ${item.kind}`);
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += token.length >= 6 ? 2 : 1;
      }
      if (!score) return { item, score: 0 };
      if (DURABLE_KINDS.includes(item.kind)) score += 2;
      if (IDENTITY_KINDS.includes(item.kind)) score += 2;
      if (item.sourceKind === 'user') score += 1;
      if (item.kind === 'insight' || item.kind === 'draft') score -= 1;
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.updatedAt || '').localeCompare(String(a.item.updatedAt || '')))
    .slice(0, limit)
    .map((row) => row.item);
}

export function currentMemoriesByKind(kinds = []) {
  const allowed = new Set(kinds);
  return loadLocalBundle().memories.filter((item) => (
    item.status === 'current' && (!allowed.size || allowed.has(item.kind))
  ));
}

export function exportMemoryBackup() {
  const bundle = loadLocalBundle();
  return {
    version: 1,
    exportedAt: nowIso(),
    providerAgnostic: true,
    originalsPreserved: true,
    profile: bundle.profile,
    conversations: bundle.conversations,
    memories: bundle.memories,
  };
}

export function downloadMemoryBackup() {
  const backup = exportMemoryBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lifev1-brain-memory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return backup;
}
