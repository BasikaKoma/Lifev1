import { useCallback, useEffect, useRef, useState } from 'react';
import { getBleDeviceManager } from '../platform/ble/BleDeviceManager';
import {
  clearScaleDevice,
  clearScaleDeviceFromCloud,
  fetchScaleDeviceFromCloud,
  isScaleLinked,
  persistScaleDevice,
  persistScaleDeviceToCloud,
  readScaleDevice,
  resolveScaleDeviceForPlatform,
  syncScaleDeviceFromCloud,
} from '../platform/ble/scalePersistence';
import {
  canUseScaleBackground,
  notifyElectronScaleBackground,
  onScaleBackgroundMeasurement,
  startScaleBackground,
  stopScaleBackground,
} from '../platform/ble/scaleBackground';
import { detectPlatform, hasBleSupport } from '../platform/capabilities';
import { enqueueWrite } from '../lib/sync/offlineQueue';
import {
  appendWeightReading,
  todayIsoDate,
} from '../lib/health/healthMetrics';
import { getSupabaseClient } from '../lib/supabase';

const PROFILE_STORAGE_KEY = 'lifev1-scale-profile';
const SETTLE_MS = 1800;

async function saveMetricsWithOfflineFallback(measurement) {
  try {
    return await appendWeightReading({
      weightKg: measurement.weightKg ?? measurement.value,
      impedance: measurement.impedance,
      deviceId: measurement.deviceId,
      deviceName: measurement.deviceName,
      stable: measurement.stable ?? true,
      day: todayIsoDate(),
      recordedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (!navigator.onLine) {
      await enqueueWrite({
        type: 'health_metrics',
        metrics: [{
          day: todayIsoDate(),
          metricType: 'weight',
          value: measurement.weightKg ?? measurement.value,
          unit: 'kg',
          source: 'qn_scale',
          payload: {
            stable: measurement.stable ?? true,
            impedance: measurement.impedance ?? null,
            deviceId: measurement.deviceId ?? null,
            deviceName: measurement.deviceName ?? null,
          },
        }],
      });
      return null;
    }
    throw err;
  }
}

export function loadScaleProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { heightCm: 170, age: 30, sex: 'male' };
  } catch {
    return { heightCm: 170, age: 30, sex: 'male' };
  }
}

export function saveScaleProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

async function fetchUserProfile() {
  const stored = loadScaleProfile();
  const supabase = getSupabaseClient();
  if (!supabase) return stored;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return stored;

  const { data } = await supabase
    .from('profiles')
    .select('height_cm, birthdate, sex')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) return stored;

  let age = stored.age;
  if (data.birthdate) {
    const birth = new Date(data.birthdate);
    age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  return {
    heightCm: data.height_cm ?? stored.heightCm,
    age,
    sex: data.sex === 'female' ? 'female' : 'male',
    birthdate: data.birthdate,
  };
}

async function probeBleAvailability(manager) {
  if (!hasBleSupport()) return false;
  try {
    await manager.requestPermissions();
    return manager.isAvailable();
  } catch {
    return hasBleSupport();
  }
}

export function useScale({
  enabled = true,
  onWeightSaved,
  modalOpen = false,
} = {}) {
  const [available, setAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [linked, setLinked] = useState(() => Boolean(readScaleDevice()?.id));
  const [devices, setDevices] = useState([]);
  const [lastMeasurement, setLastMeasurement] = useState(null);
  const [error, setError] = useState(null);
  const [signalCount, setSignalCount] = useState(0);
  const [lastRawHex, setLastRawHex] = useState(null);
  const [servicesInfo, setServicesInfo] = useState(null);
  const [stage, setStage] = useState(null);
  const managerRef = useRef(null);
  const onWeightSavedRef = useRef(onWeightSaved);
  const scannedForSessionRef = useRef(false);
  const initDoneRef = useRef(false);
  const settleTimerRef = useRef(null);
  const pendingMeasurementRef = useRef(null);
  const reconnectInFlightRef = useRef(false);
  const linkedRef = useRef(Boolean(readScaleDevice()?.id));
  const connectedRef = useRef(false);
  const isWeb = detectPlatform() === 'web' || detectPlatform() === 'electron';

  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    onWeightSavedRef.current = onWeightSaved;
  }, [onWeightSaved]);

  const refreshAvailability = useCallback(async () => {
    if (!managerRef.current) return false;
    const ok = await probeBleAvailability(managerRef.current);
    setAvailable(ok);
    return ok;
  }, []);

  const flushPendingMeasurement = useCallback(async () => {
    const pending = pendingMeasurementRef.current;
    if (!pending) return;
    pendingMeasurementRef.current = null;
    try {
      await saveMetricsWithOfflineFallback(pending);
      onWeightSavedRef.current?.(pending);
    } catch (err) {
      setError(err.message || 'Αποτυχία αποθήκευσης βάρους');
    }
  }, []);

  const scheduleSettledSave = useCallback((measurement) => {
    pendingMeasurementRef.current = measurement;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(() => {
      flushPendingMeasurement().catch(() => {});
    }, SETTLE_MS);
  }, [flushPendingMeasurement]);

  const connect = useCallback(async (device) => {
    if (!managerRef.current || !device) return false;
    setConnecting(true);
    setError(null);
    try {
      const profile = await fetchUserProfile();
      await managerRef.current.connect(device, { profile });
      persistScaleDevice(device);
      await persistScaleDeviceToCloud(device).catch(() => {});
      setLinked(true);
      setConnected(true);
      setDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [...prev, device];
      });
      if (canUseScaleBackground()) {
        await managerRef.current.disconnect().catch(() => {});
        setConnected(false);
        await startScaleBackground(device).catch(() => {});
        notifyElectronScaleBackground(true);
      } else {
        notifyElectronScaleBackground(true);
      }
      return true;
    } catch (err) {
      setError(err.message || 'Η σύνδεση απέτυχε');
      setConnected(false);
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const attemptReconnect = useCallback(async ({ silent = false } = {}) => {
    if (canUseScaleBackground()) return false;
    if (!managerRef.current) return false;
    if (reconnectInFlightRef.current) return false;

    let stored = readScaleDevice();
    if (!stored?.id) {
      try {
        const cloud = await fetchScaleDeviceFromCloud();
        stored = resolveScaleDeviceForPlatform(cloud);
        if (stored?.id) persistScaleDevice(stored);
        if (isScaleLinked(cloud)) setLinked(true);
      } catch {
        // ignore cloud read errors
      }
    }

    if (!stored?.id) return false;

    if (managerRef.current.getActiveDevice()) {
      setConnected(true);
      setLinked(true);
      return true;
    }

    reconnectInFlightRef.current = true;
    if (!silent) setReconnecting(true);
    if (!silent) setError(null);

    try {
      await refreshAvailability();
      const profile = await fetchUserProfile();
      await managerRef.current.reconnectStoredDevice(stored, { profile });
      setConnected(true);
      setLinked(true);
      setDevices([stored]);
      return true;
    } catch (err) {
      setConnected(false);
      if (!silent) {
        setError(err.message || 'Αποτυχία επανασύνδεσης ζυγαριάς');
      }
      return false;
    } finally {
      reconnectInFlightRef.current = false;
      if (!silent) setReconnecting(false);
    }
  }, [refreshAvailability]);

  useEffect(() => {
    if (!enabled) {
      initDoneRef.current = false;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      managerRef.current?.disconnect().catch(() => {});
      stopScaleBackground().catch(() => {});
      notifyElectronScaleBackground(false);
      setConnected(false);
      setLinked(false);
      return undefined;
    }

    if (initDoneRef.current) return undefined;
    initDoneRef.current = true;

    let cancelled = false;
    const manager = getBleDeviceManager();
    managerRef.current = manager;

    const unsubMeasure = manager.onMeasurement((measurement) => {
      if (measurement.type === 'services') {
        setServicesInfo(measurement.services ?? []);
        return;
      }

      if (measurement.type === 'stage') {
        setStage(
          measurement.stage === 'error'
            ? `error: ${measurement.message || ''}`
            : `${measurement.stage}${measurement.count != null ? ` (${measurement.count})` : ''}`,
        );
        return;
      }

      setSignalCount((c) => c + 1);

      if (measurement.type === 'raw') {
        setLastRawHex(measurement.rawHex ?? null);
        setLastMeasurement((prev) => ({
          ...(prev && prev.value != null ? prev : {}),
          rawHex: measurement.rawHex,
          rawAt: Date.now(),
        }));
        return;
      }

      if (measurement.raw) {
        try {
          setLastRawHex(
            Array.from(measurement.raw)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' '),
          );
        } catch {
          // ignore
        }
      }

      setLastMeasurement(measurement);
      const weight = measurement.weightKg ?? measurement.value;
      if (!weight) return;

      if (measurement.stable) {
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        pendingMeasurementRef.current = null;
        saveMetricsWithOfflineFallback(measurement)
          .then(() => onWeightSavedRef.current?.(measurement))
          .catch((err) => setError(err.message || 'Αποτυχία αποθήκευσης βάρους'));
        return;
      }

      scheduleSettledSave(measurement);
    });

    const unsubBackground = onScaleBackgroundMeasurement((measurement) => {
      if (cancelled || !measurement) return;
      const weight = measurement.weightKg ?? measurement.value;
      if (!weight) return;
      setLastMeasurement({
        ...measurement,
        value: weight,
        weightKg: weight,
        stable: measurement.stable ?? true,
      });
      setConnected(true);
      if (measurement.stable !== false) {
        onWeightSavedRef.current?.(measurement);
      }
    });

    const unsubConnection = manager.onConnectionChange?.(({ connected: isConnected, device }) => {
      if (cancelled) return;
      setConnected(isConnected);
      if (isConnected) {
        setLinked(true);
        const dev = device?.id ? device : readScaleDevice();
        if (dev?.id) {
          persistScaleDevice(dev);
          persistScaleDeviceToCloud(dev).catch(() => {});
        }
      }
    });

    (async () => {
      await refreshAvailability();
      if (cancelled) return;

      let linkedNow = Boolean(readScaleDevice()?.id);
      try {
        const cloud = await syncScaleDeviceFromCloud();
        const local = readScaleDevice();
        linkedNow = Boolean(local?.id) || isScaleLinked(cloud);
        if (!cancelled) setLinked(linkedNow);
        if (local?.id && !isScaleLinked(cloud)) {
          await persistScaleDeviceToCloud(local).catch(() => {});
        }
      } catch {
        const local = readScaleDevice();
        linkedNow = Boolean(local?.id);
        if (!cancelled) setLinked(linkedNow);
      }

      if (cancelled) return;
      if (canUseScaleBackground() && linkedNow) {
        const stored = readScaleDevice();
        await startScaleBackground(stored).catch(() => {});
        notifyElectronScaleBackground(true);
      } else if (linkedNow) {
        notifyElectronScaleBackground(true);
        await attemptReconnect({ silent: true });
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      unsubMeasure();
      unsubBackground?.();
      unsubConnection?.();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [attemptReconnect, enabled, refreshAvailability, scheduleSettledSave]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (canUseScaleBackground()) return undefined;

    const intervalMs = isWeb ? 8000 : 5000;
    const id = setInterval(() => {
      if (!linkedRef.current || connectedRef.current) return;
      if (reconnectInFlightRef.current) return;
      attemptReconnect({ silent: true }).catch(() => {});
    }, intervalMs);

    return () => clearInterval(id);
  }, [attemptReconnect, enabled, isWeb]);

  useEffect(() => {
    if (!enabled || !modalOpen) {
      scannedForSessionRef.current = false;
      return;
    }
    refreshAvailability().catch(() => {});
    if (!connected) {
      attemptReconnect({ silent: false }).catch(() => {});
    }
  }, [attemptReconnect, connected, enabled, modalOpen, refreshAvailability]);

  const scan = useCallback(async () => {
    if (!managerRef.current) {
      setError('Το Bluetooth δεν είναι έτοιμο');
      return [];
    }

    if (isWeb) {
      setError('Στο browser πάτα «Σύνδεση QN-Scale» για να επιλέξεις τη συσκευή.');
      return [];
    }

    setScanning(true);
    setError(null);
    setDevices([]);

    try {
      await refreshAvailability();
      const found = await managerRef.current.scan({
        timeoutMs: 10000,
        onDevice: (device) => {
          setDevices((prev) => {
            if (prev.some((d) => d.id === device.id)) return prev;
            return [...prev, device];
          });
        },
      });
      setDevices(found);
      if (!found.length) {
        setError('Δεν βρέθηκε QN-Scale. Βεβαιώσου ότι η ζυγαριά είναι αναμμένη και κοντά.');
      }
      return found;
    } catch (err) {
      setError(err.message || 'Το scan απέτυχε');
      return [];
    } finally {
      setScanning(false);
    }
  }, [isWeb, refreshAvailability]);

  const pickAndConnect = useCallback(async () => {
    if (!managerRef.current) {
      setError('Το Bluetooth δεν είναι έτοιμο');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await refreshAvailability();
      const device = await managerRef.current.pickDevice();
      setDevices([device]);
      await connect(device);
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) {
        setError(err.message || 'Η σύνδεση απέτυχε');
      }
    } finally {
      setConnecting(false);
    }
  }, [connect, refreshAvailability]);

  useEffect(() => {
    if (!enabled || !modalOpen || connected || scannedForSessionRef.current || isWeb) return;
    scannedForSessionRef.current = true;
    scan().catch(() => {});
  }, [connected, enabled, isWeb, modalOpen, scan]);

  const forceReconnect = useCallback(async () => {
    setError(null);
    setSignalCount(0);
    setServicesInfo(null);
    setLastRawHex(null);
    setLastMeasurement(null);
    await managerRef.current?.disconnect().catch(() => {});
    setConnected(false);
    connectedRef.current = false;

    if (canUseScaleBackground()) {
      const stored = readScaleDevice();
      await stopScaleBackground().catch(() => {});
      if (stored?.id) await startScaleBackground(stored).catch(() => {});
      return;
    }

    if (isWeb) {
      await pickAndConnect();
    } else {
      await attemptReconnect({ silent: false });
    }
  }, [attemptReconnect, isWeb, pickAndConnect]);

  const disconnect = useCallback(async () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    pendingMeasurementRef.current = null;
    await managerRef.current?.disconnect().catch(() => {});
    await stopScaleBackground().catch(() => {});
    notifyElectronScaleBackground(false);
    clearScaleDevice();
    await clearScaleDeviceFromCloud().catch(() => {});
    setConnected(false);
    setLinked(false);
    setLastMeasurement(null);
  }, []);

  return {
    available,
    scanning,
    connecting,
    reconnecting,
    connected,
    linked,
    isLinked: linked,
    isPaired: linked,
    devices,
    lastMeasurement,
    error,
    debug: {
      platform: detectPlatform(),
      signalCount,
      lastRawHex,
      services: servicesInfo,
      stage,
    },
    scan,
    connect,
    pickAndConnect,
    reconnect: attemptReconnect,
    forceReconnect,
    disconnect,
    profile: loadScaleProfile(),
    saveProfile: saveScaleProfile,
    refreshAvailability,
    backgroundCapture: canUseScaleBackground() || detectPlatform() === 'electron',
  };
}
