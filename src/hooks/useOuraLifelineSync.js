import { useCallback, useEffect, useRef } from 'react';
import { fetchOuraMetricsRange } from '../lib/oura';
import { buildLifelineMetricsPatches } from '../utils/lifelineSelfMetrics';

export function useOuraLifelineSync({
  enabled = true,
  connected = false,
  lastSyncedAt = null,
  updateLifelineDaysBatch,
}) {
  const initialPushDoneRef = useRef(false);
  const lastSyncedRef = useRef(null);

  const pushOuraRowsToLifeline = useCallback(async () => {
    if (!enabled || !connected || !updateLifelineDaysBatch) return 0;

    const rows = await fetchOuraMetricsRange(30);
    const patches = buildLifelineMetricsPatches(rows);
    const count = Object.keys(patches).length;
    if (count > 0) updateLifelineDaysBatch(patches);
    return count;
  }, [connected, enabled, updateLifelineDaysBatch]);

  useEffect(() => {
    if (!enabled || !connected || initialPushDoneRef.current) return undefined;

    let cancelled = false;
    pushOuraRowsToLifeline()
      .then((count) => {
        if (!cancelled) initialPushDoneRef.current = true;
        return count;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [connected, enabled, pushOuraRowsToLifeline]);

  useEffect(() => {
    if (!enabled || !connected || !lastSyncedAt) return;
    if (lastSyncedRef.current === lastSyncedAt) return;

    lastSyncedRef.current = lastSyncedAt;
    pushOuraRowsToLifeline().catch(() => {});
  }, [connected, enabled, lastSyncedAt, pushOuraRowsToLifeline]);

  return { pushOuraRowsToLifeline };
}
