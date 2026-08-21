import { useCallback, useEffect, useRef, useState } from 'react';
import {
  disconnectOura,
  fetchLatestOuraMetrics,
  getOuraStatus,
  openOuraAuthorizeUrl,
  startOuraConnect,
  syncOura,
} from '../lib/oura';
import { buildSelfViewData } from '../utils/ouraMetrics';
import { isOuraSyncDue } from '../utils/selfDateUtils';

export function useOura({ enabled = true, autoSync = true, pollWhenActive = false } = {}) {
  const [status, setStatus] = useState({
    connected: false,
    connected_at: null,
    last_synced_at: null,
    token_valid: false,
  });
  const [metricsRow, setMetricsRow] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const autoSyncAttemptedRef = useRef(false);
  const busyRef = useRef(false);
  const runSyncRef = useRef(null);
  const refreshStatusRef = useRef(null);
  const refreshMetricsRef = useRef(null);

  const refreshMetrics = useCallback(async () => {
    const row = await fetchLatestOuraMetrics();
    setMetricsRow(row);
    return row;
  }, []);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await getOuraStatus();
    setStatus(nextStatus);
    return nextStatus;
  }, []);

  const refreshAll = useCallback(async () => {
    if (!enabled) return null;
    setError(null);
    const nextStatus = await refreshStatus();
    if (nextStatus.connected) {
      return refreshMetrics();
    }
    setMetricsRow(null);
    return null;
  }, [enabled, refreshMetrics, refreshStatus]);

  const runSync = useCallback(async () => {
    if (!enabled) return null;
    setBusy(true);
    setError(null);
    try {
      await syncOura();
      await refreshStatus();
      return refreshMetrics();
    } catch (err) {
      setError(err.message || 'Sync failed');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled, refreshMetrics, refreshStatus]);

  const connect = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await startOuraConnect();
      openOuraAuthorizeUrl(url);
    } catch (err) {
      setError(err.message || 'Connect failed');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  const disconnect = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectOura();
      setMetricsRow(null);
      await refreshStatus();
    } catch (err) {
      setError(err.message || 'Disconnect failed');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled, refreshStatus]);

  useEffect(() => {
    runSyncRef.current = runSync;
    refreshStatusRef.current = refreshStatus;
    refreshMetricsRef.current = refreshMetrics;
    busyRef.current = busy;
  }, [runSync, refreshStatus, refreshMetrics, busy]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      autoSyncAttemptedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    autoSyncAttemptedRef.current = false;

    (async () => {
      setLoading(true);
      try {
        const nextStatus = await refreshStatus();
        if (cancelled) return;
        if (nextStatus.connected) {
          await refreshMetrics();
          if (!cancelled && autoSync && !autoSyncAttemptedRef.current) {
            if (isOuraSyncDue(nextStatus.last_synced_at)) {
              autoSyncAttemptedRef.current = true;
              await runSync().catch(() => {});
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Oura status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally run once per enabled session — not on every runSync identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, enabled]);

  useEffect(() => {
    if (!enabled || !autoSync || !pollWhenActive) return undefined;

    const SYNC_CHECK_MS = 15 * 60 * 1000;

    const checkAndSync = async () => {
      if (document.hidden || busyRef.current) return;
      try {
        const nextStatus = await refreshStatusRef.current();
        if (!nextStatus.connected) return;
        if (isOuraSyncDue(nextStatus.last_synced_at)) {
          await runSyncRef.current().catch(() => {});
        } else {
          await refreshMetricsRef.current();
        }
      } catch {
        /* ignore background refresh errors */
      }
    };

    const intervalId = setInterval(checkAndSync, SYNC_CHECK_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) checkAndSync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (pollWhenActive) checkAndSync();

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [autoSync, enabled, pollWhenActive]);

  const selfData = buildSelfViewData({
    ouraRow: metricsRow,
    connected: status.connected,
  });

  return {
    status,
    metricsRow,
    selfData,
    loading,
    busy,
    error,
    connect,
    disconnect,
    sync: runSync,
    refreshAll,
  };
}

export function useOuraOAuthReturn({ onConnected } = {}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oura') !== 'connected') return;

    params.delete('oura');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
    onConnected?.();
  }, [onConnected]);
}
