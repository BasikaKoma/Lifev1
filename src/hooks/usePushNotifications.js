import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPushSettings, loadPushSettings, subscribePushSettings } from '../lib/push/settings';
import { buildReminders, buildTimerReminders } from '../lib/push/reminders';
import { loadRhythmProjects, PLAN_KINDS, syncScheduledPushes, TIMER_KINDS } from '../lib/push/schedule';
import {
  getPushSupport,
  initAndroidPushListeners,
  isPushEnabledOnThisDevice,
  refreshPushOnThisDevice,
  subscribePushDevice,
} from '../lib/push/device';
import { applyDesktopBackground, listenForDesktopPushes, onDesktopNotificationOpen } from '../lib/push/desktop';
import { getWorkTimerSnapshot, subscribeWorkTimer } from '../lib/workTimer';

const SYNC_DEBOUNCE_MS = 3000;
/** Rolls the 36h reminder window forward even when nothing is edited. */
const RESYNC_EVERY_MS = 10 * 60 * 1000;

function timerKeyPrefix(session) {
  return session?.id ? `timer:${session.id}@` : '';
}

/**
 * Keeps this account's scheduled reminders in step with Path, routines and rhythm,
 * and routes notification taps on this device back into the app.
 */
export function usePushNotifications({
  userId,
  pathBundle,
  routineTemplates,
  lifelineDays,
  currentProject,
  onOpen,
}) {
  const [settings, setSettings] = useState(getPushSettings);
  const [deviceOn, setDeviceOn] = useState(isPushEnabledOnThisDevice);
  const [foregroundNotice, setForegroundNotice] = useState(null);
  const [rhythmProjects, setRhythmProjects] = useState([]);
  const [tick, setTick] = useState(0);
  const onOpenRef = useRef(onOpen);
  const lastPlanSync = useRef({ signature: null, at: 0 });

  onOpenRef.current = onOpen;

  useEffect(() => subscribePushSettings(setSettings), []);
  useEffect(() => subscribePushDevice(() => setDeviceOn(isPushEnabledOnThisDevice())), []);

  useEffect(() => {
    if (!userId) return;
    loadPushSettings(userId).catch(() => {});
    refreshPushOnThisDevice().catch(() => {});
  }, [userId]);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), RESYNC_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Taps on a notification (service worker, Android, desktop) open the matching view.
  useEffect(() => {
    const open = (url) => onOpenRef.current?.(url);
    const cleanups = [];
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const onMessage = (event) => {
        if (event.data?.type === 'lifev1-push-open') open(event.data.url);
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
      cleanups.push(() => navigator.serviceWorker.removeEventListener('message', onMessage));
    }
    initAndroidPushListeners({ onOpen: open, onForeground: setForegroundNotice }).catch(() => {});
    cleanups.push(onDesktopNotificationOpen(open));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const desktopActive = Boolean(userId) && settings.enabled && deviceOn && getPushSupport().kind === 'electron';

  useEffect(() => {
    applyDesktopBackground(desktopActive);
    if (!desktopActive) return undefined;
    return listenForDesktopPushes(userId);
  }, [desktopActive, userId]);

  const rhythmWanted = Boolean(userId) && settings.enabled && settings.rhythm;
  useEffect(() => {
    if (!rhythmWanted) {
      setRhythmProjects([]);
      return undefined;
    }
    let cancelled = false;
    loadRhythmProjects(userId).then((projects) => {
      if (!cancelled) setRhythmProjects(projects);
    });
    return () => {
      cancelled = true;
    };
  }, [rhythmWanted, userId, tick]);

  // The open project's rhythm may be ahead of the cloud copy while a save is pending.
  const rhythmSources = useMemo(() => {
    if (!currentProject?.id) return rhythmProjects;
    return rhythmProjects.map((project) => (
      project.id === currentProject.id ? { ...project, recurring: currentProject.recurring } : project
    ));
  }, [rhythmProjects, currentProject?.id, currentProject?.recurring]);

  useEffect(() => {
    if (!userId) return undefined;
    const timer = setTimeout(() => {
      const reminders = buildReminders({
        pathBundle,
        routineTemplates,
        lifelineDays,
        rhythmProjects: rhythmSources,
        settings,
      });
      const signature = JSON.stringify(reminders.map((item) => [item.key, item.title, item.body]));
      const last = lastPlanSync.current;
      if (signature === last.signature && Date.now() - last.at < RESYNC_EVERY_MS) return;
      syncScheduledPushes(userId, PLAN_KINDS, reminders)
        .then(() => {
          lastPlanSync.current = { signature, at: Date.now() };
        })
        .catch(() => {});
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [userId, pathBundle, routineTemplates, lifelineDays, rhythmSources, settings, tick]);

  // A timer runs on one device, so each device only touches its own session's row.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastTimer = useRef(null);
  const syncTimer = useCallback(() => {
    if (!userId) return;
    const session = getWorkTimerSnapshot();
    const previous = lastTimer.current;
    lastTimer.current = session;
    if (previous?.id && previous.id !== session?.id) {
      syncScheduledPushes(userId, TIMER_KINDS, [], { keyPrefix: timerKeyPrefix(previous) }).catch(() => {});
    }
    if (session?.id) {
      const reminders = buildTimerReminders(session, settingsRef.current);
      syncScheduledPushes(userId, TIMER_KINDS, reminders, { keyPrefix: timerKeyPrefix(session) }).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    syncTimer();
    return subscribeWorkTimer(syncTimer);
  }, [userId, syncTimer, settings.enabled, settings.timer]);

  const dismissForegroundNotice = useCallback(() => setForegroundNotice(null), []);

  return { foregroundNotice, dismissForegroundNotice };
}
