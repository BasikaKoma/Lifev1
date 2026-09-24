import { getSupabaseAnonKey, getSupabaseClient, getSupabaseUrl } from '../supabase';

function getSupabaseOrThrow() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

async function getAccessToken() {
  const supabase = getSupabaseOrThrow();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  let session = sessionData.session;
  if (!session?.access_token) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshed.session;
  }
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');
  return token;
}

export async function invokeAssistantFunction(name, body = {}) {
  const token = await getAccessToken();
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) throw new Error('Missing Supabase anon key');
  const res = await fetch(`${getSupabaseUrl()}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.error) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

export function getSupabaseForAssistant() {
  return getSupabaseOrThrow();
}
