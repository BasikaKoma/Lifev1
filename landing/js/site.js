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

export async function getSession() {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function signIn(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
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

export function updateAuthNav() {
  const loginLink = document.querySelector('[data-auth-login]');
  const accountLink = document.querySelector('[data-auth-account-link]');
  const downloadLink = document.querySelector('[data-auth-download]');

  getUser()
    .then((user) => {
      if (loginLink) loginLink.hidden = Boolean(user);
      if (accountLink) {
        accountLink.hidden = !user;
        accountLink.textContent = 'Account';
        accountLink.href = '/account';
        accountLink.classList.add('nav__cta');
      }
      if (downloadLink) {
        downloadLink.href = user ? '/account#download' : '/account';
      }
    })
    .catch(() => {
      /* ignore */
    });
}

export function subscribeToAuth(callback) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
