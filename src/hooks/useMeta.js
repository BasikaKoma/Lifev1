import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_META_STATUS,
  disconnectMeta,
  getMetaStatus,
  metaStatusHint,
  openMetaAuthorizeUrl,
  refreshMetaDestinations,
  setMetaDestinations,
  startMetaConnect,
} from '../lib/meta';

export function useMeta({ enabled = true } = {}) {
  const [status, setStatus] = useState(EMPTY_META_STATUS);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const autoRefreshAttemptedRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await getMetaStatus();
    setStatus(nextStatus);
    return nextStatus;
  }, []);

  const refreshAll = useCallback(async () => {
    if (!enabled) return EMPTY_META_STATUS;
    setError(null);
    return refreshStatus();
  }, [enabled, refreshStatus]);

  const connect = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await startMetaConnect();
      if (!url) throw new Error('Δεν ήρθε URL σύνδεσης από το Meta.');
      openMetaAuthorizeUrl(url);
    } catch (err) {
      const raw = err.message || '';
      setError(
        /Missing Meta OAuth configuration|META_APP_ID/i.test(raw)
          ? 'Λείπουν META_APP_ID και META_APP_SECRET στα Edge Function secrets. Φτιάξε Meta App (Business) στο developers.facebook.com και στείλε μου App ID + App Secret.'
          : (raw || 'Αποτυχία σύνδεσης Meta.'),
      );
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
      await disconnectMeta();
      setStatus(EMPTY_META_STATUS);
    } catch (err) {
      setError(err.message || 'Αποτυχία αποσύνδεσης Meta.');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  const refreshDestinations = useCallback(async () => {
    if (!enabled) return null;
    setBusy(true);
    setError(null);
    try {
      await refreshMetaDestinations();
      return refreshStatus();
    } catch (err) {
      setError(err.message || 'Αποτυχία ενημέρωσης Pages.');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled, refreshStatus]);

  const saveDestinations = useCallback(async (pageId, igUserId) => {
    if (!enabled) return EMPTY_META_STATUS;
    setBusy(true);
    setError(null);
    try {
      const next = await setMetaDestinations(pageId, igUserId);
      setStatus(next);
      return next;
    } catch (err) {
      setError(err.message || 'Δεν αποθηκεύτηκαν οι προορισμοί.');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      autoRefreshAttemptedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    autoRefreshAttemptedRef.current = false;

    (async () => {
      setLoading(true);
      try {
        const nextStatus = await refreshStatus();
        if (cancelled) return;
        if (
          nextStatus.connected
          && (nextStatus.expires_soon || !nextStatus.token_valid)
          && !autoRefreshAttemptedRef.current
        ) {
          autoRefreshAttemptedRef.current = true;
          try {
            await refreshMetaDestinations();
            if (!cancelled) await refreshStatus();
          } catch (refreshError) {
            if (!cancelled) {
              setError(refreshError.message || metaStatusHint(nextStatus) || 'Ξανασύνδεσε το Meta.');
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Δεν φόρτωσε η κατάσταση Meta.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshStatus]);

  return {
    status,
    loading,
    busy,
    error,
    setError,
    connect,
    disconnect,
    refreshDestinations,
    saveDestinations,
    refreshAll,
  };
}

export function useMetaOAuthReturn({ onConnected, onError } = {}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('meta');
    if (result !== 'connected' && result !== 'error') return;

    params.delete('meta');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
    if (result === 'connected') onConnected?.();
    else onError?.();
  }, [onConnected, onError]);
}
