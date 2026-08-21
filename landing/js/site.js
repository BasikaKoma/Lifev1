import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let supabaseClient = null;

function getConfig() {
  const config = window.LIFEV1_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    throw new Error('Site configuration is missing.');
  }
  return config;
}

export function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const config = getConfig();
  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseClient;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function getSession({ timeoutMs = 10000 } = {}) {
  const supabase = getSupabase();
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    timeoutMs,
    'Authentication timed out. Please refresh the page or sign in again.'
  );
  if (error) throw error;
  return data.session;
}

export async function waitForAuth({ timeoutMs = 10000 } = {}) {
  const supabase = getSupabase();

  return withTimeout(
    new Promise((resolve, reject) => {
      let settled = false;

      const finish = (session, error) => {
        if (settled) return;
        settled = true;
        subscription.unsubscribe();
        if (error) reject(error);
        else resolve(session);
      };

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          finish(session, null);
        }
      });

      supabase.auth
        .getSession()
        .then(({ data, error }) => finish(error ? null : data.session, error ?? null))
        .catch((error) => finish(null, error));
    }),
    timeoutMs,
    'Authentication timed out. Please refresh the page or sign in again.'
  );
}

export async function getUser({ refresh = false, timeoutMs = 10000 } = {}) {
  const supabase = getSupabase();

  if (refresh) {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      timeoutMs,
      'Authentication timed out. Please refresh the page or sign in again.'
    );
    if (error) throw error;
    return data.user ?? null;
  }

  const session = await waitForAuth({ timeoutMs });
  return session?.user ?? null;
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getAuthSessionId(session) {
  const payload = decodeJwtPayload(session?.access_token);
  return typeof payload?.session_id === 'string' && payload.session_id
    ? payload.session_id
    : null;
}

export async function claimExclusiveSession(session) {
  const supabase = getSupabase();
  const sessionId = getAuthSessionId(session);
  const userId = session?.user?.id;
  if (!sessionId || !userId) return;

  await supabase
    .from('profiles')
    .update({
      active_session_id: sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  await supabase.auth.signOut({ scope: 'others' });
}

export async function isExclusiveSessionActive(session) {
  const supabase = getSupabase();
  const sessionId = getAuthSessionId(session);
  const userId = session?.user?.id;
  if (!sessionId || !userId) return Boolean(session?.user);

  const { data, error } = await supabase
    .from('profiles')
    .select('active_session_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) return true;
  if (!data?.active_session_id) return true;
  return data.active_session_id === sessionId;
}

export async function signOutLocallyTaken() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export function watchExclusiveSession(session, onTaken) {
  const supabase = getSupabase();
  const sessionId = getAuthSessionId(session);
  const userId = session?.user?.id;
  if (!sessionId || !userId || typeof onTaken !== 'function') return () => {};

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
        if (nextId && nextId !== sessionId) takeOver();
      }
    )
    .subscribe();

  return () => {
    stopped = true;
    supabase.removeChannel(channel);
  };
}

export async function signIn(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (data.session) await claimExclusiveSession(data.session);
  return data;
}

export async function signUp(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/account`,
    },
  });
  if (error) throw error;
  if (data.session) await claimExclusiveSession(data.session);
  return data;
}

export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function formatAuthError(error) {
  const message = error?.message || 'Something went wrong.';
  if (message.includes('Invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  return message;
}

export async function fetchLatestInstaller() {
  const config = getConfig();
  const endpoint = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/releases/latest`;
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!response.ok) {
    throw new Error('Could not load the latest release.');
  }

  const release = await response.json();
  const asset = (release.assets || []).find((item) => /\.exe$/i.test(item.name));
  if (!asset) {
    throw new Error('No Windows installer found in the latest release.');
  }

  return {
    version: release.tag_name || release.name || 'latest',
    name: asset.name,
    url: asset.browser_download_url,
    sizeMb: asset.size ? (asset.size / (1024 * 1024)).toFixed(1) : null,
    publishedAt: release.published_at,
  };
}

export function getUserInitial(user) {
  const source = user?.user_metadata?.display_name || user?.email || '?';
  return source.trim().charAt(0).toUpperCase();
}

export function formatMemberSince(user) {
  const date = user?.created_at ? new Date(user.created_at) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function isAdmin(user) {
  return user?.app_metadata?.role === 'admin';
}

export async function logSiteEvent(eventType, metadata = {}) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('log_site_event', {
    p_event_type: eventType,
    p_metadata: metadata,
  });
  if (error) {
    console.warn('Failed to log site event:', error.message);
  }
}

export async function fetchAdminUserActivity() {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('admin_get_user_activity');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAdminRecentEvents(limit = 50) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('admin_get_recent_events', {
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function updateAuthNav() {
  const loginLink = document.querySelector('[data-auth-login]');
  const accountLink = document.querySelector('[data-auth-account-link]');
  const adminLink = document.querySelector('[data-auth-admin]');
  const downloadLink = document.querySelector('[data-auth-download]');

  getUser()
    .then((user) => {
      if (loginLink) loginLink.hidden = Boolean(user);
      if (accountLink) accountLink.hidden = !user;
      if (adminLink) adminLink.hidden = !isAdmin(user);
      if (downloadLink) {
        downloadLink.href = user ? '/account#download' : '/login?next=/account';
      }
    })
    .catch(() => {
      if (loginLink) loginLink.hidden = false;
      if (accountLink) accountLink.hidden = true;
      if (adminLink) adminLink.hidden = true;
      if (downloadLink) downloadLink.href = '/login?next=/account';
    });
}

export function subscribeToAuth(callback) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
