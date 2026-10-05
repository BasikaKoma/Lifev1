import {
  formatWeightReadingTime,
  normalizeWeightReadings,
  buildWeightLineChart,
} from './weightReadings';

export const CIRCUMFERENCE_SOURCE = 'manual';
export const CIRCUMFERENCE_UNIT = 'cm';

export const CIRCUMFERENCE_SPECS = {
  waist: { id: 'waist', label: 'Μέση', min: 40, max: 200, icon: 'waist' },
  thigh: { id: 'thigh', label: 'Μηρός', min: 30, max: 100, icon: 'thigh' },
  arm: { id: 'arm', label: 'Μπράτσο', min: 15, max: 60, icon: 'arm' },
};

export const CIRCUMFERENCE_KINDS = ['waist', 'thigh', 'arm'];

export function circumferenceSpec(kind) {
  return CIRCUMFERENCE_SPECS[kind] || null;
}

export function parseCircumferenceCm(kind, raw) {
  const spec = circumferenceSpec(kind);
  if (!spec || raw == null || raw === '') return null;
  const value = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return null;
  return Math.round(value * 10) / 10;
}

export function expandCircumferenceReadings(kind, metrics = []) {
  const spec = circumferenceSpec(kind);
  if (!spec) return [];
  const rows = metrics
    .filter((metric) => metric.metricType === spec.id && metric.value != null)
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

export function getCircumferenceReadingsForDay(kind, metrics = [], day) {
  return expandCircumferenceReadings(kind, metrics).filter((reading) => reading.day === day);
}

export function getLatestCircumferenceReading(kind, metrics = []) {
  const readings = expandCircumferenceReadings(kind, metrics);
  return readings.length ? readings[readings.length - 1] : null;
}

export function getPreviousCircumferenceReading(kind, metrics = [], beforeRecordedAt = null) {
  const readings = expandCircumferenceReadings(kind, metrics);
  if (!readings.length) return null;
  if (!beforeRecordedAt) return readings.length > 1 ? readings[readings.length - 2] : null;
  const index = readings.findIndex((reading) => reading.recordedAt === beforeRecordedAt);
  if (index > 0) return readings[index - 1];
  return readings.length > 1 ? readings[readings.length - 2] : null;
}

export function buildCircumferenceCardFromReadings(kind, readings = [], { delta = null } = {}) {
  const spec = circumferenceSpec(kind);
  if (!spec || !readings.length) return null;
  const latest = readings[readings.length - 1];
  const cm = Math.round(latest.value * 10) / 10;
  const chart = buildWeightLineChart(readings);
  if (chart) chart.unit = CIRCUMFERENCE_UNIT;

  return {
    id: spec.id,
    label: spec.label,
    cm,
    unit: CIRCUMFERENCE_UNIT,
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
    icon: spec.icon,
    readings,
    chart,
  };
}
