import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { clearStoredProjectId } from '../utils/projectSession';
import { claimExclusiveSession } from './singleSession';

export function requiresAuth() {
  return isSupabaseConfigured();
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** Wait until the Supabase client has an auth session (post-login race guard). */
export async function waitForAuthSession(maxAttempts = 12, delayMs = 50) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.user) return data.session;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentSession() {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function signUpWithEmail(email, password, displayName) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: displayName
      ? { data: { display_name: displayName.trim() } }
      : undefined,
  });

  if (error) throw error;
  if (data.session) await claimExclusiveSession(data.session);
  return data;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  if (data.session) await claimExclusiveSession(data.session);
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  clearStoredProjectId();
}

export function subscribeToAuthChanges(callback) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event, session);
  });

  return () => data.subscription.unsubscribe();
}
