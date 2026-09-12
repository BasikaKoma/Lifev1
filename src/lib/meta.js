import { getSupabaseClient, getSupabaseUrl, getSupabaseAnonKey } from './supabase';

export const EMPTY_META_STATUS = {
  connected: false,
  connected_at: null,
  token_valid: false,
  expires_soon: false,
  scopes: null,
  fb_user_id: null,
  needs_page_pick: false,
  missing_instagram: false,
  missing_pages: false,
  facebook: null,
  instagram: null,
  destinations: [],
};

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
  if (!token) throw new Error('Δεν είσαι συνδεδεμένος.');
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
    throw new Error(payload.error || `Meta request failed (${res.status})`);
  }
  if (payload?.error) {
    throw new Error(payload.error);
  }
  return payload;
}

export function getMetaReturnUrl() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return 'lifev1://meta-callback?success=1';
  }
  const configured = import.meta.env.VITE_APP_URL?.trim();
  const origin = configured || window.location.origin;
  const url = new URL(origin);
  url.searchParams.set('meta', 'connected');
  return url.toString();
}

export function openMetaAuthorizeUrl(url) {
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

export async function startMetaConnect() {
  return invokeFunction('meta-oauth-start', {
    body: { return_to: getMetaReturnUrl() },
  });
}

export async function refreshMetaDestinations() {
  return invokeFunction('meta-refresh-destinations');
}

export async function disconnectMeta() {
  try {
    await invokeFunction('meta-disconnect');
    return { ok: true };
  } catch (err) {
    const supabase = getSupabaseOrThrow();
    const { error } = await supabase.rpc('disconnect_my_meta');
    if (error) throw error;
    return { ok: true };
  }
}

export async function getMetaStatus() {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase.rpc('get_my_meta_status');
  if (error) throw error;
  return normalizeMetaStatus(data);
}

export async function setMetaDestinations(pageId, igUserId = null) {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase.rpc('set_my_meta_destinations', {
    p_page_id: pageId || null,
    p_ig_user_id: igUserId,
  });
  if (error) throw error;
  return normalizeMetaStatus(data);
}

export function normalizeMetaStatus(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_META_STATUS };
  return {
    ...EMPTY_META_STATUS,
    ...raw,
    destinations: Array.isArray(raw.destinations) ? raw.destinations : [],
  };
}

export function formatIgHandle(username) {
  const value = String(username || '').trim().replace(/^@/, '');
  return value ? `@${value}` : '';
}

export function metaStatusLabel(status) {
  if (!status?.connected) return 'Connect Meta';
  const ig = formatIgHandle(status.instagram?.ig_username);
  const page = status.facebook?.page_name || '';
  if (ig && page) return `${ig} · ${page}`;
  if (ig) return ig;
  if (page) return page;
  if (status.missing_pages) return 'Meta · χωρίς Page';
  return 'Meta συνδεδεμένο';
}

export function metaStatusHint(status) {
  if (!status?.connected) return '';
  if (!status.token_valid) return 'Το token έληξε. Ξανασύνδεσε τον λογαριασμό.';
  if (status.missing_pages) return 'Δεν βρέθηκε Facebook Page.';
  if (status.needs_page_pick) return 'Διάλεξε ποια Page θα χρησιμοποιείται.';
  if (status.missing_instagram) return 'Η Page δεν έχει συνδεδεμένο Instagram Professional.';
  return '';
}
