/**
 * Turns push on/off for *this* device:
 * - web (iPhone home-screen app, desktop/Android browsers): Web Push through the service worker
 * - android (Capacitor): Firebase Cloud Messaging
 * - electron: Realtime listener + native toasts (no server-side device row)
 */
import { getSupabaseClient } from '../supabase';
import { detectPlatform, getNativeOs } from '../../platform/capabilities';

const DEVICE_KEY = 'lifev1-push-device';
const deviceListeners = new Set();
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || '';
/** Set at build time when android/app/google-services.json exists (see vite.config.js). */
const ANDROID_FCM_READY = typeof __ANDROID_FCM__ !== 'undefined' && __ANDROID_FCM__ === true;
export const ANDROID_CHANNEL_ID = 'lifev1_reminders';

function readDevice() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    return raw && typeof raw === 'object' && raw.kind ? raw : null;
  } catch {
    return null;
  }
}

function writeDevice(next) {
  try {
    if (next) localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
  deviceListeners.forEach((listener) => listener());
}

export function subscribePushDevice(listener) {
  deviceListeners.add(listener);
  return () => deviceListeners.delete(listener);
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

function deviceLabel(kind) {
  if (kind === 'android') return 'Android app';
  if (isIosDevice()) return 'iPhone (home screen)';
  if (/Android/i.test(navigator.userAgent)) return 'Android browser';
  return 'Browser';
}

/**
 * What this device can do.
 * reason: 'ios-install' | 'ios-version' | 'no-vapid' | 'no-fcm' | 'unsupported' | 'denied' | null
 */
export function getPushSupport() {
  const platformId = detectPlatform();
  if (platformId === 'electron') {
    return { kind: 'electron', supported: Boolean(window.electronNotifications), reason: null };
  }
  if (platformId === 'capacitor') {
    if (getNativeOs() !== 'android') return { kind: null, supported: false, reason: 'unsupported' };
    return { kind: 'android', supported: ANDROID_FCM_READY, reason: ANDROID_FCM_READY ? null : 'no-fcm' };
  }
  const hasApis = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
  if (isIosDevice() && !isStandaloneWebApp()) {
    return { kind: 'web', supported: false, reason: 'ios-install' };
  }
  if (!hasApis) {
    return { kind: 'web', supported: false, reason: isIosDevice() ? 'ios-version' : 'unsupported' };
  }
  if (!VAPID_PUBLIC_KEY) return { kind: 'web', supported: false, reason: 'no-vapid' };
  if (Notification.permission === 'denied') return { kind: 'web', supported: false, reason: 'denied' };
  return { kind: 'web', supported: true, reason: null };
}

export function isPushEnabledOnThisDevice() {
  const stored = readDevice();
  return Boolean(stored && stored.kind === getPushSupport().kind);
}

function base64UrlToUint8Array(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameKey(buffer, expected) {
  if (!buffer) return false;
  const bytes = new Uint8Array(buffer);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

async function registerDeviceRow(platform, token, keys) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase unavailable');
  const { error } = await supabase.rpc('register_push_device', {
    p_platform: platform,
    p_token: token,
    p_keys: keys || null,
    p_label: deviceLabel(platform),
  });
  if (error) {
    if (/register_push_device/i.test(error.message || '')) {
      throw new Error('Λείπει η βάση για ειδοποιήσεις — τρέξε το supabase/047_push_notifications.sql.');
    }
    throw error;
  }
}

async function deleteDeviceRow(token) {
  const supabase = getSupabaseClient();
  if (!supabase || !token) return;
  await supabase.from('push_devices').delete().eq('token', token);
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

async function subscribeWeb({ prompt }) {
  // iOS only allows the prompt from a tap, so ask before any other await.
  const permission = prompt ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Οι ειδοποιήσεις είναι μπλοκαρισμένες για την εφαρμογή. Άνοιξέ τες από τις ρυθμίσεις της συσκευής.'
      : 'Δεν δόθηκε άδεια για ειδοποιήσεις.');
  }
  const registration = await getServiceWorkerRegistration();
  const applicationServerKey = base64UrlToUint8Array(VAPID_PUBLIC_KEY);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options?.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }
  const json = subscription.toJSON();
  await registerDeviceRow('web', json.endpoint, { p256dh: json.keys?.p256dh, auth: json.keys?.auth });
  return json.endpoint;
}

let androidTokenWaiters = [];
let androidListenersReady = false;
const androidHandlers = { onOpen: null, onForeground: null };

async function getPushPlugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

/** Listeners for taps and foreground pushes; safe to call more than once. */
export async function initAndroidPushListeners(handlers = {}) {
  if (handlers.onOpen) androidHandlers.onOpen = handlers.onOpen;
  if (handlers.onForeground) androidHandlers.onForeground = handlers.onForeground;
  if (androidListenersReady || !ANDROID_FCM_READY || getNativeOs() !== 'android') return;
  androidListenersReady = true;
  const PushNotifications = await getPushPlugin();
  await PushNotifications.addListener('registration', ({ value }) => {
    const waiters = androidTokenWaiters;
    androidTokenWaiters = [];
    waiters.forEach(({ resolve }) => resolve(value));
  });
  await PushNotifications.addListener('registrationError', ({ error }) => {
    const waiters = androidTokenWaiters;
    androidTokenWaiters = [];
    waiters.forEach(({ reject }) => reject(new Error(error || 'FCM registration failed')));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    androidHandlers.onOpen?.(notification?.data?.url || '/');
  });
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    androidHandlers.onForeground?.({
      title: notification?.title || '',
      body: notification?.body || '',
      url: notification?.data?.url || '/',
    });
  });
}

async function subscribeAndroid({ prompt }) {
  const PushNotifications = await getPushPlugin();
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted' && prompt) {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') throw new Error('Δεν δόθηκε άδεια για ειδοποιήσεις.');

  await PushNotifications.createChannel({
    id: ANDROID_CHANNEL_ID,
    name: 'Υπενθυμίσεις',
    description: 'Path blocks, timer και πρόγραμμα ημέρας',
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => {});

  await initAndroidPushListeners();
  const token = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Το FCM δεν απάντησε. Δοκίμασε ξανά.')), 15000);
    androidTokenWaiters.push({
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    PushNotifications.register().catch((err) => { clearTimeout(timer); reject(err); });
  });
  await registerDeviceRow('android', token, null);
  return token;
}

/** Call straight from a tap handler (iOS needs the gesture for the permission prompt). */
export async function enablePushOnThisDevice() {
  const support = getPushSupport();
  if (!support.supported) throw new Error('Οι ειδοποιήσεις δεν υποστηρίζονται εδώ.');
  let token = null;
  if (support.kind === 'web') token = await subscribeWeb({ prompt: true });
  else if (support.kind === 'android') token = await subscribeAndroid({ prompt: true });
  writeDevice({ kind: support.kind, token, enabledAt: new Date().toISOString() });
  return support.kind;
}

/** Re-register silently on launch: tokens and subscriptions can rotate. */
export async function refreshPushOnThisDevice() {
  const stored = readDevice();
  const support = getPushSupport();
  if (!stored || stored.kind !== support.kind || !support.supported) return;
  try {
    let token = stored.token;
    if (support.kind === 'web') token = await subscribeWeb({ prompt: false });
    else if (support.kind === 'android') token = await subscribeAndroid({ prompt: false });
    if (token !== stored.token) {
      if (stored.token) await deleteDeviceRow(stored.token).catch(() => {});
      writeDevice({ ...stored, token });
    }
  } catch {
    // Offline or a flaky push service: keep the device on and retry next launch.
    if (await hasNotificationPermission(support.kind)) return;
    // Permission was revoked in the OS settings: treat the device as off.
    if (stored.token) await deleteDeviceRow(stored.token).catch(() => {});
    writeDevice(null);
  }
}

async function hasNotificationPermission(kind) {
  if (kind === 'web') return Notification.permission === 'granted';
  if (kind === 'android') {
    const PushNotifications = await getPushPlugin();
    const permission = await PushNotifications.checkPermissions().catch(() => null);
    return permission?.receive === 'granted';
  }
  return true;
}

export async function disablePushOnThisDevice() {
  const stored = readDevice();
  writeDevice(null);
  if (!stored) return;
  if (stored.kind === 'web' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
    const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
    await subscription?.unsubscribe().catch(() => {});
  }
  if (stored.kind === 'android' && ANDROID_FCM_READY) {
    const PushNotifications = await getPushPlugin();
    await PushNotifications.unregister().catch(() => {});
  }
  await deleteDeviceRow(stored.token).catch(() => {});
}
