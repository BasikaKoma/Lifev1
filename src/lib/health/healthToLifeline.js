import { selfDataToDayLabMetrics, ouraRowToLifelineMetrics } from '../../utils/lifelineSelfMetrics';
import { healthMetricsToSelfData } from './healthToSelf';
import { mapOuraRowToSelfData } from '../../utils/ouraMetrics';
import {
  buildWeightCardFromReadings,
  getWeightReadingsForDay,
} from './weightReadings';
import {
  buildWaistCardFromReadings,
  getWaistReadingsForDay,
} from './waistReadings';

function buildWeightCard(kg, delta = null, readings = []) {
  const card = buildWeightCardFromReadings(readings.length ? readings : [{ value: kg, recordedAt: new Date().toISOString() }], { delta });
  if (card) return card;
  return {
    id: 'weight',
    label: 'Weight',
    kg,
    unit: 'kg',
    delta,
    status:
      delta == null || Math.abs(delta) < 0.15
        ? 'Stable'
        : delta > 0
          ? 'Up vs yesterday'
          : 'Down vs yesterday',
    icon: 'weight',
  };
}

function latestWeightValue(dayMetrics, day) {
  const readings = getWeightReadingsForDay(dayMetrics, day);
  if (readings.length) return readings[readings.length - 1].value;
  return dayMetrics.find((metric) => metric.metricType === 'weight')?.value ?? null;
}

function weightDeltaForDay(dayMetrics, previousDayMetrics, day) {
  const weight = latestWeightValue(dayMetrics, day);
  const prevDay = previousDayMetrics?.[0]?.day;
  const prevWeight = latestWeightValue(previousDayMetrics ?? [], prevDay);
  if (weight == null || prevWeight == null) return null;
  return Math.round((weight - prevWeight) * 10) / 10;
}

function latestWaistValue(dayMetrics, day) {
  const readings = getWaistReadingsForDay(dayMetrics, day);
  if (readings.length) return readings[readings.length - 1].value;
  return dayMetrics.find((metric) => metric.metricType === 'waist')?.value ?? null;
}

function waistDeltaForDay(dayMetrics, previousDayMetrics, day) {
  const waist = latestWaistValue(dayMetrics, day);
  const prevDay = previousDayMetrics?.[0]?.day;
  const prevWaist = latestWaistValue(previousDayMetrics ?? [], prevDay);
  if (waist == null || prevWaist == null) return null;
  return Math.round((waist - prevWaist) * 10) / 10;
}

function attachWaistCard(patch, dayMetrics, day, delta = null) {
  const readings = getWaistReadingsForDay(dayMetrics, day);
  if (!readings.length) return patch;
  const card = buildWaistCardFromReadings(readings, { delta });
  if (!card) return patch;
  return { ...patch, waist: card, preview: false };
}

function metricsByDay(healthMetrics) {
  const byDay = {};
  for (const m of healthMetrics) {
    if (!byDay[m.day]) byDay[m.day] = [];
    byDay[m.day].push(m);
  }
  return byDay;
}

export function healthMetricsToLifelinePatch(day, dayMetrics, { delta = null, syncedAt } = {}) {
  const ouraSleep = dayMetrics.find((m) => m.metricType === 'sleep' && m.source === 'oura');
  const ouraReadiness = dayMetrics.find((m) => m.metricType === 'readiness' && m.source === 'oura');
  const ouraActivity = dayMetrics.find((m) => m.metricType === 'activity' && m.source === 'oura');
  const ouraCalories = dayMetrics.find((m) => m.metricType === 'active_calories' && m.source === 'oura');
  const weight = dayMetrics.find((m) => m.metricType === 'weight');
  const waist = dayMetrics.find((m) => m.metricType === 'waist');

  const avgHr = dayMetrics.find((m) => m.metricType === 'avg_heart_rate' && m.source === 'oura')?.value ?? null;
  const restingHr = dayMetrics.find((m) => m.metricType === 'resting_heart_rate' && m.source === 'oura')?.value ?? null;
  const minHr = dayMetrics.find((m) => m.metricType === 'heart_rate_min' && m.source === 'oura')?.value ?? null;
  const maxHr = dayMetrics.find((m) => m.metricType === 'heart_rate_max' && m.source === 'oura')?.value ?? null;

  const ouraRow = ouraSleep || ouraReadiness || ouraActivity
    ? {
        day,
        sleep_score: ouraSleep?.value ?? null,
        readiness_score: ouraReadiness?.value ?? null,
        activity_score: ouraActivity?.value ?? null,
        active_calories: ouraCalories?.value ?? null,
        total_calories: dayMetrics.find((m) => m.metricType === 'total_calories')?.value ?? null,
        avg_heart_rate: avgHr,
        resting_heart_rate: restingHr,
        payload: {
          heart_rate: {
            avg_bpm: avgHr,
            resting_bpm: restingHr,
            min_bpm: minHr,
            max_bpm: maxHr,
          },
        },
        synced_at: syncedAt,
      }
    : null;

  let baseMetrics = null;
  if (ouraRow) {
    baseMetrics = selfDataToDayLabMetrics(
      { ...mapOuraRowToSelfData(ouraRow), day, source: 'oura' },
      { syncedAt },
    );
  } else if (dayMetrics.length > 0) {
    const selfData = healthMetricsToSelfData({ healthMetrics: dayMetrics });
    baseMetrics = selfDataToDayLabMetrics(
      { ...selfData, day, source: selfData.source },
      { syncedAt },
    );
  }

  if (!baseMetrics && !weight && !waist) return null;

  const sources = new Set(dayMetrics.map((m) => m.source));
  const source = sources.size > 1 ? 'merged' : sources.values().next().value ?? 'health';

  const patch = baseMetrics ?? {
    source,
    syncedAt: syncedAt ?? new Date().toISOString(),
    day,
    preview: false,
    systemStatus: { label: '—', sublabel: 'Day metrics' },
    leftMetrics: [],
    rightMetrics: [],
    dayScore: null,
  };

  if (weight?.value != null) {
    const readings = getWeightReadingsForDay(dayMetrics, day);
    patch.weight = buildWeightCard(weight.value, delta, readings);
    patch.source = source;
    patch.preview = false;
  }

  return attachWaistCard(patch, dayMetrics, day, null);
}

export function buildLifelineMetricsPatchesFromHealth(healthMetrics, ouraRows = []) {
  const byDay = metricsByDay(healthMetrics);
  const ouraByDay = new Map(
    ouraRows.filter((row) => row?.day).map((row) => [row.day, row]),
  );
  const allDays = new Set([
    ...Object.keys(byDay),
    ...ouraRows.map((row) => row.day).filter(Boolean),
  ]);
  const sortedDays = [...allDays].sort();
  const patches = {};

  for (const day of sortedDays) {
    const dayMetrics = byDay[day] ?? [];
    const ouraRow = ouraByDay.get(day);
    const dayIndex = sortedDays.indexOf(day);
    const prevDay = dayIndex > 0 ? sortedDays[dayIndex - 1] : null;
    const delta = prevDay ? weightDeltaForDay(dayMetrics, byDay[prevDay], day) : null;
    const waistDelta = prevDay ? waistDeltaForDay(dayMetrics, byDay[prevDay], day) : null;

    let metrics = ouraRow
      ? ouraRowToLifelineMetrics(ouraRow)
      : healthMetricsToLifelinePatch(day, dayMetrics, {
          delta,
          syncedAt: dayMetrics[0]?.recordedAt ?? new Date().toISOString(),
        });

    if (!metrics) continue;

    const weight = dayMetrics.find((m) => m.metricType === 'weight');
    if (weight?.value != null) {
      const readings = getWeightReadingsForDay(dayMetrics, day);
      metrics = {
        ...metrics,
        weight: buildWeightCard(weight.value, delta, readings),
        source: metrics.source === 'oura' ? 'merged' : metrics.source ?? 'qn_scale',
        preview: false,
      };
    }

    metrics = attachWaistCard(metrics, dayMetrics, day, waistDelta);
    patches[day] = { metrics };
  }

  return patches;
}

export function mergeWeightIntoDayMetrics(existingMetrics, weightKg, delta = null, readingMeta = {}) {
  if (weightKg == null) return existingMetrics;

  const recordedAt = readingMeta.recordedAt ?? new Date().toISOString();
  const existingReadings = existingMetrics?.weight?.readings ?? [];
  const readings = [...existingReadings];
  const last = readings[readings.length - 1];
  if (!last || last.value !== weightKg || new Date(recordedAt) - new Date(last.recordedAt) > 30000) {
    readings.push({ value: weightKg, recordedAt });
  }

  const weight = buildWeightCard(weightKg, delta, readings);
  if (!existingMetrics) {
    return {
      source: 'qn_scale',
      preview: false,
      syncedAt: recordedAt,
      weight,
      leftMetrics: [],
      rightMetrics: [],
    };
  }
  return {
    ...existingMetrics,
    preview: false,
    syncedAt: recordedAt,
    weight,
    source: existingMetrics.source === 'oura' ? 'merged' : 'qn_scale',
  };
}
