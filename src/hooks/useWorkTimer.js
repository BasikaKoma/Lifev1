import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getWorkTimerSnapshot,
  pauseWorkTimer,
  resumeWorkTimer,
  sessionElapsedMs,
  startBlockTimer,
  stopWorkTimer,
  subscribeWorkTimer,
} from '../lib/workTimer';

export function useWorkTimer() {
  const session = useSyncExternalStore(subscribeWorkTimer, getWorkTimerSnapshot, getWorkTimerSnapshot);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!session?.running) return undefined;
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, [session?.running, session?.id]);

  const elapsedMs = useMemo(
    () => sessionElapsedMs(session, Date.now()),
    [session, tick],
  );

  return {
    session,
    elapsedMs,
    startBlock: startBlockTimer,
    pause: pauseWorkTimer,
    resume: resumeWorkTimer,
    stop: stopWorkTimer,
  };
}
