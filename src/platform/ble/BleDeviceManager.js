import { getBleTransport } from './BleTransport.js';
import { matchDriver, qnScaleDriver } from './drivers/index.js';

export class BleDeviceManager {
  constructor() {
    this.transport = getBleTransport();
    this.activeConnection = null;
    this.listeners = new Set();
    this.connectionListeners = new Set();
  }

  onConnectionChange(callback) {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  _setConnected(connected, device = null) {
    for (const listener of this.connectionListeners) {
      try {
        listener({ connected, device });
      } catch {
        // ignore
      }
    }
  }

  onMeasurement(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _emit(measurement) {
    for (const listener of this.listeners) {
      try {
        listener(measurement);
      } catch {
        // ignore
      }
    }
  }

  async isAvailable() {
    return this.transport.isAvailable();
  }

  async requestPermissions() {
    return this.transport.requestPermissions?.() ?? true;
  }

  async ensureHooks() {
    if (this._hooksBound) return;
    await this.transport.setOnDisconnect?.((deviceId) => {
      if (this.activeConnection?.device?.id === deviceId) {
        this.activeConnection = null;
        this._setConnected(false, { id: deviceId });
      }
    });
    this._hooksBound = true;
  }

  async scan({ timeoutMs = 10000, onDevice } = {}) {
    await this.requestPermissions();
    const devices = await this.transport.scan({
      namePrefix: 'QN-Scale',
      timeoutMs,
      onDevice,
    });
    return devices.map((device) => ({
      ...device,
      driver: matchDriver(device),
    }));
  }

  async pickDevice() {
    await this.requestPermissions();
    const pick = this.transport.pickDevice?.bind(this.transport);
    if (!pick) {
      const devices = await this.scan({ timeoutMs: 100 });
      if (!devices.length) throw new Error('Δεν βρέθηκε QN-Scale');
      return devices[0];
    }
    const [device] = await pick({ namePrefix: 'QN-Scale' });
    if (!device) throw new Error('Δεν βρέθηκε QN-Scale');
    return {
      ...device,
      driver: matchDriver(device),
    };
  }

  async connect(device, { profile } = {}) {
    const driver = device.driver ?? matchDriver(device) ?? qnScaleDriver;
    if (!driver) throw new Error('No driver for this device');

    await this.ensureHooks();
    await this.disconnect();

    const session = await driver.connect(this.transport, device.id, profile, {
      webDevice: device._webDevice,
      onMeasurement: (measurement) => {
        this._emit({
          ...measurement,
          deviceName: device.name,
          weightKg: measurement.value,
        });
      },
    });

    this.activeConnection = { device, driver, session };
    this._setConnected(true, device);
    return session;
  }

  async reconnectStoredDevice(storedDevice, { profile } = {}) {
    if (!storedDevice?.id) return false;
    if (this.getActiveDevice()) {
      this._setConnected(true, this.getActiveDevice());
      return true;
    }

    const device = await this.transport.getPermittedDevice(storedDevice.id);
    if (!device) {
      throw new Error('Η ζυγαριά δεν είναι διαθέσιμη. Πάτα «Σύνδεση QN-Scale» για επανασύνδεση.');
    }

    device.driver = device.driver ?? matchDriver(device) ?? qnScaleDriver;
    await this.connect(device, { profile });
    return true;
  }

  async disconnect() {
    const device = this.activeConnection?.device ?? null;
    const deviceId = device?.id ?? null;
    if (this.activeConnection?.session) {
      await this.activeConnection.session.disconnect().catch(() => {});
    } else if (deviceId) {
      await this.transport.disconnect(deviceId).catch(() => {});
    }
    this.activeConnection = null;
    this._setConnected(false, device);
  }

  getActiveDevice() {
    return this.activeConnection?.device ?? null;
  }
}

let sharedManager = null;

export function getBleDeviceManager() {
  if (!sharedManager) sharedManager = new BleDeviceManager();
  return sharedManager;
}

export { getBleTransport } from './BleTransport.js';
export { matchDriver, qnScaleDriver } from './drivers/index.js';
