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
      emailRedirectTo: `${window.location.origin}/download`,
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

export async function requireAuth(redirectTo = '/login') {
  const user = await getUser();
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }
  return user;
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

export function updateAuthNav() {
  const loginLink = document.querySelector('[data-auth-login]');
  const downloadLink = document.querySelector('[data-auth-download]');
  const accountSlot = document.querySelector('[data-auth-account]');

  getUser()
    .then((user) => {
      if (user && loginLink) loginLink.hidden = true;
      if (user && downloadLink) downloadLink.classList.add('nav__cta');
      if (accountSlot) {
        accountSlot.hidden = !user;
        if (user) accountSlot.textContent = user.email;
      }
    })
    .catch(() => {
      /* ignore */
    });
}
