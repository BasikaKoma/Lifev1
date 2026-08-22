import { compactConversationHistory } from '../conversations';
import { compactText } from '../snapshot/loadAppCatalog';
import { DURABLE_KINDS, IDENTITY_KINDS } from './kinds';
import { currentMemoriesByKind, searchMemories } from './repository';
import { loadLocalProfile } from './localStore';

function compactMemory(memory) {
  return {
    id: memory.id,
    kind: memory.kind,
    status: memory.status,
    title: compactText(memory.title, 80),
    body: compactText(memory.body, 280),
    sourceKind: memory.sourceKind,
    sourceId: memory.sourceId,
    supersededBy: memory.supersededBy,
    updatedAt: memory.updatedAt,
  };
}

function compactWhoYouAre(profile) {
  const who = {};
  if (profile.identity) who.identity = compactText(profile.identity, 400);
  if (profile.values) who.values = compactText(profile.values, 400);
  if (profile.goals) who.goals = compactText(profile.goals, 400);
  if (profile.style) who.style = compactText(profile.style, 300);
  if (profile.brand) who.brand = compactText(profile.brand, 300);
  if (profile.preferences && Object.keys(profile.preferences).length) {
    const preferences = { ...profile.preferences };
    delete preferences.__laws;
    if (Object.keys(preferences).length) who.preferences = preferences;
  }
  return who;
}

function compactLaws(profile, memories = []) {
  const fromProfile = (profile.laws || []).map((law) => compactText(law, 180)).filter(Boolean);
  const fromMemories = (memories || [])
    .filter((item) => item.kind === 'law')
    .map((item) => compactText(item.body || item.title, 180))
    .filter(Boolean);
  const seen = new Set();
  const laws = [];
  for (const law of [...fromProfile, ...fromMemories]) {
    const key = law.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    laws.push(law);
    if (laws.length >= 10) break;
  }
  return laws;
}

function compactHistory(history) {
  return (history || []).slice(-12).map((item) => ({
    role: item.role,
    text: compactText(item.text, 420),
  }));
}

export function buildMemoryPack({
  question = '',
  history = [],
  conversation = null,
  context = null,
  tools = [],
  localFolders = [],
} = {}) {
  const profile = loadLocalProfile();
  const identity = currentMemoriesByKind(IDENTITY_KINDS).slice(0, 16).map(compactMemory);
  const decisions = currentMemoriesByKind(['decision', 'conclusion']).slice(0, 8).map(compactMemory);
  const lawMemories = currentMemoriesByKind(['law']).slice(0, 10).map(compactMemory);
  const packedIds = new Set([...identity, ...decisions, ...lawMemories].map((item) => item.id));
  const relevant = searchMemories(question, { status: 'current', limit: 8 })
    .filter((item) => !packedIds.has(item.id) && DURABLE_KINDS.includes(item.kind))
    .map(compactMemory);
  const conversationHistory = history.length
    ? history
    : compactConversationHistory(conversation?.messages || []);
  const laws = compactLaws(profile, lawMemories);

  return {
    whoYouAre: compactWhoYouAre(profile),
    laws,
    lookingAt: context,
    conversation: compactHistory(conversationHistory),
    relevantMemories: relevant,
    standingFacts: [...identity, ...decisions, ...lawMemories],
    localFolders,
    tools: (tools || []).map((tool) => tool.name || tool),
    rules: {
      memoryIsOwnedByLifev1: true,
      doNotRelyOnProviderConversationIds: true,
      preferCurrentOverOldOrSuperseded: true,
      keepOriginalText: true,
      speakAsThisPersonCollaborator: true,
      respectStandingLaws: true,
    },
  };
}
