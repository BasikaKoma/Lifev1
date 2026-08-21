import { useCallback, useEffect, useState } from 'react';
import {
  fetchMetricsForDay,
  fetchMetricsRange,
  isoDateDaysAgo,
  todayIsoDate,
} from '../lib/health/healthMetrics';
import { subscribeToHealthMetrics } from '../lib/health/healthSync';
import { buildSelfViewDataFromHealth } from '../lib/health/healthToSelf';

export function useHealthData({ enabled = true, ouraRow = null, ouraConnected = false } = {}) {
  const [healthMetrics, setHealthMetrics] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) return [];
    setError(null);
    try {
      const rows = await fetchMetricsRange({
        startDay: isoDateDaysAgo(30),
        endDay: todayIsoDate(),
      });
      setHealthMetrics(rows);
      return rows;
    } catch (err) {
      setError(err.message || 'Failed to load health data');
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const unsub = subscribeToHealthMetrics(() => {
      refresh().catch(() => {});
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, refresh]);

  const selfData = buildSelfViewDataFromHealth({
    healthMetrics,
    ouraRow,
    connected: ouraConnected,
  });

  const todayMetrics = healthMetrics.filter((m) => m.day === todayIsoDate());

  return {
    healthMetrics,
    todayMetrics,
    selfData,
    loading,
    error,
    refresh,
    fetchToday: () => fetchMetricsForDay(todayIsoDate()),
  };
}
