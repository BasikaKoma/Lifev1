import { getSupabaseClient } from '../supabase';
import { invokeAssistantFunction } from '../assistant/invoke';

export const PLAN_KINDS = ['block', 'dayplan', 'routine', 'rhythm'];
export const TIMER_KINDS = ['timer'];

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

/**
 * Makes the user's unsent future rows of these kinds match `reminders`:
 * rows no longer wanted are deleted, new or changed ones are upserted by key.
 * keyPrefix narrows the rows this call owns (a timer only touches its own session).
 */
export async function syncScheduledPushes(userId, kinds, reminders, { keyPrefix = '' } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { ok: false, reason: 'offline' };

  let query = supabase
    .from('push_schedule')
    .select('id, key, title, body, url')
    .eq('user_id', userId)
    .is('sent_at', null)
    .in('kind', kinds)
    .gt('fire_at', new Date().toISOString());
  if (keyPrefix) query = query.like('key', `${keyPrefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  const { data: existing, error } = await query;
  if (error) {
    if (isMissingTable(error)) return { ok: false, reason: 'missing-table' };
    throw error;
  }

  const wanted = new Map(reminders.map((item) => [item.key, item]));
  const current = new Map((existing || []).map((row) => [row.key, row]));

  const staleIds = (existing || []).filter((row) => !wanted.has(row.key)).map((row) => row.id);
  if (staleIds.length) {
    const { error: deleteError } = await supabase.from('push_schedule').delete().in('id', staleIds);
    if (deleteError) throw deleteError;
  }

  const updatedAt = new Date().toISOString();
  const rows = reminders
    .filter((item) => {
      const row = current.get(item.key);
      return !row || row.title !== item.title || row.body !== item.body || (row.url || null) !== (item.url || null);
    })
    .map((item) => ({
      user_id: userId,
      key: item.key,
      kind: item.kind,
      fire_at: item.fireAt.toISOString(),
      title: item.title.slice(0, 160),
      body: item.body.slice(0, 400),
      url: item.url || null,
      updated_at: updatedAt,
    }));
  if (rows.length) {
    const { error: upsertError } = await supabase.from('push_schedule').upsert(rows, { onConflict: 'user_id,key' });
    if (upsertError) throw upsertError;
  }
  return { ok: true, removed: staleIds.length, written: rows.length };
}

/** Project rhythm lives per project; reminders only cover projects the user owns. */
export async function loadRhythmProjects(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, recurring')
    .eq('user_id', userId);
  if (error) return [];
  return (data || []).filter((project) => Array.isArray(project?.recurring?.items) && project.recurring.items.length);
}

/** Queue a notification for right now and dispatch it, so every device of the account gets it. */
export async function sendTestPush(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) throw new Error('Δεν είσαι συνδεδεμένος.');
  const now = new Date();
  const { error } = await supabase.from('push_schedule').insert({
    user_id: userId,
    key: `test:${now.getTime()}`,
    kind: 'test',
    fire_at: now.toISOString(),
    title: 'lifev1',
    body: `Δοκιμαστική ειδοποίηση · ${now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`,
    url: '/settings',
  });
  if (error) {
    if (isMissingTable(error)) throw new Error('Λείπει ο πίνακας push_schedule — τρέξε το supabase/047_push_notifications.sql.');
    throw error;
  }
  return invokeAssistantFunction('push-dispatch', {});
}
