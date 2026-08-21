/** Lightweight path helpers (no react-router). */

export function getAppPath() {
  const raw = window.location.pathname.replace(/\/+$/, '');
  return raw || '/';
}

export function isLoginPath(path = getAppPath()) {
  return path === '/login';
}

export function isAppPath(path = getAppPath()) {
  return path === '/' || path === '/app';
}

export function navigateTo(path, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function redirectToLogin({ replace = true } = {}) {
  navigateTo('/login', { replace });
}

export function redirectToApp({ replace = false } = {}) {
  navigateTo('/', { replace });
}
