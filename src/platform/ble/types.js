export const QN_SCALE_SERVICE_FFE0 = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const QN_SCALE_NOTIFY_FFE1 = '0000ffe1-0000-1000-8000-00805f9b34fb';
export const QN_SCALE_INDICATE_FFE2 = '0000ffe2-0000-1000-8000-00805f9b34fb';
export const QN_SCALE_WRITE_FFE3 = '0000ffe3-0000-1000-8000-00805f9b34fb';

export const QN_SCALE_SERVICE_FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb';
export const QN_SCALE_NOTIFY_FFF1 = '0000fff1-0000-1000-8000-00805f9b34fb';
export const QN_SCALE_WRITE_FFF2 = '0000fff2-0000-1000-8000-00805f9b34fb';

export const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

/** @typedef {{ id: string, name: string, address?: string, rssi?: number }} BleDeviceInfo */

/** @typedef {{ type: string, value: number, unit: string, stable?: boolean, impedance?: number, raw?: Uint8Array }} BleMeasurement */

/** @typedef {{ heightCm?: number, age?: number, sex?: 'male' | 'female', birthdate?: string }} QnUserProfile */

/**
 * @typedef {Object} BleDriver
 * @property {string} id
 * @property {string} label
 * @property {(device: BleDeviceInfo) => boolean} matchScanResult
 * @property {(transport: import('./BleTransport').BleTransport, deviceId: string, profile?: QnUserProfile) => Promise<{ disconnect: () => Promise<void> }>} connect
 */

export function normalizeUuid(uuid) {
  if (!uuid) return '';
  const lower = uuid.toLowerCase();
  if (lower.length === 4) {
    return `0000${lower}-0000-1000-8000-00805f9b34fb`;
  }
  return lower;
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}
