import { registerPlugin } from '@capacitor/core';
import { detectPlatform, getNativeOs } from '../capabilities.js';
import { getSupabaseAnonKey, getSupabaseUrl } from '../../lib/supabase';
import {
  ensureScaleIngestToken,
  readScaleDevice,
} from './scalePersistence.js';

const ScaleBackground = registerPlugin('ScaleBackground');

/** Always-on BLE ingest exists only as an Android foreground service. */
export function canUseScaleBackground() {
  return detectPlatform() === 'capacitor' && getNativeOs() === 'android';
}

export async function startScaleBackground(device = readScaleDevice()) {
  if (!canUseScaleBackground() || !device?.id) return false;
  const ingestToken = await ensureScaleIngestToken();
  if (!ingestToken) return false;

  await ScaleBackground.start({
    deviceId: device.id,
    deviceName: device.name || 'QN-Scale',
    ingestToken,
    ingestUrl: `${getSupabaseUrl()}/functions/v1/scale-ingest`,
    apiKey: getSupabaseAnonKey() || '',
  });
  return true;
}

export async function stopScaleBackground({ unpair = false } = {}) {
  if (!canUseScaleBackground()) return;
  if (unpair) {
    await ScaleBackground.unpair().catch(async () => {
      await ScaleBackground.stop().catch(() => {});
    });
    return;
  }
  await ScaleBackground.stop().catch(() => {});
}

export function onScaleBackgroundMeasurement(callback) {
  if (!canUseScaleBackground()) return () => {};
  let handle = null;
  ScaleBackground.addListener('measurement', callback)
    .then((listener) => {
      handle = listener;
    })
    .catch(() => {});
  return () => {
    handle?.remove?.();
  };
}

export function notifyElectronScaleBackground(enabled) {
  try {
    window.electronScale?.setBackgroundEnabled?.(Boolean(enabled));
  } catch {
    // not running in Electron
  }
}
