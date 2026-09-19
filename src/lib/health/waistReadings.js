import {
  formatWeightReadingTime,
  normalizeWeightReadings,
  buildWeightLineChart,
} from './weightReadings';

export const WAIST_METRIC_TYPE = 'waist';
export const WAIST_SOURCE = 'manual';
export const WAIST_UNIT = 'cm';
export const WAIST_MIN_CM = 40;
export const WAIST_MAX_CM = 200;

export function parseWaistCm(raw) {
  if (raw == null || raw === '') return null;
  const value = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < WAIST_MIN_CM || value > WAIST_MAX_CM) return null;
  return Math.round(value * 10) / 10;
}

export function expandWaistReadings(metrics = []) {
  const rows = metrics
    .filter((metric) => metric.metricType === WAIST_METRIC_TYPE && metric.value != null)
    .flatMap((metric) =>
      normalizeWeightReadings(metric).map((reading) => ({
        ...reading,
        day: metric.day,
        source: metric.source,
      })),
    );

  const byDay = new Map();
  for (const row of rows.sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )) {
    byDay.set(row.day, row);
  }

  return [...byDay.values()];
}

export function getWaistReadingsForDay(metrics = [], day) {
  return expandWaistReadings(metrics).filter((reading) => reading.day === day);
}

export function getLatestWaistReading(metrics = []) {
  const readings = expandWaistReadings(metrics);
  return readings.length ? readings[readings.length - 1] : null;
}

export function getPreviousWaistReading(metrics = [], beforeRecordedAt = null) {
  const readings = expandWaistReadings(metrics);
  if (!readings.length) return null;
  if (!beforeRecordedAt) return readings.length > 1 ? readings[readings.length - 2] : null;
  const index = readings.findIndex((reading) => reading.recordedAt === beforeRecordedAt);
  if (index > 0) return readings[index - 1];
  return readings.length > 1 ? readings[readings.length - 2] : null;
}

export function buildWaistCardFromReadings(readings = [], { delta = null } = {}) {
  if (!readings.length) return null;
  const latest = readings[readings.length - 1];
  const cm = Math.round(latest.value * 10) / 10;
  const chart = buildWeightLineChart(readings);
  if (chart) chart.unit = WAIST_UNIT;

  return {
    id: 'waist',
    label: 'Μέση',
    cm,
    unit: WAIST_UNIT,
    delta,
    recordedAt: latest.recordedAt,
    status:
      delta == null || Math.abs(delta) < 0.3
        ? readings.length > 1
          ? `${readings.length} μετρήσεις`
          : latest.recordedAt
            ? `Τελευταία · ${formatWeightReadingTime(latest.recordedAt)}`
            : 'Καταγραφή'
        : delta > 0
          ? 'Πάνω vs χθες'
          : 'Κάτω vs χθες',
    icon: 'waist',
    readings,
    chart,
  };
}
