import { detectPlatform } from '../capabilities.js';
import { normalizeUuid } from './types';

function toDataView(value) {
  if (value instanceof DataView) return value;
  if (value instanceof ArrayBuffer) return new DataView(value);
  if (ArrayBuffer.isView(value)) {
    return new DataView(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value?.buffer instanceof ArrayBuffer) {
    return new DataView(value.buffer, value.byteOffset ?? 0, value.byteLength ?? value.buffer.byteLength);
  }
  return new DataView(new ArrayBuffer(0));
}

export class BleTransport {
  constructor() {
    this._impl = null;
    this._initPromise = null;
  }

  async _ensureImpl() {
    if (this._impl) return this._impl;
    if (!this._initPromise) {
      this._initPromise = (async () => {
        const id = detectPlatform();
        const mod = await import('./transport/webTransport.js');
        if (id === 'capacitor') {
          this._impl = new mod.CapacitorBleTransport();
        } else {
          this._impl = new mod.WebBleTransport();
        }
        return this._impl;
      })();
    }
    this._impl = await this._initPromise;
    return this._impl;
  }

  async isAvailable() {
    try {
      const impl = await this._ensureImpl();
      const result = impl.isAvailable();
      return result instanceof Promise ? await result : Boolean(result);
    } catch {
      return false;
    }
  }

  async requestPermissions() {
    const impl = await this._ensureImpl();
    return impl.requestPermissions?.() ?? true;
  }

  async scan({ namePrefix, timeoutMs = 10000, onDevice } = {}) {
    const impl = await this._ensureImpl();
    return impl.scan({ namePrefix, timeoutMs, onDevice });
  }

  async pickDevice(options) {
    const impl = await this._ensureImpl();
    return impl.pickDevice?.(options) ?? impl.scan(options);
  }

  async getPermittedDevice(deviceId) {
    const impl = await this._ensureImpl();
    return impl.getPermittedDevice?.(deviceId) ?? null;
  }

  async setOnDisconnect(handler) {
    const impl = await this._ensureImpl();
    if (impl) impl.onDisconnect = handler;
  }

  async connect(deviceId, webDevice) {
    const impl = await this._ensureImpl();
    return impl.connect(deviceId, webDevice);
  }

  async disconnect(deviceId) {
    const impl = await this._ensureImpl();
    return impl.disconnect(deviceId);
  }

  async discoverServices(deviceId) {
    const impl = await this._ensureImpl();
    return impl.discoverServices(deviceId);
  }

  async getServices(deviceId) {
    const impl = await this._ensureImpl();
    return impl.getServices(deviceId);
  }

  async startNotifications(deviceId, serviceUuid, characteristicUuid, callback) {
    const impl = await this._ensureImpl();
    return impl.startNotifications(deviceId, normalizeUuid(serviceUuid), normalizeUuid(characteristicUuid), (value) => {
      callback(toDataView(value));
    });
  }

  async stopNotifications(deviceId, serviceUuid, characteristicUuid) {
    const impl = await this._ensureImpl();
    return impl.stopNotifications(deviceId, normalizeUuid(serviceUuid), normalizeUuid(characteristicUuid));
  }

  async write(deviceId, serviceUuid, characteristicUuid, data, withResponse = false) {
    const impl = await this._ensureImpl();
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return impl.write(deviceId, normalizeUuid(serviceUuid), normalizeUuid(characteristicUuid), bytes, withResponse);
  }
}

let sharedTransport = null;

export function getBleTransport() {
  if (!sharedTransport) sharedTransport = new BleTransport();
  return sharedTransport;
}
