import { createClient } from '@supabase/supabase-js';
import { SAVE_REQUEST_TIMEOUT_MS } from '../constants/save';

export const DEFAULT_SUPABASE_URL = 'https://fxdnbepmiphyzebqdkyf.supabase.co';

/** Legacy — cleared on startup; keys are baked into the app build now. */
export const ANON_KEY_STORAGE = 'bem-supabase-anon-key';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let cachedClient = null;
let cachedClientKey = null;

export function decodeJwtPayload(token) {
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

export function getSupabaseKeyRole(key) {
  const payload = decodeJwtPayload(key?.trim());
  return payload?.role ?? null;
}

export function isValidAnonKey(key) {
  return getSupabaseKeyRole(key) === 'anon';
}

function normalizeKey(key) {
  const trimmed = key?.trim();
  if (!trimmed || trimmed === 'your-anon-key-here') return null;
  if (!isValidAnonKey(trimmed)) return null;
  return trimmed;
}

export function getSupabaseUrl() {
  return envUrl || DEFAULT_SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return normalizeKey(envKey);
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SAVE_REQUEST_TIMEOUT_MS);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal.reason), {
        once: true,
      });
    }
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function getSupabaseConfigError() {
  const rawKey = envKey?.trim();
  if (!rawKey || rawKey === 'your-anon-key-here') {
    return 'Λείπει το VITE_SUPABASE_ANON_KEY στο .env (χρειάζεται μόνο κατά το build).';
  }
  if (getSupabaseKeyRole(rawKey) === 'service_role') {
    return 'Το .env έχει secret/service_role key. Βάλε το anon public key από Supabase → API.';
  }
  if (!isValidAnonKey(rawKey)) {
    return 'Μη έγκυρο Supabase anon key στο .env.';
  }
  return null;
}

export function getSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;

  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

/** @deprecated Use getSupabaseClient() */
export function getSupabase() {
  return getSupabaseClient();
}

export function resetSupabaseClient() {
  cachedClient = null;
  cachedClientKey = null;
}

export const PROJECT_ID_KEY = 'bem-supabase-project-id';

try {
  localStorage.removeItem(ANON_KEY_STORAGE);
} catch {
  /* ignore */
}
