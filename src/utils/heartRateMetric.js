import { emptySelfData, NO_DATA } from '../data/emptySelfData';

function finiteBpm(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatTimeLabel(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function parseOuraPayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function normalizeSamples(rawSamples) {
  if (!Array.isArray(rawSamples)) return [];
  return rawSamples
    .map((sample) => ({
      timestamp: sample?.timestamp ?? sample?.t ?? null,
      bpm: typeof sample?.bpm === 'number' ? sample.bpm : sample?.b,
      source: sample?.source ?? null,
    }))
    .filter((sample) => sample.timestamp && Number.isFinite(sample.bpm));
}

function downsampleSamples(samples, maxPoints = 96) {
  if (samples.length <= maxPoints) return samples;
  const step = samples.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) =>
    samples[Math.min(Math.floor(index * step), samples.length - 1)],
  );
}

function itemsToHeartRateSamples({ items, timestamp, interval = 300, source = 'sleep' }) {
  if (!Array.isArray(items) || !timestamp) return [];

  const startMs = new Date(timestamp).getTime();
  if (Number.isNaN(startMs)) return [];

  const stepMs = interval * 1000;
  const samples = [];

  items.forEach((bpm, index) => {
    if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return;
    samples.push({
      timestamp: new Date(startMs + index * stepMs).toISOString(),
      bpm,
      source,
    });
  });

  return samples;
}

function mergeHeartRateSamples(...sampleGroups) {
  const byTimestamp = new Map();
  for (const group of sampleGroups) {
    for (const sample of normalizeSamples(group)) {
      byTimestamp.set(sample.timestamp, sample);
    }
  }
  return [...byTimestamp.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function summarizeSamples(samples) {
  if (!samples.length) return null;
  const bpms = samples.map((sample) => sample.bpm).filter((bpm) => Number.isFinite(bpm));
  if (!bpms.length) return null;

  const sleepSamples = samples.filter(
    (sample) => sample.source === 'sleep' && Number.isFinite(sample.bpm),
  );
  const restingPool = sleepSamples.length ? sleepSamples : samples.filter((s) => Number.isFinite(s.bpm));

  return {
    resting: Math.round(restingPool.reduce((sum, sample) => sum + sample.bpm, 0) / restingPool.length),
    avg: Math.round(bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length),
    min: Math.min(...bpms),
    max: Math.max(...bpms),
    samples,
  };
}

function extractHeartRateFromSleepSessions(payload) {
  const sessions = payload?.sleep_sessions;
  if (!Array.isArray(sessions)) return null;

  const samples = sessions.flatMap((session) =>
    itemsToHeartRateSamples({
      items: session?.heart_rate?.items,
      timestamp: session?.heart_rate?.timestamp ?? session?.bedtime_start,
      interval: session?.heart_rate?.interval ?? 300,
      source: 'sleep',
    }),
  );

  return summarizeSamples(samples);
}

/** Build chart from Oura 5-min heart rate samples (actual daily progression). */
export function buildHeartRateChartFromSamples(samples) {
  const sorted = normalizeSamples(samples).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  if (!sorted.length) return null;

  const reduced = downsampleSamples(sorted);
  const bpms = reduced.map((sample) => sample.bpm);

  return {
    type: 'heartRateTrend',
    points: bpms,
    samples: reduced.map((sample) => ({
      timestamp: sample.timestamp,
      bpm: sample.bpm,
    })),
    startLabel: formatTimeLabel(reduced[0].timestamp),
    endLabel: formatTimeLabel(reduced[reduced.length - 1].timestamp),
    minBpm: Math.min(...bpms),
    maxBpm: Math.max(...bpms),
    sampleCount: sorted.length,
  };
}

function heartRateStatus({ resting, avg, min, max, sampleCount }) {
  const parts = [];
  const safeResting = finiteBpm(resting);
  const safeAvg = finiteBpm(avg);
  const safeMin = finiteBpm(min);
  const safeMax = finiteBpm(max);

  if (safeResting != null) parts.push(`Resting ${safeResting}`);
  if (safeAvg != null) parts.push(`Avg ${safeAvg}`);
  if (parts.length) {
    return sampleCount ? `${parts.join(' · ')} · ${sampleCount} samples` : parts.join(' · ');
  }
  if (safeMin != null && safeMax != null) return `${safeMin}–${safeMax} bpm`;
  return NO_DATA;
}

export function buildHeartRateMetric({
  resting = null,
  avg = null,
  min = null,
  max = null,
  samples = [],
} = {}) {
  const base = emptySelfData.metrics.heartRate;
  const safeResting = finiteBpm(resting);
  const safeAvg = finiteBpm(avg);
  const safeMin = finiteBpm(min);
  const safeMax = finiteBpm(max);
  const normalizedSamples = normalizeSamples(samples);
  const trendChart = buildHeartRateChartFromSamples(normalizedSamples);

  if (safeResting == null && safeAvg == null && safeMin == null && safeMax == null && !trendChart) {
    return {
      ...base,
      value: '—',
      status: NO_DATA,
      chart: { type: 'empty' },
    };
  }

  const display =
    safeResting
    ?? safeAvg
    ?? (safeMin != null && safeMax != null ? Math.round((safeMin + safeMax) / 2) : null)
    ?? '—';
  const chart = trendChart ?? { type: 'empty' };

  return {
    ...base,
    value: display,
    resting: safeResting,
    avg: safeAvg,
    min: safeMin ?? finiteBpm(chart.minBpm),
    max: safeMax ?? finiteBpm(chart.maxBpm),
    status: heartRateStatus({
      resting: safeResting,
      avg: safeAvg,
      min: safeMin ?? finiteBpm(chart.minBpm),
      max: safeMax ?? finiteBpm(chart.maxBpm),
      sampleCount: chart.sampleCount ?? 0,
    }),
    chart,
  };
}

export function extractHeartRateFromOuraRow(row) {
  const payload = parseOuraPayload(row?.payload);
  const heartRate = payload.heart_rate ?? {};
  const apiSamples = payload.heart_rate_samples ?? heartRate.samples ?? [];
  const sleepSessionHr = extractHeartRateFromSleepSessions(payload);
  const samples = mergeHeartRateSamples(apiSamples, sleepSessionHr?.samples ?? []);
  const summary = summarizeSamples(samples);

  return {
    resting:
      finiteBpm(row?.resting_heart_rate)
      ?? finiteBpm(heartRate.resting_bpm)
      ?? finiteBpm(sleepSessionHr?.resting)
      ?? finiteBpm(summary?.resting),
    avg:
      finiteBpm(row?.avg_heart_rate)
      ?? finiteBpm(heartRate.avg_bpm)
      ?? finiteBpm(sleepSessionHr?.avg)
      ?? finiteBpm(summary?.avg),
    min: finiteBpm(heartRate.min_bpm) ?? finiteBpm(sleepSessionHr?.min) ?? finiteBpm(summary?.min),
    max: finiteBpm(heartRate.max_bpm) ?? finiteBpm(sleepSessionHr?.max) ?? finiteBpm(summary?.max),
    samples,
  };
}
