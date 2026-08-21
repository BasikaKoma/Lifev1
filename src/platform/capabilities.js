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

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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

  return {
    id,
    isElectron: id === 'electron',
    isCapacitor: id === 'capacitor',
    isWeb: id === 'web',
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
