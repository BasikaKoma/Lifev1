import { detectPlatform, getNativeOs } from '../capabilities.js';
import { getSupabaseClient } from '../../lib/supabase';

const SCALE_DEVICE_KEY = 'lifev1-scale-device';
const INGEST_TOKEN_KEY = 'lifev1-scale-ingest-token';

function platformKey(platform = detectPlatform()) {
  if (platform === 'electron') return 'electron';
  if (platform === 'capacitor') return getNativeOs() || 'android';
  if (platform === 'ios' || platform === 'android') return platform;
  return 'web';
}

function platformEntry(normalized, key) {
  const platforms = normalized?.platforms;
  if (!platforms) return null;
  if (platforms[key]?.id) return platforms[key];
  // Legacy native apps stored a single "capacitor" slot (Android).
  if (key === 'android' && platforms.capacitor?.id) return platforms.capacitor;
  return null;
}

function normalizeCloudRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.platforms && typeof raw.platforms === 'object') {
    return {
      name: raw.name || 'QN-Scale',
      pairedAt: raw.pairedAt ?? null,
      ingest_token_hash: raw.ingest_token_hash ?? null,
      platforms: raw.platforms,
    };
  }

  if (raw.id) {
    return {
      name: raw.name || 'QN-Scale',
      pairedAt: raw.pairedAt ?? null,
      ingest_token_hash: raw.ingest_token_hash ?? null,
      platforms: {
        [platformKey()]: { id: raw.id, pairedAt: raw.pairedAt ?? null },
      },
    };
  }

  return null;
}

export function readScaleDevice() {
  try {
    const raw = localStorage.getItem(SCALE_DEVICE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistScaleDevice(device) {
  if (!device?.id) return;
  try {
    localStorage.setItem(SCALE_DEVICE_KEY, JSON.stringify({
      id: device.id,
      name: device.name || 'QN-Scale',
      pairedAt: new Date().toISOString(),
    }));
  } catch {
    // ignore
  }
}

export function clearScaleDevice() {
  try {
    localStorage.removeItem(SCALE_DEVICE_KEY);
    localStorage.removeItem(INGEST_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function resolveScaleDeviceForPlatform(cloudRecord, platform = detectPlatform()) {
  const normalized = normalizeCloudRecord(cloudRecord);
  const key = platformKey(platform);
  const entry = platformEntry(normalized, key);

  if (entry?.id) {
    return {
      id: entry.id,
      name: normalized.name || 'QN-Scale',
    };
  }

  return readScaleDevice();
}

export function isScaleLinked(cloudRecord) {
  const normalized = normalizeCloudRecord(cloudRecord);
  if (normalized?.platforms && Object.keys(normalized.platforms).length > 0) {
    return true;
  }
  return Boolean(readScaleDevice()?.id);
}

/** A phone owns BLE capture; desktop/web should read cloud data instead. */
export function hasPhoneScaleCapture(cloudRecord) {
  const platforms = normalizeCloudRecord(cloudRecord)?.platforms;
  return Boolean(
    platforms?.android?.id
    || platforms?.ios?.id
    || platforms?.capacitor?.id,
  );
}

export async function fetchScaleDeviceFromCloud() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('scale_device')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return normalizeCloudRecord(data?.scale_device);
}

export async function persistScaleDeviceToCloud(device, platform = detectPlatform()) {
  const supabase = getSupabaseClient();
  if (!supabase || !device?.id) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const existing = (await fetchScaleDeviceFromCloud()) ?? {
    name: device.name || 'QN-Scale',
    pairedAt: new Date().toISOString(),
    platforms: {},
  };

  const key = platformKey(platform);
  const slot = {
    id: device.id,
    pairedAt: new Date().toISOString(),
  };
  const record = {
    name: device.name || existing.name || 'QN-Scale',
    pairedAt: existing.pairedAt || new Date().toISOString(),
    ingest_token_hash: existing.ingest_token_hash ?? null,
    platforms: {
      ...(existing.platforms ?? {}),
      [key]: slot,
      // Keep legacy "capacitor" in sync so older Android/desktop builds still see the phone.
      ...(key === 'android' ? { capacitor: slot } : {}),
    },
  };

  const { error } = await supabase
    .from('profiles')
    .update({ scale_device: record })
    .eq('id', user.id);

  if (error) throw error;
  return record;
}

export async function clearScaleDeviceFromCloud() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .update({ scale_device: null })
    .eq('id', user.id);

  if (error) throw error;
}

export async function syncScaleDeviceFromCloud(platform = detectPlatform()) {
  const cloud = await fetchScaleDeviceFromCloud();
  const local = resolveScaleDeviceForPlatform(cloud, platform);
  if (local?.id) persistScaleDevice(local);
  return cloud;
}

export function readScaleIngestToken() {
  try {
    return localStorage.getItem(INGEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistScaleIngestToken(token) {
  try {
    localStorage.setItem(INGEST_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ensureScaleIngestToken() {
  const supabase = getSupabaseClient();
  if (!supabase) return readScaleIngestToken();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readScaleIngestToken();

  const existing = await fetchScaleDeviceFromCloud();
  if (!existing) return readScaleIngestToken();

  const localToken = readScaleIngestToken();
  if (localToken && existing.ingest_token_hash) {
    const localHash = await sha256Hex(localToken);
    if (localHash === existing.ingest_token_hash) return localToken;
  }

  const token = randomToken();
  const ingest_token_hash = await sha256Hex(token);
  const { error } = await supabase
    .from('profiles')
    .update({
      scale_device: {
        ...existing,
        ingest_token_hash,
      },
    })
    .eq('id', user.id);
  if (error) throw error;
  persistScaleIngestToken(token);
  return token;
}
