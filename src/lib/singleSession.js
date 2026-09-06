import { getSupabaseClient } from './supabase';
import { clearStoredProjectId } from '../utils/projectSession';

export const SESSION_TAKEN_KEY = 'lifev1-session-taken';
export const SESSION_TAKEN_MESSAGE =
  'Αποσυνδέθηκες γιατί ο λογαριασμός συνδέθηκε από άλλη συσκευή ή εφαρμογή.';

export function consumeSessionTakenMessage() {
  try {
    if (!sessionStorage.getItem(SESSION_TAKEN_KEY)) return false;
    sessionStorage.removeItem(SESSION_TAKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function signOutLocallyTaken() {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: 'local' });
  }
  clearStoredProjectId();
}

/** Concurrent logins are allowed — kept as a no-op for existing call sites. */
export async function claimExclusiveSession() {}

export async function isExclusiveSessionActive(session) {
  return Boolean(session?.user);
}

export function watchExclusiveSession() {
  return () => {};
}
