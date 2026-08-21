import { compactConversationHistory } from '../conversations';
import { currentMemoriesByKind, searchMemories } from './repository';
import { loadLocalProfile } from './localStore';

const IDENTITY_KINDS = ['preference', 'value', 'goal', 'style', 'brand', 'writing_example'];

function compactMemory(memory) {
  return {
    id: memory.id,
    kind: memory.kind,
    status: memory.status,
    title: memory.title,
    body: memory.body,
    sourceKind: memory.sourceKind,
    sourceId: memory.sourceId,
    supersededBy: memory.supersededBy,
    updatedAt: memory.updatedAt,
  };
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
  const identity = currentMemoriesByKind(IDENTITY_KINDS).slice(0, 20).map(compactMemory);
  const decisions = currentMemoriesByKind(['decision', 'conclusion']).slice(0, 12).map(compactMemory);
  const relevant = searchMemories(question, { status: 'current', limit: 10 }).map(compactMemory);
  const conversationHistory = history.length
    ? history
    : compactConversationHistory(conversation?.messages || []);

  return {
    whoYouAre: {
      identity: profile.identity,
      values: profile.values,
      goals: profile.goals,
      style: profile.style,
      brand: profile.brand,
      preferences: profile.preferences,
    },
    lookingAt: context,
    conversation: conversationHistory,
    relevantMemories: relevant,
    standingFacts: [...identity, ...decisions],
    localFolders,
    tools: (tools || []).map((tool) => tool.name || tool),
    rules: {
      memoryIsOwnedByLifev1: true,
      doNotRelyOnProviderConversationIds: true,
      preferCurrentOverOldOrSuperseded: true,
      keepOriginalText: true,
    },
  };
}
