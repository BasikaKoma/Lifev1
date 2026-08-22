import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { purgeLegacyLocalProjectStorage } from './utils/projectSession';
import { captureInviteFromUrl } from './utils/inviteSession';
import './index.css';
import './App.css';

import { detectPlatform } from './platform/capabilities';

purgeLegacyLocalProjectStorage();
captureInviteFromUrl();

window.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'F7') event.preventDefault();
  },
  true
);

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app');
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide().catch(() => {});
  });
}

// Service worker breaks Capacitor WebView and Electron (gray/black screen). Web-only.
const isNativeShell = Capacitor.isNativePlatform() || detectPlatform() === 'electron';

if (isNativeShell) {
  // A stale service worker from an earlier build can cache an old index.html that
  // references missing asset hashes, causing a black screen. Aggressively remove
  // any registration + caches so the native shell always loads the bundled assets.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
  }
  if (typeof caches !== 'undefined' && caches.keys) {
    caches
      .keys()
      .then((keys) => keys.forEach((key) => caches.delete(key)))
      .catch(() => {});
  }
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
