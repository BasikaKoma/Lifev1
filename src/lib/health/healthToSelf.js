import { emptySelfData, NO_DATA } from '../../data/emptySelfData';
import { mapOuraRowToSelfData } from '../../utils/ouraMetrics';
import { buildHeartRateMetric } from '../../utils/heartRateMetric';
import { buildTimelineFromReference } from '../../utils/selfDateUtils';

function metricValue(metrics, type, source = null) {
  const filtered = metrics.filter((m) => m.metricType === type);
  const row = source
    ? filtered.find((m) => m.source === source) ?? filtered[0]
    : filtered[0];
  return row?.value ?? null;
}

import { getLatestWeightReading, getPreviousWeightReading, formatWeightReadingTime } from './weightReadings';

function latestWeightMetrics(metrics) {
  const latest = getLatestWeightReading(metrics);
  if (!latest) return { latest: null, delta: null };

  const previous = getPreviousWeightReading(metrics, latest.recordedAt);
  const delta = previous
    ? Math.round((latest.value - previous.value) * 10) / 10
    : null;

  return {
    latest: {
      value: latest.value,
      recordedAt: latest.recordedAt,
      day: latest.day,
    },
    delta,
  };
}

function buildWeightMetric(kg, delta = null, recordedAt = null) {
  const timeLabel = recordedAt ? formatWeightReadingTime(recordedAt) : null;
  let status;
  if (timeLabel) {
    status = `Τελευταία · ${timeLabel}`;
  } else if (delta == null || Math.abs(delta) < 0.15) {
    status = `${kg} kg`;
  } else {
    status = `${delta > 0 ? '+' : ''}${delta} kg`;
  }

  return {
    id: 'weight',
    label: 'Weight',
    value: kg,
    kg,
    unit: 'kg',
    delta,
    recordedAt,
    status,
    icon: 'weight',
    chart: { type: 'progressBar' },
  };
}

function applyWeightMetric(metrics, healthMetrics) {
  const { latest, delta } = latestWeightMetrics(healthMetrics);
  metrics.weight = latest
    ? buildWeightMetric(latest.value, delta, latest.recordedAt)
    : emptySelfData.metrics.weight;
  return metrics;
}

export function healthMetricsToSelfData({ healthMetrics = [], ouraRow = null, connected = false }) {
  if (ouraRow) {
    const ouraData = mapOuraRowToSelfData(ouraRow);
    applyWeightMetric(ouraData.metrics, healthMetrics);
    if (healthMetrics.some((m) => m.source === 'qn_scale')) {
      ouraData.source = 'merged';
    }
    return ouraData;
  }

  const sleep = metricValue(healthMetrics, 'sleep', 'oura');
  const readiness = metricValue(healthMetrics, 'readiness', 'oura');
  const activity = metricValue(healthMetrics, 'activity', 'oura');
  const activeCalories = metricValue(healthMetrics, 'active_calories', 'oura');
  const totalCalories = metricValue(healthMetrics, 'total_calories', 'oura');
  const restingHr = metricValue(healthMetrics, 'resting_heart_rate', 'oura');
  const avgHr = metricValue(healthMetrics, 'avg_heart_rate', 'oura');
  const minHr = metricValue(healthMetrics, 'heart_rate_min', 'oura');
  const maxHr = metricValue(healthMetrics, 'heart_rate_max', 'oura');
  const { latest: latestWeight } = latestWeightMetrics(healthMetrics);

  const hasAny =
    sleep != null ||
    readiness != null ||
    activity != null ||
    latestWeight != null ||
    restingHr != null ||
    avgHr != null ||
    connected;

  if (!hasAny) {
    return { ...emptySelfData, source: 'empty' };
  }

  const metrics = {
    ...emptySelfData.metrics,
    sleep: sleep != null
      ? { ...emptySelfData.metrics.sleep, value: sleep, status: sleep >= 75 ? 'Restorative' : 'Fair' }
      : emptySelfData.metrics.sleep,
    readiness: readiness != null
      ? { ...emptySelfData.metrics.readiness, value: readiness, status: readiness >= 80 ? 'Good to go' : 'Ready' }
      : emptySelfData.metrics.readiness,
    activity: activity != null
      ? { ...emptySelfData.metrics.activity, value: activity, status: activity >= 70 ? 'On track' : 'Building' }
      : emptySelfData.metrics.activity,
    calories: totalCalories != null || activeCalories != null
      ? {
          ...emptySelfData.metrics.calories,
          intake: totalCalories ?? '—',
          burned: activeCalories ?? '—',
          status:
            totalCalories != null && activeCalories != null
              ? `${totalCalories - activeCalories >= 0 ? '+' : ''}${totalCalories - activeCalories} net`
              : NO_DATA,
        }
      : emptySelfData.metrics.calories,
    heartRate: buildHeartRateMetric({
      resting: restingHr,
      avg: avgHr,
      min: minHr,
      max: maxHr,
      samples: [],
    }),
  };

  applyWeightMetric(metrics, healthMetrics);

  const sources = new Set(healthMetrics.map((m) => m.source));
  let source = 'health';
  if (sources.has('oura') && sources.has('qn_scale')) source = 'merged';
  else if (sources.has('oura')) source = connected && !ouraRow ? 'oura-empty' : 'oura';
  else if (sources.has('qn_scale')) source = 'qn_scale';

  const latestRecordedAt = healthMetrics.reduce((latest, metric) => {
    const time = metric.recordedAt ? new Date(metric.recordedAt).getTime() : 0;
    return time > latest ? time : latest;
  }, 0);

  return {
    systemStatus: emptySelfData.systemStatus,
    metrics,
    timeline: buildTimelineFromReference(
      latestRecordedAt ? new Date(latestRecordedAt).toISOString() : null,
    ),
    source,
    updatedAt: latestRecordedAt ? new Date(latestRecordedAt).toISOString() : null,
  };
}

export function buildSelfViewDataFromHealth({ healthMetrics, ouraRow, connected }) {
  return healthMetricsToSelfData({ healthMetrics, ouraRow, connected });
}
