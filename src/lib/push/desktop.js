/** Desktop (Electron): reminders arrive over Realtime and show as native Windows toasts. */
import { getSupabaseClient } from '../supabase';

const TRAY_KEY = 'lifev1-push-keep-in-tray';
/** Same cut-off as the server: a reminder this late is no longer useful. */
const STALE_AFTER_MS = 15 * 60 * 1000;

export function hasDesktopNotifications() {
  return typeof window !== 'undefined' && Boolean(window.electronNotifications);
}

export function getKeepInTray() {
  try {
    return localStorage.getItem(TRAY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setKeepInTray(value) {
  try {
    localStorage.setItem(TRAY_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Closing the window hides lifev1 to the tray so reminders keep arriving. */
export function applyDesktopBackground(active) {
  window.electronNotifications?.setBackgroundEnabled(Boolean(active) && getKeepInTray());
}

export function onDesktopNotificationOpen(callback) {
  return window.electronNotifications?.onOpen(callback) || (() => {});
}

/** Shows a toast whenever one of the user's scheduled pushes is marked sent. */
export function listenForDesktopPushes(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !hasDesktopNotifications()) return () => {};
  const shown = new Set();
  const channel = supabase
    .channel(`push-desktop-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'push_schedule', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload?.new;
        if (!row?.sent_at || shown.has(row.id)) return;
        if (Date.now() - new Date(row.fire_at).getTime() > STALE_AFTER_MS) return;
        shown.add(row.id);
        window.electronNotifications.show({
          title: row.title,
          body: row.body,
          url: row.url || '/',
          tag: String(row.key || row.id).replace(/@.*$/, ''),
        });
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
