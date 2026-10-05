import { useCallback, useEffect, useRef } from 'react';
import { fetchOuraMetricsRange } from '../lib/oura';
import { applyOuraActivitiesToBundle } from '../lib/path/ouraMatch';
import { nowIso } from '../lib/path/schema';
import { queuePathSave, readPathBundleLocal, subscribePathBundle } from '../lib/path/store';

export function useOuraPathSync({
  enabled = true,
  connected = false,
  lastSyncedAt = null,
}) {
  const lastSyncedRef = useRef(null);
  const rowsRef = useRef(null);
  const fetchingRef = useRef(false);

  const applyRows = useCallback((rows) => {
    if (!rows) return;
    const result = applyOuraActivitiesToBundle(readPathBundleLocal(), rows);
    if (!result.changed) return;
    queuePathSave({ ...result.bundle, updatedAt: nowIso() });
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !connected || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const rows = await fetchOuraMetricsRange(21);
      rowsRef.current = rows;
      applyRows(rows);
    } catch {
      /* Oura can be offline; the next sync retries. */
    } finally {
      fetchingRef.current = false;
    }
  }, [applyRows, connected, enabled]);

  useEffect(() => {
    if (!enabled || !connected) return undefined;
    refresh();
    return undefined;
  }, [connected, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !connected || !lastSyncedAt) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    refresh();
  }, [connected, enabled, lastSyncedAt, refresh]);

  useEffect(() => {
    if (!enabled || !connected) return undefined;
    return subscribePathBundle(() => {
      if (rowsRef.current) applyRows(rowsRef.current);
    });
  }, [applyRows, connected, enabled]);
}
