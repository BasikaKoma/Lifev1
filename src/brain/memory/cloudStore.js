import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { waitForAuthSession } from '../../lib/auth';
import { normalizeConversation } from '../conversations';
import { normalizeMemory, normalizeProfile } from './normalize';

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

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

export async function pullCloudBundle() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = requireClient();

  const [profileRes, conversationsRes, messagesRes, memoriesRes] = await Promise.all([
    supabase.from('brain_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('brain_conversations').select('*').eq('user_id', user.id),
    supabase.from('brain_messages').select('*').eq('user_id', user.id),
    supabase.from('brain_memories').select('*').eq('user_id', user.id),
  ]);

  for (const result of [profileRes, conversationsRes, messagesRes, memoriesRes]) {
    if (result.error) {
      if (isMissingTable(result.error)) return null;
      throw result.error;
    }
  }

  const messagesByConversation = new Map();
  for (const row of messagesRes.data || []) {
    const list = messagesByConversation.get(row.conversation_id) || [];
    list.push({
      id: row.id,
      role: row.role,
      kind: row.kind,
      text: row.body,
      insights: row.insights,
      error: row.error,
      meta: row.meta,
      createdAt: row.created_at,
    });
    messagesByConversation.set(row.conversation_id, list);
  }

  const conversations = (conversationsRes.data || []).map((row) => normalizeConversation({
    id: row.id,
    title: row.title,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: (messagesByConversation.get(row.id) || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
  })).filter(Boolean);

  return {
    profile: normalizeProfile(profileRes.data),
    conversations,
    memories: (memoriesRes.data || []).map(normalizeMemory).filter(Boolean),
  };
}

export async function pushCloudBundle(bundle) {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: 'offline-or-signed-out' };
  const supabase = requireClient();
  const profile = normalizeProfile(bundle.profile);
  const conversations = (bundle.conversations || []).map(normalizeConversation).filter(Boolean);
  const memories = (bundle.memories || []).map(normalizeMemory).filter(Boolean);

  const profileRow = {
    user_id: user.id,
    identity: profile.identity,
    values_text: profile.values,
    goals: profile.goals,
    style: profile.style,
    brand: profile.brand,
    preferences: profile.preferences,
    updated_at: profile.updatedAt,
  };

  const conversationRows = conversations.map((item) => ({
    id: item.id,
    user_id: user.id,
    title: item.title,
    archived_at: item.archivedAt || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }));

  const messageRows = conversations.flatMap((item) => (item.messages || []).map((message) => ({
    id: message.id,
    user_id: user.id,
    conversation_id: item.id,
    role: message.role,
    kind: message.kind || 'ask',
    body: message.text || '',
    insights: message.insights || [],
    error: message.error || null,
    meta: message.meta || {},
    created_at: message.createdAt,
  })));

  const memoryRows = memories.map((item) => ({
    id: item.id,
    user_id: user.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    body: item.body,
    data: item.data,
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    conversation_id: item.conversationId,
    superseded_by: item.supersededBy,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }));

  const profileResult = await supabase.from('brain_profiles').upsert(profileRow);
  if (profileResult.error) {
    if (isMissingTable(profileResult.error)) return { ok: false, reason: 'missing-table' };
    throw profileResult.error;
  }

  if (conversationRows.length) {
    const { error } = await supabase.from('brain_conversations').upsert(conversationRows);
    if (error) throw error;
  }

  if (messageRows.length) {
    const { error } = await supabase.from('brain_messages').upsert(messageRows);
    if (error) throw error;
  }

  if (memoryRows.length) {
    const { error } = await supabase.from('brain_memories').upsert(memoryRows);
    if (error) throw error;
  }

  return { ok: true };
}

export async function deleteCloudConversation(id) {
  const user = await getSessionUser();
  if (!user || !id) return;
  const supabase = requireClient();
  const { error } = await supabase
    .from('brain_conversations')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error && !isMissingTable(error)) throw error;
}
