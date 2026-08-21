import { PROJECT_ID_KEY } from '../lib/supabase';

const LEGACY_KEYS = [
  'business-evolution-map',
  'business-evolution-map-v2',
  PROJECT_ID_KEY,
];

/** Remove legacy project blobs from localStorage (data lives in Supabase only). */
export function purgeLegacyLocalProjectStorage() {
  try {
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Session-only pointer to the active project (not project data). */
export function getStoredProjectId() {
  try {
    return sessionStorage.getItem(PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

export function setStoredProjectId(id) {
  try {
    if (id) sessionStorage.setItem(PROJECT_ID_KEY, id);
    else sessionStorage.removeItem(PROJECT_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStoredProjectId() {
  setStoredProjectId(null);
}
