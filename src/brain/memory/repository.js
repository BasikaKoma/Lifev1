import { listOpenConversations, normalizeConversation } from '../conversations';
import { pullCloudBundle, pushCloudBundle, deleteCloudConversation } from './cloudStore';
import { loadLocalBundle, saveLocalBundle, saveLocalMemories, saveLocalProfile } from './localStore';
import { createMemory, isNewer, normalizeMemory, normalizeProfile, nowIso } from './normalize';
import { normalizeSearchText } from '../snapshot/loadAppCatalog';

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

export function searchMemories(query, { status = 'current', limit = 12 } = {}) {
  const needle = normalizeSearchText(query);
  const memories = loadLocalBundle().memories.filter((item) => !status || item.status === status);
  if (!needle) return memories.slice(0, limit);
  return memories
    .filter((item) => {
      const hay = normalizeSearchText(`${item.title} ${item.body} ${item.kind}`);
      return hay.includes(needle);
    })
    .slice(0, limit);
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
