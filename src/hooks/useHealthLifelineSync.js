import { useCallback, useEffect, useRef } from 'react';
import { fetchOuraMetricsRange } from '../lib/oura';
import {
  fetchMetricsRange,
  isoDateDaysAgo,
  ouraRowToHealthMetrics,
} from '../lib/health/healthMetrics';
import { buildLifelineMetricsPatchesFromHealth } from '../lib/health/healthToLifeline';

export function useHealthLifelineSync({
  enabled = true,
  connected = false,
  lastSyncedAt = null,
  updateLifelineDaysBatch,
}) {
  const initialPushDoneRef = useRef(false);
  const lastSyncedRef = useRef(null);

  const pushHealthToLifeline = useCallback(async () => {
    if (!enabled || !updateLifelineDaysBatch) return 0;

    const startDay = isoDateDaysAgo(30);
    const endDay = isoDateDaysAgo(0);

    const [healthMetrics, ouraRows] = await Promise.all([
      fetchMetricsRange({ startDay, endDay }).catch(() => []),
      connected ? fetchOuraMetricsRange(30).catch(() => []) : Promise.resolve([]),
    ]);

    const allMetrics =
      healthMetrics.length > 0
        ? healthMetrics
        : ouraRows.flatMap(ouraRowToHealthMetrics).map((m) => ({
            ...m,
            recordedAt: new Date().toISOString(),
          }));

    const patches = buildLifelineMetricsPatchesFromHealth(allMetrics, ouraRows);
    const count = Object.keys(patches).length;
    if (count > 0) updateLifelineDaysBatch(patches);
    return count;
  }, [connected, enabled, updateLifelineDaysBatch]);

  useEffect(() => {
    if (!enabled || initialPushDoneRef.current) return undefined;

    let cancelled = false;
    pushHealthToLifeline()
      .then(() => {
        if (!cancelled) initialPushDoneRef.current = true;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, pushHealthToLifeline]);

  useEffect(() => {
    if (!enabled || !connected || !lastSyncedAt) return;
    if (lastSyncedRef.current === lastSyncedAt) return;

    lastSyncedRef.current = lastSyncedAt;
    pushHealthToLifeline().catch(() => {});
  }, [connected, enabled, lastSyncedAt, pushHealthToLifeline]);

  return { pushHealthToLifeline };
}
