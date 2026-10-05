import {
  CIRCUMFERENCE_SOURCE,
  CIRCUMFERENCE_UNIT,
  CIRCUMFERENCE_SPECS,
  parseCircumferenceCm,
  expandCircumferenceReadings,
  getCircumferenceReadingsForDay,
  getLatestCircumferenceReading,
  getPreviousCircumferenceReading,
  buildCircumferenceCardFromReadings,
} from './circumferenceReadings';

export const WAIST_METRIC_TYPE = CIRCUMFERENCE_SPECS.waist.id;
export const WAIST_SOURCE = CIRCUMFERENCE_SOURCE;
export const WAIST_UNIT = CIRCUMFERENCE_UNIT;
export const WAIST_MIN_CM = CIRCUMFERENCE_SPECS.waist.min;
export const WAIST_MAX_CM = CIRCUMFERENCE_SPECS.waist.max;

export function parseWaistCm(raw) {
  return parseCircumferenceCm('waist', raw);
}

export function expandWaistReadings(metrics = []) {
  return expandCircumferenceReadings('waist', metrics);
}

export function getWaistReadingsForDay(metrics = [], day) {
  return getCircumferenceReadingsForDay('waist', metrics, day);
}

export function getLatestWaistReading(metrics = []) {
  return getLatestCircumferenceReading('waist', metrics);
}

export function getPreviousWaistReading(metrics = [], beforeRecordedAt = null) {
  return getPreviousCircumferenceReading('waist', metrics, beforeRecordedAt);
}

export function buildWaistCardFromReadings(readings = [], options = {}) {
  return buildCircumferenceCardFromReadings('waist', readings, options);
}
