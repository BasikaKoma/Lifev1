export function formatWeightReadingTime(recordedAt) {
  if (!recordedAt) return '';
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}

export function normalizeWeightReadings(metric) {
  if (!metric || metric.value == null) return [];
  const fromPayload = Array.isArray(metric.payload?.readings) ? metric.payload.readings : [];
  if (fromPayload.length) {
    return fromPayload
      .filter((row) => row?.value != null)
      .map((row) => ({
        value: Number(row.value),
        recordedAt: row.recordedAt ?? metric.recordedAt ?? `${metric.day}T12:00:00`,
        impedance: row.impedance ?? null,
      }));
  }
  return [{
    value: Number(metric.value),
    recordedAt: metric.recordedAt ?? `${metric.day}T12:00:00`,
    impedance: metric.payload?.impedance ?? null,
  }];
}

export function expandWeightReadings(metrics = []) {
  const rows = metrics
    .filter((metric) => metric.metricType === 'weight' && metric.value != null)
    .flatMap((metric) =>
      normalizeWeightReadings(metric).map((reading) => ({
        ...reading,
        day: metric.day,
        source: metric.source,
      })),
    );

  return rows.sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
}

export function getWeightReadingsForDay(metrics = [], day) {
  return expandWeightReadings(metrics).filter((reading) => reading.day === day);
}

export function getLatestWeightReading(metrics = []) {
  const readings = expandWeightReadings(metrics);
  return readings.length ? readings[readings.length - 1] : null;
}

export function getPreviousWeightReading(metrics = [], beforeRecordedAt = null) {
  const readings = expandWeightReadings(metrics);
  if (!readings.length) return null;
  if (!beforeRecordedAt) return readings.length > 1 ? readings[readings.length - 2] : null;
  const index = readings.findIndex((reading) => reading.recordedAt === beforeRecordedAt);
  if (index > 0) return readings[index - 1];
  return readings.length > 1 ? readings[readings.length - 2] : null;
}

export function shouldAppendWeightReading(readings, weightKg, recordedAt, minGapMs = 30000) {
  const last = readings[readings.length - 1];
  if (!last) return true;
  if (last.value !== weightKg) return true;
  const gap = new Date(recordedAt).getTime() - new Date(last.recordedAt).getTime();
  return gap >= minGapMs;
}

export function buildWeightLineChart(readings = []) {
  if (readings.length < 2) return null;
  return {
    type: 'weightLine',
    points: readings.map((reading) => ({
      value: reading.value,
      label: formatWeightReadingTime(reading.recordedAt),
    })),
  };
}

export function buildWeightCardFromReadings(readings = [], { delta = null } = {}) {
  if (!readings.length) return null;
  const latest = readings[readings.length - 1];
  const kg = Math.round(latest.value * 100) / 100;

  return {
    id: 'weight',
    label: 'Weight',
    kg,
    unit: 'kg',
    delta,
    status:
      delta == null || Math.abs(delta) < 0.15
        ? readings.length > 1
          ? `${readings.length} μετρήσεις`
          : 'Stable'
        : delta > 0
          ? 'Up vs yesterday'
          : 'Down vs yesterday',
    icon: 'weight',
    readings,
    chart: buildWeightLineChart(readings),
  };
}
