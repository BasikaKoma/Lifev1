import { useEffect } from 'react';
import { syncCarTrips } from '../lib/carLog';

const MIN_GAP_MS = 60000;

/** Reads new car trips into the Path when the app opens and each time it comes back to the front. */
export function useCarTrips({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    let last = 0;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      syncCarTrips();
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled]);
}
