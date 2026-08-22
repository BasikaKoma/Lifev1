import { CapacitorHttp } from '@capacitor/core';
import { detectPlatform } from '../../platform/capabilities';
import { buildDigestAuthorization, parseWwwAuthenticate, pickHeader } from './digest';
import { buildSnapshotUrl, normalizeCamera } from './store';

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function toDataUrl(data, contentType = 'image/jpeg') {
  if (!data) throw new Error('Άδειο snapshot από την κάμερα.');
  if (typeof data === 'string') {
    if (data.startsWith('data:')) return data;
    const trimmed = data.replace(/\s/g, '');
    return `data:${contentType};base64,${trimmed}`;
  }
  if (data instanceof ArrayBuffer) {
    return `data:${contentType};base64,${bytesToBase64(new Uint8Array(data))}`;
  }
  if (ArrayBuffer.isView(data)) {
    return `data:${contentType};base64,${bytesToBase64(new Uint8Array(data.buffer))}`;
  }
  throw new Error('Άγνωστη μορφή εικόνας από την κάμερα.');
}

function contentTypeFromHeaders(headers) {
  const raw = pickHeader(headers, 'content-type');
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 'image/jpeg';
  return String(value).split(';')[0].trim() || 'image/jpeg';
}

function assertImagePayload(data, headers) {
  const type = contentTypeFromHeaders(headers);
  if (type.startsWith('image/')) return type;
  if (typeof data === 'string' && data.startsWith('/9j/')) return 'image/jpeg';
  throw new Error('Η κάμερα απάντησε, αλλά όχι με εικόνα. Έλεγξε χρήστη, κωδικό και κανάλι.');
}

async function capacitorRequest(url, headers = {}) {
  return CapacitorHttp.request({
    url,
    method: 'GET',
    headers,
    connectTimeout: 10000,
    readTimeout: 10000,
    responseType: 'blob',
  });
}

async function fetchSnapshotCapacitor(camera) {
  const cam = normalizeCamera(camera);
  const { url, uri, method } = buildSnapshotUrl(cam);
  const first = await capacitorRequest(url);
  const challenge = parseWwwAuthenticate(pickHeader(first.headers, 'www-authenticate'));

  if (first.status === 401 && challenge) {
    const authorization = buildDigestAuthorization({
      username: cam.username,
      password: cam.password,
      method,
      uri,
      challenge,
    });
    const second = await capacitorRequest(url, { Authorization: authorization });
    if (second.status >= 200 && second.status < 300) {
      const type = assertImagePayload(second.data, second.headers);
      return { dataUrl: toDataUrl(second.data, type), at: new Date().toISOString() };
    }
    if (second.status === 401) {
      throw new Error('Λάθος χρήστης ή κωδικός (Digest).');
    }
    throw new Error(`Η κάμερα επέστρεψε σφάλμα ${second.status}.`);
  }

  if (first.status === 401) {
    const basic = `Basic ${btoa(`${cam.username}:${cam.password}`)}`;
    const second = await capacitorRequest(url, { Authorization: basic });
    if (second.status >= 200 && second.status < 300) {
      const type = assertImagePayload(second.data, second.headers);
      return { dataUrl: toDataUrl(second.data, type), at: new Date().toISOString() };
    }
    throw new Error('Λάθος χρήστης ή κωδικός.');
  }

  if (first.status >= 200 && first.status < 300) {
    const type = assertImagePayload(first.data, first.headers);
    return { dataUrl: toDataUrl(first.data, type), at: new Date().toISOString() };
  }

  throw new Error(`Δεν συνδέθηκε η κάμερα (${first.status || 'timeout'}).`);
}

export function canFetchCameraSnapshots() {
  const id = detectPlatform();
  return id === 'electron' || id === 'capacitor';
}

export async function fetchCameraSnapshot(camera) {
  const cam = normalizeCamera(camera);
  if (!cam.host) throw new Error('Βάλε την IP της κάμερας ή του NVR.');

  const platformId = detectPlatform();
  if (platformId === 'electron') {
    if (!window.electronCameras?.snapshot) {
      throw new Error('Η desktop εφαρμογή δεν έχει έτοιμο το camera bridge.');
    }
    const result = await window.electronCameras.snapshot({
      host: cam.host,
      port: cam.port,
      protocol: cam.protocol,
      username: cam.username,
      password: cam.password,
      channel: cam.channel,
    });
    if (!result?.ok) throw new Error(result?.error || 'Αποτυχία snapshot.');
    return { dataUrl: result.dataUrl, at: result.at || new Date().toISOString() };
  }

  if (platformId === 'capacitor') {
    return fetchSnapshotCapacitor(cam);
  }

  throw new Error(
    'Οι κάμερες Dahua συνδέονται από την εφαρμογή Windows ή Android, στο ίδιο Wi‑Fi με το NVR. Ο browser μπλοκάρει την τοπική σύνδεση.',
  );
}

export async function testCameraConnection(camera) {
  try {
    const snap = await fetchCameraSnapshot(camera);
    return { ok: true, dataUrl: snap.dataUrl, at: snap.at };
  } catch (err) {
    return { ok: false, error: err?.message || 'Αποτυχία σύνδεσης.' };
  }
}
