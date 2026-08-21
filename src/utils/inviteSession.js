const INVITE_KEY = 'lifev1-pending-invite';

export function captureInviteFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const hashMatch = window.location.hash.match(/invite=([^&]+)/);
    const token = params.get('invite') || (hashMatch ? hashMatch[1] : null);
    if (!token) return null;

    sessionStorage.setItem(INVITE_KEY, token);

    params.delete('invite');
    const nextSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash.replace(/[?&]?invite=[^&]*/g, '')}`;
    window.history.replaceState({}, '', cleanUrl || '/');

    return token;
  } catch {
    return null;
  }
}

export function getPendingInviteToken() {
  try {
    return sessionStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteToken() {
  try {
    sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildInviteUrl(token) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin || '';
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}?invite=${encodeURIComponent(token)}`;
}
