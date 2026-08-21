import { Capacitor } from '@capacitor/core';
import { detectPlatform } from '../../capabilities.js';
import {
  QN_SCALE_SERVICE_FFE0,
  QN_SCALE_SERVICE_FFF0,
} from '../types.js';

const QN_SCAN_OPTIONS = {
  optionalServices: [QN_SCALE_SERVICE_FFE0, QN_SCALE_SERVICE_FFF0],
};

function isQnScaleName(name = '') {
  return /^QN-Scale/i.test(name) || /^ACME/i.test(name);
}

function mapScanResult(result, fallbackName = 'QN-Scale') {
  const name = result.device?.name || result.localName || fallbackName;
  return {
    id: result.device.deviceId,
    name,
    address: result.device.deviceId,
    rssi: result.rssi,
  };
}

export class WebBleTransport {
  constructor() {
    this.onDisconnect = null;
  }

  isAvailable() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async scan({ onDevice } = {}) {
    const devices = await this.pickDevice();
    for (const device of devices) onDevice?.(device);
    return devices;
  }

  async pickDevice({ namePrefix = 'QN-Scale' } = {}) {
    if (!this.isAvailable()) throw new Error('Web Bluetooth not available');

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix }],
        optionalServices: QN_SCAN_OPTIONS.optionalServices,
      });
    } catch (err) {
      if (namePrefix !== 'QN') {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [QN_SCALE_SERVICE_FFE0] }],
          optionalServices: QN_SCAN_OPTIONS.optionalServices,
        });
      } else {
        throw err;
      }
    }

    this._devices = this._devices ?? new Map();
    this._devices.set(device.id, device);
    this._watchDisconnect(device);

    return [{
      id: device.id,
      name: device.name || namePrefix,
      address: device.id,
      _webDevice: device,
    }];
  }

  async getPermittedDevice(deviceId) {
    if (!this.isAvailable() || !deviceId) return null;
    if (!navigator.bluetooth?.getDevices) return null;

    const permitted = await navigator.bluetooth.getDevices();
    const webDevice = permitted.find((entry) => entry.id === deviceId);
    if (!webDevice) return null;

    this._devices = this._devices ?? new Map();
    this._devices.set(webDevice.id, webDevice);
    this._watchDisconnect(webDevice);

    return {
      id: webDevice.id,
      name: webDevice.name || 'QN-Scale',
      address: webDevice.id,
      _webDevice: webDevice,
    };
  }

  _watchDisconnect(device) {
    if (!device?.addEventListener) return;
    if (device._lifev1DisconnectHandler) return;

    const handler = () => {
      this._servers?.delete(device.id);
      this.onDisconnect?.(device.id);
    };
    device._lifev1DisconnectHandler = handler;
    device.addEventListener('gattserverdisconnected', handler);
  }

  async connect(deviceId, webDevice) {
    const device = webDevice ?? this._devices?.get(deviceId);
    if (!device) throw new Error('Device not found');
    const server = await device.gatt.connect();
    this._servers = this._servers ?? new Map();
    this._servers.set(deviceId, { device, server });
    this._devices?.set(deviceId, device);
    this._watchDisconnect(device);
    return server;
  }

  async disconnect(deviceId) {
    if (deviceId) {
      const entry = this._servers?.get(deviceId);
      if (entry?.device?.gatt?.connected) {
        entry.device.gatt.disconnect();
      }
      this._servers?.delete(deviceId);
      return;
    }

    for (const [id, entry] of this._servers ?? []) {
      if (entry?.device?.gatt?.connected) {
        entry.device.gatt.disconnect();
      }
      this._servers.delete(id);
    }
  }

  async getServices(deviceId) {
    const server = this._servers?.get(deviceId)?.server;
    if (!server) throw new Error('Not connected');
    const services = await server.getPrimaryServices();
    return services.map((s) => s.uuid);
  }

  async discoverServices(deviceId) {
    return this.getServices(deviceId);
  }

  async startNotifications(deviceId, serviceUuid, characteristicUuid, callback) {
    const server = this._servers?.get(deviceId)?.server;
    if (!server) throw new Error('Not connected');
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);
    const handler = (event) => callback(event.target.value);
    characteristic.addEventListener('characteristicvaluechanged', handler);
    await characteristic.startNotifications();
    this._notifyHandlers = this._notifyHandlers ?? new Map();
    this._notifyHandlers.set(`${deviceId}:${serviceUuid}:${characteristicUuid}`, { characteristic, handler });
  }

  async stopNotifications(deviceId, serviceUuid, characteristicUuid) {
    const key = `${deviceId}:${serviceUuid}:${characteristicUuid}`;
    const entry = this._notifyHandlers?.get(key);
    if (entry) {
      entry.characteristic.removeEventListener('characteristicvaluechanged', entry.handler);
      await entry.characteristic.stopNotifications().catch(() => {});
      this._notifyHandlers.delete(key);
    }
  }

  async write(deviceId, serviceUuid, characteristicUuid, data, withResponse = false) {
    const server = this._servers?.get(deviceId)?.server;
    if (!server) throw new Error('Not connected');
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);
    if (withResponse) {
      await characteristic.writeValueWithResponse(data);
    } else {
      await characteristic.writeValueWithoutResponse(data);
    }
  }
}

export class CapacitorBleTransport extends WebBleTransport {
  async isAvailable() {
    if (detectPlatform() !== 'capacitor' && Capacitor.getPlatform() !== 'android') {
      return false;
    }
    try {
      const { BleClient } = await import('@capacitor-community/bluetooth-le');
      await BleClient.initialize({ androidNeverForLocation: true });
      return true;
    } catch {
      return false;
    }
  }

  async requestPermissions() {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    if (typeof BleClient.requestEnable === 'function') {
      try {
        await BleClient.requestEnable();
      } catch {
        // user declined — scan may still work if BT already on
      }
    }
    if (typeof BleClient.requestLEScanPermission === 'function') {
      await BleClient.requestLEScanPermission();
    } else if (typeof BleClient.requestLEScanPermissions === 'function') {
      await BleClient.requestLEScanPermissions();
    }
    return true;
  }

  async scan({ namePrefix = 'QN-Scale', timeoutMs = 10000, onDevice } = {}) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    await this.requestPermissions();

    const found = new Map();

    const addDevice = (result) => {
      const device = mapScanResult(result, namePrefix);
      if (!isQnScaleName(device.name) && device.name !== namePrefix) return;
      found.set(device.id, device);
      onDevice?.(device);
    };

    if (typeof BleClient.getBondedDevices === 'function') {
      try {
        const bonded = await BleClient.getBondedDevices();
        for (const entry of bonded) {
          if (!isQnScaleName(entry.name || '')) continue;
          const device = {
            id: entry.deviceId,
            name: entry.name || namePrefix,
            address: entry.deviceId,
          };
          found.set(device.id, device);
          onDevice?.(device);
        }
      } catch {
        // ignore
      }
    }

    await BleClient.requestLEScan({ namePrefix, ...QN_SCAN_OPTIONS }, addDevice);

    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await BleClient.stopLEScan().catch(() => {});

    return [...found.values()];
  }

  async pickDevice({ namePrefix = 'QN-Scale' } = {}) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    await this.requestPermissions();

    const device = await BleClient.requestDevice({
      namePrefix,
      ...QN_SCAN_OPTIONS,
    });

    return [{
      id: device.deviceId,
      name: device.name || namePrefix,
      address: device.deviceId,
    }];
  }

  async getPermittedDevice(deviceId) {
    if (!deviceId) return null;
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    await this.requestPermissions();

    if (typeof BleClient.getDevices === 'function') {
      const devices = await BleClient.getDevices([deviceId]);
      const entry = devices[0];
      if (entry) {
        return {
          id: entry.deviceId,
          name: entry.name || 'QN-Scale',
          address: entry.deviceId,
        };
      }
    }

    if (typeof BleClient.getBondedDevices === 'function') {
      try {
        const bonded = await BleClient.getBondedDevices();
        const entry = bonded.find((item) => item.deviceId === deviceId);
        if (entry) {
          return {
            id: entry.deviceId,
            name: entry.name || 'QN-Scale',
            address: entry.deviceId,
          };
        }
      } catch {
        // ignore
      }
    }

    return {
      id: deviceId,
      name: 'QN-Scale',
      address: deviceId,
    };
  }

  async connect(deviceId) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.connect(deviceId, (id) => {
      this._servers?.delete?.(id);
      this._capDeviceIds?.delete(id);
      this.onDisconnect?.(id);
    });
    this._capDeviceIds = this._capDeviceIds ?? new Set();
    this._capDeviceIds.add(deviceId);
    return deviceId;
  }

  async disconnect(deviceId) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.disconnect(deviceId).catch(() => {});
    this._capDeviceIds?.delete(deviceId);
  }

  async getServices(deviceId) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    const services = await BleClient.getServices(deviceId);
    return services.map((s) => s.uuid);
  }

  async discoverServices(deviceId) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.discoverServices(deviceId);
  }

  async startNotifications(deviceId, serviceUuid, characteristicUuid, callback) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.startNotifications(deviceId, serviceUuid, characteristicUuid, (value) => {
      callback(new DataView(value.buffer));
    });
  }

  async stopNotifications(deviceId, serviceUuid, characteristicUuid) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.stopNotifications(deviceId, serviceUuid, characteristicUuid).catch(() => {});
  }

  async write(deviceId, serviceUuid, characteristicUuid, data, withResponse = false) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (withResponse) {
      await BleClient.write(deviceId, serviceUuid, characteristicUuid, dataView);
    } else {
      await BleClient.writeWithoutResponse(deviceId, serviceUuid, characteristicUuid, dataView);
    }
  }
}
