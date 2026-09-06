import { Capacitor } from '@capacitor/core';

export function detectPlatform() {
  if (typeof window === 'undefined') return 'web';

  if (window.__lifev1Platform === 'electron') return 'electron';

  try {
    if (Capacitor.isNativePlatform()) return 'capacitor';
    const nativePlatform = Capacitor.getPlatform();
    if (nativePlatform === 'android' || nativePlatform === 'ios') return 'capacitor';
  } catch {
    // Capacitor not available
  }

  if (window.Capacitor?.isNativePlatform?.()) return 'capacitor';

  return 'web';
}

export function getNativeOs() {
  try {
    const native = Capacitor.getPlatform();
    if (native === 'ios' || native === 'android') return native;
  } catch {
    // Capacitor not available
  }
  return null;
}

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isIosWebBrowser() {
  if (typeof navigator === 'undefined') return false;
  if (detectPlatform() !== 'web') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isMobilePlatform() {
  const id = detectPlatform();
  return id === 'capacitor' || (id === 'web' && isMobileUserAgent());
}

export function hasBleSupport() {
  const id = detectPlatform();
  if (id === 'capacitor') return true;
  if (id === 'electron' || id === 'web') {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }
  return false;
}

export function getPlatformInfo() {
  const id = detectPlatform();
  const isMobile = isMobilePlatform();
  const nativeOs = getNativeOs();

  return {
    id,
    nativeOs,
    isElectron: id === 'electron',
    isCapacitor: id === 'capacitor',
    isWeb: id === 'web',
    isIosWeb: isIosWebBrowser(),
    isMobile,
    hasBLE: hasBleSupport,
    hasAutoUpdate() {
      return id === 'electron' && Boolean(window.electronUpdater);
    },
    hasBackgroundSync() {
      return id === 'capacitor';
    },
  };
}
