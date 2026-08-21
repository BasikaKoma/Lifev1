const listeners = new Set();
let initialized = false;

function notify(url) {
  for (const listener of listeners) {
    try {
      listener(url);
    } catch {
      // ignore listener errors
    }
  }
}

async function initCapacitorDeepLinks() {
  if (initialized || typeof window === 'undefined') return;
  if (!window.Capacitor?.isNativePlatform?.()) return;

  initialized = true;
  try {
    const { App } = await import('@capacitor/app');
    const launch = await App.getLaunchUrl();
    if (launch?.url) notify(launch.url);

    await App.addListener('appUrlOpen', (event) => {
      if (event?.url) notify(event.url);
    });
  } catch {
    // Capacitor App plugin not installed yet
  }
}

export function onDeepLink(callback) {
  listeners.add(callback);
  initCapacitorDeepLinks();
  return () => listeners.delete(callback);
}

export function parseOuraCallback(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'lifev1:' && parsed.hostname === 'oura-callback') {
      return {
        success: parsed.searchParams.get('success') === '1',
        error: parsed.searchParams.get('error'),
      };
    }
    if (parsed.pathname.includes('oura') && parsed.searchParams.has('success')) {
      return {
        success: parsed.searchParams.get('success') === '1',
        error: parsed.searchParams.get('error'),
      };
    }
  } catch {
    return null;
  }
  return null;
}
