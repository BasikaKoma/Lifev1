function getApi() {
  return typeof window !== 'undefined' ? window.electronAuth : null;
}

export function hasElectronAuthStore() {
  return Boolean(getApi()?.getLogin);
}

async function invoke(method, ...args) {
  const api = getApi();
  if (!api?.[method]) return null;
  const result = await api[method](...args);
  if (result && typeof result === 'object' && result.ok === false) {
    throw new Error(result.error || 'Auth store error');
  }
  if (result && typeof result === 'object' && result.ok === true && 'data' in result) {
    return result.data;
  }
  return result;
}

function normalizeLogin(saved) {
  const email = typeof saved?.email === 'string' ? saved.email.trim() : '';
  const password = typeof saved?.password === 'string' ? saved.password : '';
  if (!email || !password) return null;
  return { email, password };
}

export async function getSavedLogin() {
  try {
    return normalizeLogin(await invoke('getLogin'));
  } catch {
    return null;
  }
}

export async function getAuthBootstrap() {
  try {
    const boot = await invoke('getBootstrap');
    return {
      login: normalizeLogin(boot?.login),
      staySignedOut: Boolean(boot?.staySignedOut),
    };
  } catch {
    return { login: null, staySignedOut: false };
  }
}

export async function markStaySignedOut() {
  if (!hasElectronAuthStore()) return;
  try {
    await invoke('markSignedOut');
  } catch {
    /* ignore */
  }
}

export async function clearStaySignedOut() {
  if (!hasElectronAuthStore()) return;
  try {
    await invoke('clearSignedOut');
  } catch {
    /* ignore */
  }
}

export async function saveLogin(email, password) {
  const trimmed = String(email || '').trim();
  if (!trimmed || !password || !hasElectronAuthStore()) return;
  await invoke('saveLogin', { email: trimmed, password: String(password) });
}

export async function clearSavedLogin() {
  if (!hasElectronAuthStore()) return;
  try {
    await invoke('clearLogin');
  } catch {
    /* ignore */
  }
}

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function createElectronAuthStorage() {
  if (!getApi()?.storageGet) return undefined;

  return {
    getItem: async (key) => {
      try {
        const stored = await invoke('storageGet', key);
        if (typeof stored === 'string') return stored;
      } catch {
        /* fall through to localStorage */
      }
      const fallback = readLocal(key);
      if (typeof fallback === 'string') {
        try {
          await invoke('storageSet', key, fallback);
        } catch {
          /* ignore */
        }
        return fallback;
      }
      return null;
    },
    setItem: async (key, value) => {
      const text = String(value ?? '');
      try {
        await invoke('storageSet', key, text);
      } catch {
        /* still keep a renderer copy */
      }
      writeLocal(key, text);
    },
    removeItem: async (key) => {
      try {
        await invoke('storageRemove', key);
      } catch {
        /* ignore */
      }
      removeLocal(key);
    },
  };
}
