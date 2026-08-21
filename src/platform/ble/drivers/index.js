import { qnScaleDriver } from './qn-scale.js';

export const bleDrivers = [qnScaleDriver];

export function matchDriver(device) {
  return bleDrivers.find((driver) => driver.matchScanResult(device)) ?? null;
}

export function getDriverById(id) {
  return bleDrivers.find((driver) => driver.id === id) ?? null;
}

export { qnScaleDriver };
