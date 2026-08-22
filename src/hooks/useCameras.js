import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canFetchCameraSnapshots, fetchCameraSnapshot, testCameraConnection } from '../lib/cameras/snapshot';
import { readCameras, removeCamera as removeStoredCamera, upsertCamera } from '../lib/cameras/store';

const GRID_MS = 2800;
const LIVE_MS = 900;

export function useCameras({ pollWhenActive = false } = {}) {
  const [cameras, setCameras] = useState(() => readCameras());
  const [frames, setFrames] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [liveId, setLiveId] = useState(null);
  const camerasRef = useRef(cameras);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  const reload = useCallback(() => {
    const next = readCameras();
    setCameras(next);
    return next;
  }, []);

  const saveCamera = useCallback((camera) => {
    const next = upsertCamera(camera);
    setCameras(next);
    return next.find((item) => item.id === camera.id) || next[next.length - 1];
  }, []);

  const deleteCamera = useCallback((id) => {
    const next = removeStoredCamera(id);
    setCameras(next);
    setFrames((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setLiveId((current) => (current === id ? null : current));
    return next;
  }, []);

  const refreshCamera = useCallback(async (camera) => {
    try {
      const snap = await fetchCameraSnapshot(camera);
      setFrames((prev) => ({
        ...prev,
        [camera.id]: { ok: true, dataUrl: snap.dataUrl, at: snap.at, error: null },
      }));
      return { ok: true, dataUrl: snap.dataUrl };
    } catch (err) {
      const error = err?.message || 'Αποτυχία snapshot.';
      setFrames((prev) => ({
        ...prev,
        [camera.id]: {
          ok: false,
          dataUrl: prev[camera.id]?.dataUrl || null,
          at: prev[camera.id]?.at || null,
          error,
        },
      }));
      return { ok: false, error };
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const list = camerasRef.current;
    await Promise.all(list.map((camera) => refreshCamera(camera)));
  }, [refreshCamera]);

  const testCamera = useCallback(async (camera) => {
    setTestingId(camera.id || 'draft');
    try {
      const result = await testCameraConnection(camera);
      if (result.ok && camera.id) {
        setFrames((prev) => ({
          ...prev,
          [camera.id]: { ok: true, dataUrl: result.dataUrl, at: result.at, error: null },
        }));
      }
      return result;
    } finally {
      setTestingId(null);
    }
  }, []);

  useEffect(() => {
    if (!pollWhenActive || cameras.length === 0) return undefined;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const list = camerasRef.current;
      const target = liveId ? list.filter((item) => item.id === liveId) : list;
      await Promise.all(target.map((camera) => refreshCamera(camera)));
    };

    tick();
    const timer = window.setInterval(tick, liveId ? LIVE_MS : GRID_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pollWhenActive, cameras.length, liveId, refreshCamera]);

  const supported = useMemo(() => canFetchCameraSnapshots(), []);

  return {
    cameras,
    frames,
    testingId,
    liveId,
    supported,
    connected: cameras.length > 0,
    setLiveId,
    reload,
    saveCamera,
    deleteCamera,
    refreshCamera,
    refreshAll,
    testCamera,
  };
}
