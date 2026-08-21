import { useCallback, useEffect, useRef } from 'react';
import { fetchOuraMetricsRange } from '../lib/oura';
import {
  fetchMetricsRange,
  isoDateDaysAgo,
} from '../lib/health/healthMetrics';
import { buildSelfHubLivePatch } from '../utils/selfHubSync';
import { localTodayIsoDate } from '../utils/selfDateUtils';

/**
 * On health sync, capture today's health into Self Hub live store (caller archives to Lifeline).
 */
export function useHealthSelfHubSync({
  enabled = true,
  connected = false,
  lastSyncedAt = null,
  onCaptureHealth,
}) {
  const initialPushDoneRef = useRef(false);
  const lastSyncedRef = useRef(null);

  const pushHealthToSelfHub = useCallback(async () => {
    if (!enabled || !onCaptureHealth) return 0;

    const today = localTodayIsoDate();
    const startDay = isoDateDaysAgo(30);
    const endDay = isoDateDaysAgo(0);

    const [healthMetrics, ouraRows] = await Promise.all([
      fetchMetricsRange({ startDay, endDay }).catch(() => []),
      connected ? fetchOuraMetricsRange(30).catch(() => []) : Promise.resolve([]),
    ]);

    const todayOura = ouraRows.find((row) => row.day === today) || null;
    const patch = buildSelfHubLivePatch({
      date: today,
      healthMetrics,
      ouraRow: todayOura,
      projectActivity: [],
      hubView: null,
    });

    if (!patch.health) return 0;
    onCaptureHealth(today, { health: patch.health, updatedAt: patch.updatedAt });
    return 1;
  }, [connected, enabled, onCaptureHealth]);

  useEffect(() => {
    if (!enabled || initialPushDoneRef.current) return undefined;

    let cancelled = false;
    pushHealthToSelfHub()
      .then(() => {
        if (!cancelled) initialPushDoneRef.current = true;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, pushHealthToSelfHub]);

  useEffect(() => {
    if (!enabled || !connected || !lastSyncedAt) return;
    if (lastSyncedRef.current === lastSyncedAt) return;

    lastSyncedRef.current = lastSyncedAt;
    pushHealthToSelfHub().catch(() => {});
  }, [connected, enabled, lastSyncedAt, pushHealthToSelfHub]);

  return { pushHealthToSelfHub };
}
