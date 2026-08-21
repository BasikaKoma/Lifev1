import { getSupabaseClient, decodeJwtPayload } from './supabase';
import { clearStoredProjectId } from '../utils/projectSession';

export const SESSION_TAKEN_KEY = 'lifev1-session-taken';
export const SESSION_TAKEN_MESSAGE =
  'Αποσυνδέθηκες γιατί ο λογαριασμός συνδέθηκε από άλλη συσκευή ή εφαρμογή.';

const CHECK_INTERVAL_MS = 25000;

export function getAuthSessionId(session) {
  const payload = decodeJwtPayload(session?.access_token);
  return typeof payload?.session_id === 'string' && payload.session_id
    ? payload.session_id
    : null;
}

export function consumeSessionTakenMessage() {
  try {
    if (!sessionStorage.getItem(SESSION_TAKEN_KEY)) return false;
    sessionStorage.removeItem(SESSION_TAKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

function markSessionTaken() {
  try {
    sessionStorage.setItem(SESSION_TAKEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function signOutLocallyTaken() {
  markSessionTaken();
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: 'local' });
  }
  clearStoredProjectId();
}

async function persistActiveSessionId(supabase, session, sessionId) {
  const userId = session.user.id;
  const { data, error } = await supabase
    .from('profiles')
    .update({
      active_session_id: sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id');

  if (error) {
    console.warn('Failed to claim exclusive session', error.message);
    return;
  }

  if (data?.length) return;

  const { error: insertError } = await supabase.from('profiles').insert({
    id: userId,
    email: session.user.email ?? null,
    active_session_id: sessionId,
  });

  if (insertError && insertError.code !== '23505') {
    console.warn('Failed to insert exclusive session profile', insertError.message);
  }
}

/** Make this login the only active one: store it and revoke every other session. */
export async function claimExclusiveSession(session) {
  const supabase = getSupabaseClient();
  const sessionId = getAuthSessionId(session);
  if (!supabase || !session?.user?.id || !sessionId) return;

  await persistActiveSessionId(supabase, session, sessionId);

  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    console.warn('Failed to revoke other sessions', error.message);
  }
}

export async function isExclusiveSessionActive(session) {
  const supabase = getSupabaseClient();
  const sessionId = getAuthSessionId(session);
  const userId = session?.user?.id;
  if (!supabase || !sessionId || !userId) return Boolean(session?.user);

  const { data, error } = await supabase
    .from('profiles')
    .select('active_session_id')
    .eq('id', userId)
    .maybeSingle();

  // Stay signed in on network errors so offline use still works.
  if (error) return true;
  if (!data?.active_session_id) return true;
  return data.active_session_id === sessionId;
}

export function watchExclusiveSession(session, onTaken) {
  const supabase = getSupabaseClient();
  const sessionId = getAuthSessionId(session);
  const userId = session?.user?.id;
  if (!supabase || !sessionId || !userId || typeof onTaken !== 'function') {
    return () => {};
  }

  let stopped = false;
  let handling = false;

  const takeOver = async () => {
    if (stopped || handling) return;
    handling = true;
    try {
      await onTaken();
    } finally {
      handling = false;
    }
  };

  const check = async () => {
    if (stopped) return;
    const { data } = await supabase.auth.getSession();
    const current = data?.session;
    if (!current) return;
    const ok = await isExclusiveSessionActive(current);
    if (!ok) await takeOver();
  };

  const channel = supabase
    .channel(`single-session:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        const nextId = payload.new?.active_session_id;
        if (nextId && nextId !== sessionId) {
          takeOver();
        }
      }
    )
    .subscribe();

  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', check);
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_INTERVAL_MS);

  return () => {
    stopped = true;
    supabase.removeChannel(channel);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', check);
    clearInterval(interval);
  };
}
