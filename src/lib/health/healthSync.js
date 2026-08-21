import { isSupabaseConfigured } from '../supabase';



/** Refresh health metrics on focus/visibility instead of Realtime (reduces DB WAL load). */

export function subscribeToHealthMetrics(onChange) {

  if (!isSupabaseConfigured() || typeof window === 'undefined') return () => {};



  const refresh = () => onChange?.();

  const onVisibilityChange = () => {

    if (document.visibilityState === 'visible') refresh();

  };



  window.addEventListener('focus', refresh);
  window.addEventListener('lifev1:health-metrics-changed', refresh);

  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('focus', refresh);
    window.removeEventListener('lifev1:health-metrics-changed', refresh);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

}

