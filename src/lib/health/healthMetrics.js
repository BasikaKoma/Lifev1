import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import {
  normalizeWeightReadings,
  shouldAppendWeightReading,
} from './weightReadings';

export function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isoDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rowToMetric(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    day: row.day,
    metricType: row.metric_type,
    value: row.value != null ? Number(row.value) : null,
    unit: row.unit,
    source: row.source,
    payload: row.payload ?? {},
    recordedAt: row.recorded_at,
  };
}

function metricIdentityKey(metric) {
  return `${metric.day}|${metric.metricType}|${metric.source}`;
}

function payloadEqual(left, right) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function metricValuesEqual(existing, incoming) {
  if (!existing) return true;
  const existingReadings = existing.payload?.readings ?? [];
  const incomingReadings = incoming.payload?.readings ?? [];
  if (existingReadings.length !== incomingReadings.length) return false;
  return (
    existing.value === incoming.value
    && (existing.unit ?? null) === (incoming.unit ?? null)
    && payloadEqual(existing.payload, incoming.payload)
  );
}

function filterChangedMetrics(existingMetrics, incomingMetrics) {
  const existingByKey = new Map(
    (existingMetrics ?? []).map((metric) => [metricIdentityKey(metric), metric]),
  );
  return incomingMetrics.filter((metric) => {
    const existing = existingByKey.get(metricIdentityKey(metric));
    return !existing || !metricValuesEqual(existing, metric);
  });
}

function toUpsertRow(userId, metric) {
  return {
    user_id: userId,
    day: metric.day,
    metric_type: metric.metricType,
    value: metric.value,
    unit: metric.unit ?? null,
    source: metric.source,
    payload: metric.payload ?? {},
    recorded_at: metric.recordedAt ?? new Date().toISOString(),
  };
}

export async function upsertMetric({
  day = todayIsoDate(),
  metricType,
  value,
  unit = null,
  source,
  payload = {},
}) {
  return upsertMetricsBatch([{
    day,
    metricType,
    value,
    unit,
    source,
    payload,
    recordedAt: new Date().toISOString(),
  }]).then((rows) => rows[0] ?? null);
}

export async function upsertMetricsBatch(metrics) {
  if (!metrics?.length || !isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const days = [...new Set(metrics.map((m) => m.day))].sort();
  const existing = await fetchMetricsRange({
    startDay: days[0],
    endDay: days[days.length - 1],
  });
  const changed = filterChangedMetrics(existing, metrics);
  if (!changed.length) return existing.filter((metric) =>
    metrics.some((incoming) => metricIdentityKey(incoming) === metricIdentityKey(metric)),
  );

  const rows = changed.map((metric) => toUpsertRow(user.id, metric));
  const { data: affectedCount, error: rpcError } = await supabase.rpc(
    'upsert_health_metrics_if_changed',
    { rows },
  );

  if (!rpcError) {
    if (!affectedCount) {
      return existing.filter((metric) =>
        metrics.some((incoming) => metricIdentityKey(incoming) === metricIdentityKey(metric)),
      );
    }
    const keys = new Set(changed.map((metric) => metricIdentityKey(metric)));
    const merged = [
      ...existing.filter((metric) => !keys.has(metricIdentityKey(metric))),
      ...changed.map((metric) => ({
        ...metric,
        userId: user.id,
        recordedAt: metric.recordedAt ?? new Date().toISOString(),
      })),
    ];
    return merged;
  }

  const { data, error } = await supabase
    .from('health_metrics')
    .upsert(rows, { onConflict: 'user_id,day,metric_type,source' })
    .select();

  if (error) throw error;
  return (data ?? []).map(rowToMetric);
}

export async function fetchMetricsRange({ startDay, endDay, metricTypes = null, sources = null }) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('health_metrics')
    .select('*')
    .gte('day', startDay)
    .lte('day', endDay)
    .order('day', { ascending: false });

  if (metricTypes?.length) {
    query = query.in('metric_type', metricTypes);
  }
  if (sources?.length) {
    query = query.in('source', sources);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToMetric);
}

export async function fetchLatestMetric(metricType, source = null) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  let query = supabase
    .from('health_metrics')
    .select('*')
    .eq('metric_type', metricType)
    .order('day', { ascending: false })
    .limit(1);

  if (source) query = query.eq('source', source);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowToMetric(data);
}

export async function fetchMetricsForDay(day) {
  return fetchMetricsRange({ startDay: day, endDay: day });
}

export function ouraRowToHealthMetrics(row) {
  if (!row?.day) return [];
  const metrics = [];
  const base = { day: row.day, source: 'oura' };

  if (row.sleep_score != null) {
    metrics.push({ ...base, metricType: 'sleep', value: row.sleep_score, unit: 'score' });
  }
  if (row.readiness_score != null) {
    metrics.push({ ...base, metricType: 'readiness', value: row.readiness_score, unit: 'score' });
  }
  if (row.activity_score != null) {
    metrics.push({ ...base, metricType: 'activity', value: row.activity_score, unit: 'score' });
  }
  if (row.active_calories != null) {
    metrics.push({ ...base, metricType: 'active_calories', value: row.active_calories, unit: 'kcal' });
  }
  if (row.total_calories != null) {
    metrics.push({ ...base, metricType: 'total_calories', value: row.total_calories, unit: 'kcal' });
  }
  if (row.steps != null) {
    metrics.push({ ...base, metricType: 'steps', value: row.steps, unit: 'count' });
  }
  if (row.avg_heart_rate != null) {
    metrics.push({ ...base, metricType: 'avg_heart_rate', value: row.avg_heart_rate, unit: 'bpm' });
  }
  if (row.resting_heart_rate != null) {
    metrics.push({ ...base, metricType: 'resting_heart_rate', value: row.resting_heart_rate, unit: 'bpm' });
  }
  const hrPayload = row.payload?.heart_rate;
  const hrSamples = row.payload?.heart_rate_samples ?? [];
  if (hrPayload?.min_bpm != null) {
    metrics.push({ ...base, metricType: 'heart_rate_min', value: hrPayload.min_bpm, unit: 'bpm', payload: hrPayload });
  }
  if (hrPayload?.max_bpm != null) {
    metrics.push({ ...base, metricType: 'heart_rate_max', value: hrPayload.max_bpm, unit: 'bpm', payload: hrPayload });
  }
  if (hrSamples.length > 0) {
    metrics.push({
      ...base,
      metricType: 'heart_rate_samples',
      value: hrSamples.length,
      unit: 'count',
      payload: { samples: hrSamples },
    });
  }

  return metrics;
}

export function notifyHealthMetricsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lifev1:health-metrics-changed'));
  }
}

export async function appendWeightReading({
  weightKg,
  impedance = null,
  deviceId = null,
  deviceName = null,
  stable = true,
  day = todayIsoDate(),
  recordedAt = new Date().toISOString(),
}) {
  if (!weightKg) return null;

  const existingRows = await fetchMetricsForDay(day);
  const existing = existingRows.find(
    (metric) => metric.metricType === 'weight' && metric.source === 'qn_scale',
  );

  const readings = normalizeWeightReadings(existing);
  if (!shouldAppendWeightReading(readings, weightKg, recordedAt)) {
    return existing;
  }

  readings.push({
    value: weightKg,
    recordedAt,
    impedance,
    deviceId,
    deviceName,
  });

  const metric = {
    day,
    metricType: 'weight',
    value: weightKg,
    unit: 'kg',
    source: 'qn_scale',
    recordedAt,
    payload: {
      readings,
      latestRecordedAt: recordedAt,
      deviceId,
      deviceName,
      stable,
      impedance,
    },
  };

  await upsertMetricsBatch([metric]);
  notifyHealthMetricsChanged();
  return metric;
}

export function scaleMeasurementToHealthMetrics(measurement) {
  if (!measurement?.weightKg) return [];
  const day = measurement.day ?? todayIsoDate();
  const metrics = [
    {
      day,
      metricType: 'weight',
      value: measurement.weightKg,
      unit: 'kg',
      source: measurement.source ?? 'qn_scale',
      payload: {
        stable: measurement.stable ?? true,
        impedance: measurement.impedance ?? null,
        deviceId: measurement.deviceId ?? null,
        deviceName: measurement.deviceName ?? null,
      },
    },
  ];

  if (measurement.impedance != null) {
    metrics.push({
      day,
      metricType: 'impedance',
      value: measurement.impedance,
      unit: 'ohm',
      source: measurement.source ?? 'qn_scale',
      payload: {},
    });
  }

  return metrics;
}
