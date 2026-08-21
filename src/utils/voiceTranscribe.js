import { getOpenAiKey } from '../lib/openai';

export const VOICE_DEVICE_STORAGE = 'nm-voice-input-device-id';

const WHISPER_PROMPT =
  'Εντολές για business assistant: βάλε στόχο, ιδέα, σημείωση, διέγραψε στόχους, checkpoint.';

const SUSPICIOUS_PATTERNS = [
  /authorwave/i,
  /υποτιτλ/i,
  /υπότιτλ/i,
  /\bsubtitle/i,
  /\bcaption/i,
  /powered by/i,
];

const LOOPBACK_LABEL =
  /stereo\s*mix|στερεοφωνικ[ήη]\s*με[ίι]ξη|what\s*u\s*hear|loopback|cable\s*output|vb[- ]?audio|virtual\s*cable|authorwave/i;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

export function getVoiceRecorderMimeType() {
  return pickMimeType();
}

export function getSavedMicDeviceId() {
  try {
    return localStorage.getItem(VOICE_DEVICE_STORAGE);
  } catch {
    return null;
  }
}

export function saveMicDeviceId(deviceId) {
  if (!deviceId) {
    localStorage.removeItem(VOICE_DEVICE_STORAGE);
    return;
  }
  localStorage.setItem(VOICE_DEVICE_STORAGE, deviceId);
}

export function isLoopbackInputLabel(label = '') {
  return LOOPBACK_LABEL.test(label);
}

export async function listAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');

  // Prefer real mics. Copy fields explicitly — MediaDeviceInfo does not spread.
  return inputs
    .map((device) => {
      const deviceId = device.deviceId || '';
      const label = device.label || '';
      return {
        deviceId,
        label,
        kind: device.kind,
        groupId: device.groupId || '',
        isLoopback: isLoopbackInputLabel(label),
        isAlias: deviceId === 'default' || deviceId === 'communications',
      };
    })
    .filter((device) => device.deviceId)
    .sort((a, b) => {
      if (a.isLoopback !== b.isLoopback) return a.isLoopback ? 1 : -1;
      if (a.isAlias !== b.isAlias) return a.isAlias ? 1 : -1;
      return (a.label || '').localeCompare(b.label || '', 'el');
    });
}

export function pickBestMicDeviceId(devices = [], preferredId = '') {
  if (preferredId) {
    const preferred = devices.find((device) => device.deviceId === preferredId);
    if (preferred && !preferred.isLoopback) return preferred.deviceId;
  }

  const realMic = devices.find((device) => !device.isLoopback && !device.isAlias && device.deviceId);
  if (realMic) return realMic.deviceId;

  const anyNonLoopback = devices.find((device) => !device.isLoopback && device.deviceId);
  return anyNonLoopback?.deviceId || '';
}

/** Force the chosen device — `ideal` was ignoring the dropdown and falling back to Stereo Mix. */
export function buildMicConstraints(deviceId) {
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };

  if (deviceId) {
    audio.deviceId = { exact: deviceId };
  }

  return { audio };
}

export function describeActiveMicTrack(track) {
  if (!track) return { label: '', deviceId: '', isLoopback: false };
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
  const label = track.label || '';
  return {
    label,
    deviceId: settings.deviceId || '',
    isLoopback: isLoopbackInputLabel(label),
  };
}

export function isLikelyWrongAudioSource(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function wrongAudioSourceMessage(deviceLabel) {
  const deviceHint = deviceLabel ? `\n\nΤρέχουσα συσκευή: «${deviceLabel}»` : '';
  return (
    'Το μικρόφωνο πιάνει ήχο από video/extension (π.χ. AUTHORWAVE), όχι τη φωνή σου.' +
    deviceHint +
    '\n\nΔοκίμασε:\n' +
    '• Διάλεξε πραγματικό μικρόφωνο από το dropdown (όχι Stereo Mix / Στερεοφωνική μείξη)\n' +
    '• Windows → Ρυθμίσεις → Ήχος → Είσοδος → απενεργοποίησε Stereo Mix\n' +
    '• Κλείσε tabs με video και απενεργοποίησε AUTHORWAVE'
  );
}

export async function transcribeAudio(blob) {
  const key = getOpenAiKey();
  if (!key) {
    throw new Error('Δεν έχεις OpenAI API key. Πήγαινε Settings → Voice.');
  }

  const extension = blob.type.includes('mp4') ? 'voice.mp4' : 'voice.webm';
  const form = new FormData();
  form.append('file', blob, extension);
  form.append('model', 'whisper-1');
  form.append('language', 'el');
  form.append('prompt', WHISPER_PROMPT);
  form.append('temperature', '0');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!response.ok) {
    let message = 'Αποτυχία μεταγραφής φωνής.';
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = await response.json();
  return (data.text || '').trim();
}
