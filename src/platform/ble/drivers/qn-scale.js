import {
  QN_SCALE_INDICATE_FFE2,
  QN_SCALE_NOTIFY_FFE1,
  QN_SCALE_NOTIFY_FFF1,
  QN_SCALE_SERVICE_FFE0,
  QN_SCALE_SERVICE_FFF0,
  QN_SCALE_WRITE_FFE3,
  QN_SCALE_WRITE_FFF2,
  bytesToHex,
  normalizeUuid,
} from '../types.js';

let lastRawHex = null;

export function getLastQnRawHex() {
  return lastRawHex;
}

/**
 * QN-Scale (QingNiu / ACME SC101) notification parser.
 *
 * Confirmed layout from openScale + ESPhome for the FFE1 weight frame:
 *   byte0 = 0x10        → weight frame marker
 *   byte3..byte4        → weight, big-endian, hundredths of a kg
 *   byte5 = 0x01        → measurement is final/stable (0x00 while still settling)
 *   byte6..byte7        → impedance (when present)
 *
 * Example: 10 0b 15 1f d1 01 …  → (0x1fd1)/100 = 81.45 kg, stable.
 *
 * We deliberately parse ONLY this layout. The previous "try every byte order"
 * heuristic produced phantom readings (e.g. a live frame mis-read as 53.87 kg)
 * that then got persisted, so strictness here is what keeps the saved weight correct.
 */
export function parseQnScaleNotification(dataView) {
  if (!dataView || dataView.byteLength < 6) return null;

  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
  lastRawHex = bytesToHex(bytes);

  if (bytes[0] !== 0x10) return null;

  const weightKg = (((bytes[3] & 0xff) << 8) | (bytes[4] & 0xff)) / 100;
  if (!Number.isFinite(weightKg) || weightKg < 5 || weightKg > 300) return null;

  const stable = bytes[5] === 0x01;

  let impedance = null;
  if (bytes.byteLength >= 8) {
    const impRaw = bytes[6] | (bytes[7] << 8);
    if (impRaw > 0 && impRaw < 5000) impedance = impRaw;
  }

  return {
    type: 'weight',
    value: Math.round(weightKg * 100) / 100,
    unit: 'kg',
    stable,
    impedance,
    raw: bytes,
  };
}

/**
 * openScale / QingNiu "start measurement" packet written to FFE3.
 * Confirmed working: [0x13, 0x09, 0x15, unit, 0x10, 0x00, 0x00, 0x00, checksum]
 * where unit 0x01 = kg and checksum = (sum of previous bytes) & 0xff.
 * This is the packet the scale needs to begin streaming weight on FFE1.
 */
function buildMeasurementRequestPacket() {
  const packet = new Uint8Array([0x13, 0x09, 0x15, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00]);
  let sum = 0;
  for (let i = 0; i < packet.length - 1; i += 1) sum += packet[i];
  packet[packet.length - 1] = sum & 0xff;
  return packet;
}

// Known QN GATT layouts. FFE0 is the confirmed layout for ACME SC101 (openScale):
// notify on FFE1, *indications* on FFE2 (control channel the scale needs), write on FFE3.
const QN_LAYOUTS = [
  {
    service: QN_SCALE_SERVICE_FFE0,
    notify: [QN_SCALE_NOTIFY_FFE1],
    indicate: [QN_SCALE_INDICATE_FFE2],
    write: QN_SCALE_WRITE_FFE3,
  },
  {
    service: QN_SCALE_SERVICE_FFF0,
    notify: [QN_SCALE_NOTIFY_FFF1],
    indicate: [],
    write: QN_SCALE_WRITE_FFF2,
  },
];

export const qnScaleDriver = {
  id: 'qn-scale',
  label: 'QN-Scale (QingNiu / ACME SC101)',

  matchScanResult(device) {
    const name = device?.name || device?.localName || '';
    return /^QN-Scale/i.test(name) || /^ACME/i.test(name);
  },

  async connect(transport, deviceId, profile = {}, { onMeasurement, webDevice } = {}) {
    const emitStage = (stage, extra = {}) =>
      onMeasurement?.({ type: 'stage', stage, deviceId, source: 'qn_scale', ...extra });

    try {
      emitStage('connecting');
      if (webDevice) {
        await transport.connect(deviceId, webDevice);
      } else {
        await transport.connect(deviceId);
      }

      emitStage('discovering');
      await transport.discoverServices(deviceId).catch(() => {});

      const services = await transport.getServices(deviceId);
      const normalized = services.map(normalizeUuid);

      onMeasurement?.({
        type: 'services',
        services: normalized,
        deviceId,
        source: 'qn_scale',
      });
      emitStage('services', { count: normalized.length });

      const handleNotification = (dataView) => {
        const parsed = parseQnScaleNotification(dataView);
        if (parsed) {
          onMeasurement?.({ ...parsed, deviceId, source: 'qn_scale' });
        } else if (lastRawHex) {
          onMeasurement?.({ type: 'raw', rawHex: lastRawHex, deviceId, source: 'qn_scale' });
        }
      };

      // For each QN layout present on this device, enable notifications on the
      // notify characteristic AND indications on the control characteristic
      // (@capacitor-community/bluetooth-le startNotifications handles both notify
      // and indicate). openScale enables FFE2 indications — the scale needs it to
      // start streaming weight frames on FFE1.
      const active = [];
      emitStage('subscribing');

      for (const layout of QN_LAYOUTS) {
        const present = normalized.some((s) => s === normalizeUuid(layout.service));
        if (!present) continue;

        const subscribed = { service: layout.service, write: layout.write, chars: [] };

        for (const notifyUuid of layout.notify) {
          try {
            await transport.startNotifications(deviceId, layout.service, notifyUuid, handleNotification);
            subscribed.chars.push(notifyUuid);
          } catch (e) {
            console.warn(`QN: notify subscribe failed on ${notifyUuid}`, e);
          }
        }

        for (const indicateUuid of layout.indicate) {
          try {
            await transport.startNotifications(deviceId, layout.service, indicateUuid, handleNotification);
            subscribed.chars.push(indicateUuid);
          } catch (e) {
            console.warn(`QN: indicate subscribe failed on ${indicateUuid}`, e);
          }
        }

        if (subscribed.chars.length) active.push(subscribed);
      }

      if (!active.length) {
        emitStage('error', {
          message: `Δεν βρέθηκε QN notify. Services: ${
            normalized.map((s) => s.slice(4, 8)).join(',') || 'none'
          }`,
        });
        await transport.disconnect(deviceId);
        throw new Error('QN notify characteristic not found');
      }

      emitStage('subscribed', { count: active.length });

      // Send the "start measurement" magic packet to the write characteristic.
      const requestPacket = buildMeasurementRequestPacket();
      const sendRequest = async () => {
        for (const layout of active) {
          await transport
            .write(deviceId, layout.service, layout.write, requestPacket, false)
            .catch((e) => console.warn('QN: measurement request write failed', e));
        }
      };

      await sendRequest();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await sendRequest();

      emitStage('ready', { count: active.length });

      return {
        async disconnect() {
          for (const layout of active) {
            for (const charUuid of layout.chars) {
              await transport.stopNotifications(deviceId, layout.service, charUuid).catch(() => {});
            }
          }
          await transport.disconnect(deviceId).catch(() => {});
        },
      };
    } catch (err) {
      emitStage('error', { message: err?.message || 'connect failed' });
      throw err;
    }
  },
};

export default qnScaleDriver;
