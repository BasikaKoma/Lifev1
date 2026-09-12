import {
  loadActiveConversationId,
  loadConversations,
  saveActiveConversationId,
  saveConversations,
} from '../conversations';
import { createEmptyProfile, normalizeMemory, normalizeProfile } from './normalize';
import { mirrorVaultJson } from '../../lib/vault/mirror';
import { brainConversationsPath, brainMemoriesPath, brainProfilePath } from '../../lib/vault/paths';

const PROFILE_KEY = 'lifev1-brain-profile';
const MEMORIES_KEY = 'lifev1-brain-memories';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadLocalProfile() {
  return normalizeProfile(readJson(PROFILE_KEY, null));
}

export function saveLocalProfile(profile) {
  const next = normalizeProfile(profile);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  mirrorVaultJson(brainProfilePath(), next);
  return next;
}

export function loadLocalMemories() {
  const parsed = readJson(MEMORIES_KEY, []);
  return (Array.isArray(parsed) ? parsed : []).map(normalizeMemory).filter(Boolean);
}

export function saveLocalMemories(memories) {
  const next = (Array.isArray(memories) ? memories : []).map(normalizeMemory).filter(Boolean);
  localStorage.setItem(MEMORIES_KEY, JSON.stringify(next));
  mirrorVaultJson(brainMemoriesPath(), next);
  return next;
}

export function loadLocalBundle() {
  return {
    profile: loadLocalProfile() || createEmptyProfile(),
    conversations: loadConversations(),
    memories: loadLocalMemories(),
    activeConversationId: loadActiveConversationId(),
  };
}

export function saveLocalBundle({ profile, conversations, memories, activeConversationId } = {}) {
  if (profile) saveLocalProfile(profile);
  if (conversations) saveConversations(conversations);
  if (memories) saveLocalMemories(memories);
  if (activeConversationId) saveActiveConversationId(activeConversationId);
  const bundle = loadLocalBundle();
  mirrorVaultJson(brainConversationsPath(), {
    conversations: bundle.conversations,
    activeConversationId: bundle.activeConversationId,
  });
  return bundle;
}
