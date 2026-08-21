import { mapOuraRowToSelfData } from './ouraMetrics';
import { buildHeartRateMetric, extractHeartRateFromOuraRow } from './heartRateMetric';
import { emptySelfData, NO_DATA } from '../data/emptySelfData';

function numericValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function computeDayScore(metrics) {
  const values = [
    numericValue(metrics?.sleep?.value),
    numericValue(metrics?.readiness?.value),
    numericValue(metrics?.activity?.value),
    numericValue(metrics?.emotionalState?.value),
  ].filter((value) => value != null);

  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function selfDataToDayLabMetrics(selfData, { syncedAt } = {}) {
  if (!selfData?.metrics) return null;

  const { metrics, systemStatus, day, source } = selfData;
  const dayScoreValue = computeDayScore(metrics);

  return {
    source: source === 'oura' ? 'oura' : 'self',
    syncedAt: syncedAt || new Date().toISOString(),
    day: day || null,
    preview: false,
    systemStatus: {
      label: systemStatus?.label || '—',
      sublabel: source === 'oura' ? 'Oura · Self' : systemStatus?.sublabel || 'Day metrics',
    },
    leftMetrics: [
      metrics.heartRate,
      metrics.readiness,
      metrics.activity,
      metrics.calories,
    ],
    rightMetrics: [metrics.sleep, metrics.emotionalState].filter(Boolean),
    dayScore:
      dayScoreValue != null
        ? {
            id: 'dayScore',
            label: 'Day score',
            value: dayScoreValue,
            max: 100,
            display: `${(dayScoreValue / 10).toFixed(1)}/10`,
            status: systemStatus?.label || '—',
          }
        : null,
  };
}

export function ouraRowToLifelineMetrics(row) {
  if (!row?.day) return null;
  const selfData = mapOuraRowToSelfData(row);
  return selfDataToDayLabMetrics(
    { ...selfData, day: row.day, source: 'oura' },
    { syncedAt: row.synced_at || new Date().toISOString() },
  );
}

export function buildLifelineMetricsPatches(ouraRows) {
  const patches = {};
  for (const row of ouraRows || []) {
    const metrics = ouraRowToLifelineMetrics(row);
    if (metrics) patches[row.day] = { metrics };
  }
  return patches;
}

export function normalizeDayMetrics(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const hasLeft = Array.isArray(raw.leftMetrics) && raw.leftMetrics.length > 0;
  const hasWeight = raw.weight != null && raw.weight.kg != null;
  if (!hasLeft && !hasWeight) return null;

  return {
    source: typeof raw.source === 'string' ? raw.source : 'oura',
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : null,
    day: typeof raw.day === 'string' ? raw.day : null,
    preview: raw.preview === true,
    systemStatus:
      raw.systemStatus && typeof raw.systemStatus === 'object'
        ? {
            label: raw.systemStatus.label || '—',
            sublabel: raw.systemStatus.sublabel || 'Day metrics',
          }
        : { label: '—', sublabel: 'Day metrics' },
    leftMetrics: hasLeft ? raw.leftMetrics : [],
    rightMetrics: Array.isArray(raw.rightMetrics) ? raw.rightMetrics : [],
    dayScore: raw.dayScore && typeof raw.dayScore === 'object' ? raw.dayScore : null,
    weight: hasWeight ? raw.weight : null,
  };
}

export function enrichDayLabMetrics(metrics, ouraRow = null) {
  if (!metrics) return metrics;

  const heartRateFromOura = ouraRow
    ? buildHeartRateMetric(extractHeartRateFromOuraRow(ouraRow))
    : null;
  const hasSampleTimestamps = Boolean(heartRateFromOura?.chart?.samples?.length);

  const leftMetrics = [...(metrics.leftMetrics || [])];
  const rightMetrics = [...(metrics.rightMetrics || [])];
  const heartIndex = leftMetrics.findIndex((metric) => metric.id === 'heartRate');
  const existingHasSamples = Boolean(leftMetrics[heartIndex]?.chart?.samples?.length);

  if (hasSampleTimestamps && (!existingHasSamples || heartIndex < 0)) {
    if (heartIndex >= 0) {
      leftMetrics[heartIndex] = heartRateFromOura;
    } else {
      leftMetrics.unshift(heartRateFromOura);
    }
    return { ...metrics, leftMetrics, rightMetrics };
  }

  if (heartIndex >= 0) return metrics;

  leftMetrics.unshift(heartRateFromOura ?? buildHeartRateMetric({}));
  return { ...metrics, leftMetrics, rightMetrics };
}

export function getEmptyDayLabView(date = null) {
  const { metrics } = emptySelfData;

  return enrichDayLabMetrics({
    preview: false,
    source: 'none',
    syncedAt: null,
    day: date,
    systemStatus: {
      label: NO_DATA,
      sublabel: NO_DATA,
    },
    leftMetrics: [
      metrics.heartRate,
      metrics.readiness,
      metrics.activity,
      metrics.calories,
    ],
    rightMetrics: [metrics.sleep, metrics.emotionalState],
    dayScore: null,
    weight: null,
  });
}

export function getDayLabView({ entryMetrics, date, ouraRow = null }) {
  const metrics = entryMetrics?.preview === true ? null : entryMetrics;

  if (metrics && !metrics.preview) {
    return enrichDayLabMetrics(
      {
        ...metrics,
        preview: false,
        weight: metrics.weight ?? null,
      },
      ouraRow,
    );
  }
  if (metrics?.weight || metrics?.leftMetrics?.length) {
    return enrichDayLabMetrics(
      {
        ...metrics,
        preview: false,
      },
      ouraRow,
    );
  }
  return getEmptyDayLabView(date);
}
