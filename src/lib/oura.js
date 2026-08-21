import { getSupabaseClient, getSupabaseUrl, getSupabaseAnonKey } from './supabase';
import { localTodayIsoDate, pickBestOuraRow } from '../utils/selfDateUtils';

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

function functionsBaseUrl() {
  return `${getSupabaseUrl()}/functions/v1`;
}

async function invokeFunction(name, { body } = {}) {
  const token = await getAccessToken();
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) throw new Error('Missing Supabase anon key');

  const res = await fetch(`${functionsBaseUrl()}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Oura request failed (${res.status})`);
  }
  if (payload?.error) {
    throw new Error(payload.error);
  }
  return payload;
}

export function getOuraReturnUrl() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return 'lifev1://oura-callback?success=1';
  }
  const configured = import.meta.env.VITE_APP_URL?.trim();
  const origin = configured || window.location.origin;
  const url = new URL(origin);
  url.searchParams.set('oura', 'connected');
  return url.toString();
}

export function openOuraAuthorizeUrl(url) {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    import('@capacitor/browser').then(({ Browser }) => {
      Browser.open({ url });
    }).catch(() => {
      window.location.href = url;
    });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function startOuraConnect() {
  return invokeFunction('oura-oauth-start', {
    body: { return_to: getOuraReturnUrl() },
  });
}

export async function syncOura() {
  return invokeFunction('oura-sync');
}

export async function disconnectOura() {
  const supabase = getSupabaseOrThrow();
  const { error } = await supabase.rpc('disconnect_my_oura');
  if (error) throw error;
  return { ok: true };
}

export async function getOuraStatus() {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase.rpc('get_my_oura_status');
  if (error) throw error;
  return data;
}

export async function fetchTodayOuraMetrics() {
  const supabase = getSupabaseOrThrow();
  const today = localTodayIsoDate();
  const { data, error } = await supabase
    .from('oura_daily_metrics')
    .select('*')
    .eq('day', today)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchLatestOuraMetrics() {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('oura_daily_metrics')
    .select('*')
    .order('day', { ascending: false })
    .limit(30);

  if (error) throw error;
  return pickBestOuraRow(data);
}

export async function fetchOuraMetricsForDay(day) {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('oura_daily_metrics')
    .select('*')
    .eq('day', day)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchOuraMetricsRange(limit = 30) {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('oura_daily_metrics')
    .select('*')
    .order('day', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

