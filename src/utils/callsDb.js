import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { waitForAuthSession } from '../lib/auth';

const BUCKET = 'call-recordings';

export const CALL_OUTCOMES = [
  { id: 'meeting', label: 'Ραντεβού' },
  { id: 'interested', label: 'Ενδιαφέρον' },
  { id: 'callback', label: 'Follow-up' },
  { id: 'rejected', label: 'Απόρριψη' },
  { id: 'no_answer', label: 'Αναπάντητη' },
  { id: 'other', label: 'Άλλο' },
];

export const CALL_DIRECTIONS = [
  { id: 'outgoing', label: 'Εξερχόμενη' },
  { id: 'incoming', label: 'Εισερχόμενη' },
];

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Το Supabase δεν είναι ρυθμισμένο.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client μη διαθέσιμο.');
  return supabase;
}

async function requireUserId() {
  const session = await waitForAuthSession();
  if (!session?.user) throw new Error('Δεν έχεις συνδεθεί.');
  return session.user.id;
}

function normalizeRow(row) {
  return {
    id: row.id,
    contact: row.contact || '',
    phone: row.phone || '',
    direction: row.direction || 'outgoing',
    purpose: row.purpose || '',
    outcome: row.outcome || '',
    notes: row.notes || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    transcript: row.transcript || '',
    audioPath: row.audio_path || null,
    durationSeconds: row.duration_seconds || 0,
    calledAt: row.called_at || row.created_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function extensionForMime(mimeType = '') {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export async function listCalls() {
  const supabase = requireClient();
  await requireUserId();
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .order('called_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

/** Upload the recorded blob to the user's private folder and return its object path. */
export async function uploadCallAudio(callId, blob) {
  const supabase = requireClient();
  const userId = await requireUserId();
  const ext = extensionForMime(blob?.type || '');
  const path = `${userId}/${callId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob?.type || 'audio/webm',
      upsert: true,
    });
  if (error) throw error;
  return path;
}

/** Signed URL for private playback (valid for ~1 hour). */
export async function getCallAudioUrl(audioPath) {
  if (!audioPath) return null;
  const supabase = requireClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(audioPath, 3600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function createCall({
  contact = '',
  phone = '',
  direction = 'outgoing',
  purpose = '',
  outcome = '',
  notes = '',
  tags = [],
  transcript = '',
  audioPath = null,
  durationSeconds = 0,
  calledAt = null,
} = {}) {
  const supabase = requireClient();
  const userId = await requireUserId();
  const row = {
    user_id: userId,
    contact: contact || null,
    phone: phone || null,
    direction,
    purpose: purpose || null,
    outcome: outcome || null,
    notes: notes || null,
    tags: Array.isArray(tags) ? tags : [],
    transcript: transcript || null,
    audio_path: audioPath,
    duration_seconds: Math.max(0, Math.round(durationSeconds || 0)),
    called_at: calledAt || new Date().toISOString(),
  };
  const { data, error } = await supabase.from('calls').insert(row).select('*').single();
  if (error) throw error;
  return normalizeRow(data);
}

export async function updateCall(callId, patch = {}) {
  const supabase = requireClient();
  await requireUserId();
  const row = {};
  if (patch.contact !== undefined) row.contact = patch.contact || null;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.direction !== undefined) row.direction = patch.direction;
  if (patch.purpose !== undefined) row.purpose = patch.purpose || null;
  if (patch.outcome !== undefined) row.outcome = patch.outcome || null;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.tags !== undefined) row.tags = Array.isArray(patch.tags) ? patch.tags : [];
  if (patch.transcript !== undefined) row.transcript = patch.transcript || null;
  if (patch.audioPath !== undefined) row.audio_path = patch.audioPath;
  if (patch.durationSeconds !== undefined) {
    row.duration_seconds = Math.max(0, Math.round(patch.durationSeconds || 0));
  }
  if (patch.calledAt !== undefined) row.called_at = patch.calledAt;

  const { data, error } = await supabase
    .from('calls')
    .update(row)
    .eq('id', callId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeRow(data);
}

export async function deleteCall(callId, audioPath = null) {
  const supabase = requireClient();
  await requireUserId();
  if (audioPath) {
    await supabase.storage.from(BUCKET).remove([audioPath]).catch(() => {});
  }
  const { error } = await supabase.from('calls').delete().eq('id', callId);
  if (error) throw error;
  return true;
}

/** Aggregate stats for the analysis header. */
export function summarizeCalls(calls = []) {
  const total = calls.length;
  const totalSeconds = calls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
  const avgSeconds = total ? Math.round(totalSeconds / total) : 0;
  const outcomes = {};
  for (const call of calls) {
    const key = call.outcome || 'unset';
    outcomes[key] = (outcomes[key] || 0) + 1;
  }
  const positive = (outcomes.meeting || 0) + (outcomes.interested || 0);
  const conversionRate = total ? Math.round((positive / total) * 100) : 0;
  return { total, totalSeconds, avgSeconds, outcomes, conversionRate };
}
