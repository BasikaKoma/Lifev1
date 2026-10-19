/**
 * Day-by-day history for every metric the Self hub shows. Each spec says where the metric's
 * daily value comes from (an Oura day row or health_metrics readings), how to format it,
 * which direction is better, and which extra details describe a single day.
 */
import { parseOuraPayload } from '../../utils/heartRateMetric';
import { CIRCUMFERENCE_SPECS, expandCircumferenceReadings } from './circumferenceReadings';
import { expandWeightReadings } from './weightReadings';

export const METRIC_HISTORY_DAYS = 90;

const NUMBER = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function groupNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

/** 135 → "2ώ 15λ" */
export function formatDurationMinutes(minutes) {
  const total = Math.round(Math.abs(minutes));
  if (total < 60) return `${total}λ`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}ώ ${rest}λ` : `${hours}ώ`;
}

function clockTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function secondsToMinutes(...values) {
  for (const value of values) {
    const seconds = NUMBER(value);
    if (seconds != null) return seconds / 60;
  }
  return null;
}

/** The night's sleep: the longest session that is not a nap or rest period. */
export function mainSleepSession(payload) {
  const sessions = Array.isArray(payload?.sleep_sessions) ? payload.sleep_sessions : [];
  const nights = sessions.filter((session) => {
    const type = String(session?.type || '').toLowerCase();
    return type !== 'rest' && !type.includes('nap');
  });
  const pool = nights.length ? nights : sessions;
  return pool.reduce((best, session) => {
    const duration = Number(session?.total_sleep_duration) || 0;
    return !best || duration > (Number(best?.total_sleep_duration) || 0) ? session : best;
  }, null);
}

/** Night HRV in ms, the same figure the hub card shows. */
export function ouraHrvMs(payload) {
  return NUMBER(mainSleepSession(payload)?.average_hrv)
    ?? NUMBER(payload?.sleep_sessions?.[0]?.average_hrv)
    ?? NUMBER(payload?.readiness?.contributors?.average_hrv);
}

/**
 * Oura rows fetched with a column list come back with `payload_<key>` aliases for the
 * payload parts they asked for; fold them back into `payload` so extractors read one shape.
 */
export function normalizeOuraRow(row) {
  if (!row) return row;
  const payload = { ...parseOuraPayload(row.payload) };
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('payload_')) payload[key.slice('payload_'.length)] = value;
    else out[key] = value;
  }
  out.payload = payload;
  return out;
}

function extra(label, value) {
  return value == null || value === '' ? null : { label, value };
}

const STRESS_SUMMARY = {
  stressful: 'Αγχωτική',
  normal: 'Κανονική',
  restored: 'Ξεκούραστη',
};

const ouraDays = (read) => ({ ouraRows = [] }) => ouraRows
  .map(normalizeOuraRow)
  .filter((row) => row?.day)
  .map((row) => {
    const fields = read(row, row.payload);
    if (!fields || NUMBER(fields.value) == null) return null;
    return {
      day: row.day,
      value: fields.value,
      recordedAt: row.synced_at ?? null,
      secondary: fields.secondary ?? null,
      extras: (fields.extras || []).filter(Boolean),
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.day.localeCompare(b.day));

function circumferenceSpec(kind) {
  const spec = CIRCUMFERENCE_SPECS[kind];
  return {
    key: kind,
    label: spec.label,
    source: 'health',
    sourceLabel: 'Χειροκίνητη καταγραφή',
    timeLabel: 'Καταγραφή στις',
    healthTypes: [spec.id],
    unit: 'cm',
    digits: 1,
    better: 'lower',
    canLog: true,
    days: ({ healthMetrics = [] }) => expandCircumferenceReadings(kind, healthMetrics).map((reading) => ({
      day: reading.day,
      value: reading.value,
      recordedAt: reading.recordedAt,
      secondary: null,
      extras: [],
    })),
  };
}

/** Display order of the switcher chips in the detail dialog. */
export const METRIC_HISTORY_KEYS = [
  'sleep',
  'heartRate',
  'hrv',
  'stress',
  'movement',
  'calories',
  'weight',
  'waist',
  'thigh',
  'arm',
];

export const METRIC_HISTORY_SPECS = {
  sleep: {
    key: 'sleep',
    label: 'Ύπνος',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['sleep_score', 'payload_sleep:payload->sleep', 'payload_sleep_sessions:payload->sleep_sessions'],
    unit: '/100',
    deltaUnit: '',
    digits: 0,
    better: 'higher',
    days: ouraDays((row, payload) => {
      const session = mainSleepSession(payload);
      const asleep = secondsToMinutes(session?.total_sleep_duration);
      const start = clockTime(session?.bedtime_start);
      const end = clockTime(session?.bedtime_end);
      return {
        value: NUMBER(row.sleep_score) ?? NUMBER(payload.sleep?.score),
        secondary: asleep != null ? formatDurationMinutes(asleep) : null,
        extras: [
          extra('Διάρκεια ύπνου', asleep != null ? formatDurationMinutes(asleep) : null),
          extra('Στο κρεβάτι', start && end ? `${start}–${end}` : null),
          extra('Αποδοτικότητα', NUMBER(session?.efficiency) != null ? `${session.efficiency}%` : null),
          extra('Βαθύς ύπνος', NUMBER(session?.deep_sleep_duration) != null ? formatDurationMinutes(session.deep_sleep_duration / 60) : null),
          extra('REM', NUMBER(session?.rem_sleep_duration) != null ? formatDurationMinutes(session.rem_sleep_duration / 60) : null),
          extra('Καθυστέρηση ύπνου', NUMBER(session?.latency) != null ? formatDurationMinutes(session.latency / 60) : null),
        ],
      };
    }),
  },

  heartRate: {
    key: 'heartRate',
    label: 'Παλμοί ηρεμίας',
    chipLabel: 'Παλμοί',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['resting_heart_rate', 'avg_heart_rate', 'payload_heart_rate:payload->heart_rate'],
    unit: 'bpm',
    digits: 0,
    better: 'lower',
    days: ouraDays((row, payload) => {
      const hr = payload.heart_rate ?? {};
      const resting = NUMBER(row.resting_heart_rate) ?? NUMBER(hr.resting_bpm);
      const avg = NUMBER(row.avg_heart_rate) ?? NUMBER(hr.avg_bpm);
      const min = NUMBER(hr.min_bpm);
      const max = NUMBER(hr.max_bpm);
      return {
        value: resting ?? avg,
        secondary: avg != null ? `μ.ό. ${Math.round(avg)}` : null,
        extras: [
          extra('Ηρεμίας', resting != null ? `${Math.round(resting)} bpm` : null),
          extra('Μέσοι ημέρας', avg != null ? `${Math.round(avg)} bpm` : null),
          extra('Ελάχιστοι', min != null ? `${Math.round(min)} bpm` : null),
          extra('Μέγιστοι', max != null ? `${Math.round(max)} bpm` : null),
          extra('Δείγματα', NUMBER(hr.sample_count) != null ? groupNumber(hr.sample_count) : null),
        ],
      };
    }),
  },

  hrv: {
    key: 'hrv',
    label: 'HRV',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['payload_sleep_sessions:payload->sleep_sessions', 'payload_readiness:payload->readiness'],
    unit: 'ms',
    digits: 0,
    better: 'higher',
    days: ouraDays((row, payload) => {
      const session = mainSleepSession(payload);
      const balance = NUMBER(payload.readiness?.contributors?.hrv_balance);
      return {
        value: ouraHrvMs(payload),
        secondary: balance != null ? `ισορρ. ${balance}` : null,
        extras: [
          extra('Ισορροπία HRV', balance != null ? `${balance}/100` : null),
          extra('Χαμηλότεροι παλμοί ύπνου', NUMBER(session?.lowest_heart_rate) != null ? `${session.lowest_heart_rate} bpm` : null),
          extra('Μέσοι παλμοί ύπνου', NUMBER(session?.average_heart_rate) != null ? `${Math.round(session.average_heart_rate)} bpm` : null),
          extra('Ετοιμότητα', NUMBER(payload.readiness?.score) != null ? `${payload.readiness.score}/100` : null),
        ],
      };
    }),
  },

  stress: {
    key: 'stress',
    label: 'Στρες',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['stress_high_seconds', 'recovery_high_seconds', 'payload_stress:payload->stress'],
    unit: '',
    digits: 0,
    format: formatDurationMinutes,
    better: 'lower',
    days: ouraDays((row, payload) => {
      const stress = secondsToMinutes(row.stress_high_seconds, payload.stress?.stress_high);
      const recovery = secondsToMinutes(row.recovery_high_seconds, payload.stress?.recovery_high);
      const summary = STRESS_SUMMARY[payload.stress?.day_summary] ?? null;
      return {
        value: stress,
        secondary: recovery != null ? `ανάκ. ${formatDurationMinutes(recovery)}` : null,
        extras: [
          extra('Υψηλό στρες', stress != null ? formatDurationMinutes(stress) : null),
          extra('Ανάκαμψη', recovery != null ? formatDurationMinutes(recovery) : null),
          extra('Ημέρα', summary),
        ],
      };
    }),
  },

  movement: {
    key: 'movement',
    label: 'Κίνηση',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['steps', 'activity_score', 'active_calories'],
    unit: 'βήματα',
    digits: 0,
    format: groupNumber,
    better: 'higher',
    days: ouraDays((row) => ({
      value: NUMBER(row.steps),
      secondary: NUMBER(row.activity_score) != null ? `σκορ ${row.activity_score}` : null,
      extras: [
        extra('Βήματα', NUMBER(row.steps) != null ? groupNumber(row.steps) : null),
        extra('Σκορ δραστηριότητας', NUMBER(row.activity_score) != null ? `${row.activity_score}/100` : null),
        extra('Ενεργές θερμίδες', NUMBER(row.active_calories) != null ? `${groupNumber(row.active_calories)} kcal` : null),
      ],
    })),
  },

  calories: {
    key: 'calories',
    label: 'Θερμίδες',
    source: 'oura',
    sourceLabel: 'Oura',
    timeLabel: 'Συγχρονισμός',
    ouraColumns: ['total_calories', 'active_calories', 'target_calories'],
    unit: 'kcal',
    digits: 0,
    format: groupNumber,
    better: null,
    days: ouraDays((row) => ({
      value: NUMBER(row.total_calories),
      secondary: NUMBER(row.active_calories) != null ? `ενεργ. ${groupNumber(row.active_calories)}` : null,
      extras: [
        extra('Συνολικές', NUMBER(row.total_calories) != null ? `${groupNumber(row.total_calories)} kcal` : null),
        extra('Ενεργές', NUMBER(row.active_calories) != null ? `${groupNumber(row.active_calories)} kcal` : null),
        extra('Στόχος ενεργών', NUMBER(row.target_calories) != null ? `${groupNumber(row.target_calories)} kcal` : null),
      ],
    })),
  },

  weight: {
    key: 'weight',
    label: 'Βάρος',
    source: 'health',
    sourceLabel: 'Ζυγαριά',
    timeLabel: 'Ζύγιση στις',
    healthTypes: ['weight'],
    unit: 'kg',
    digits: 1,
    better: 'lower',
    days: ({ healthMetrics = [] }) => {
      const byDay = new Map();
      for (const reading of expandWeightReadings(healthMetrics)) {
        const list = byDay.get(reading.day) || [];
        list.push(reading);
        byDay.set(reading.day, list);
      }
      return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, readings]) => {
          // The hub shows the latest weigh-in; the day's range sits in the details.
          const last = readings[readings.length - 1];
          const values = readings.map((reading) => reading.value);
          const low = Math.min(...values);
          const high = Math.max(...values);
          const count = readings.length;
          return {
            day,
            value: last.value,
            recordedAt: last.recordedAt,
            secondary: count > 1 ? `${count} ζυγίσεις` : null,
            // A single weigh-in has nothing more to break down.
            extras: count > 1
              ? [
                extra('Ζυγίσεις', String(count)),
                extra('Εύρος ημέρας', `${low.toFixed(1)}–${high.toFixed(1)} kg`),
                extra('Πρώτη ζύγιση', `${readings[0].value.toFixed(1)} kg · ${clockTime(readings[0].recordedAt) ?? ''}`.trim()),
              ]
              : [],
          };
        });
    },
  },

  waist: circumferenceSpec('waist'),
  thigh: circumferenceSpec('thigh'),
  arm: circumferenceSpec('arm'),
};

export function metricHistorySpec(key) {
  return METRIC_HISTORY_SPECS[key] || null;
}

/** "94.5", "8,234", "2ώ 15λ" */
export function formatMetricValue(spec, value) {
  if (value == null) return '—';
  if (spec.format) return spec.format(value);
  return Number(value).toFixed(spec.digits ?? 0);
}

function isFlat(spec, delta) {
  return Math.abs(delta) < 0.5 * 10 ** -(spec.digits ?? 0);
}

/** Signed change with a real minus sign; "0" when it rounds away. */
export function formatMetricDelta(spec, delta) {
  if (delta == null) return '—';
  if (isFlat(spec, delta)) return spec.format ? spec.format(0) : (0).toFixed(spec.digits ?? 0);
  return `${delta > 0 ? '+' : '−'}${formatMetricValue(spec, Math.abs(delta))}`;
}

/** 'good' | 'bad' | 'flat' | 'neutral', from the spec's better direction. */
export function metricDeltaTone(spec, delta) {
  if (delta == null || isFlat(spec, delta)) return 'flat';
  if (!spec.better) return 'neutral';
  const improved = spec.better === 'higher' ? delta > 0 : delta < 0;
  return improved ? 'good' : 'bad';
}

function round(spec, value) {
  const factor = 10 ** (spec.digits ?? 0);
  return Math.round(value * factor) / factor;
}

function daysBetween(fromDay, toDay) {
  const from = new Date(`${fromDay}T12:00:00`).getTime();
  const to = new Date(`${toDay}T12:00:00`).getTime();
  return Math.round((to - from) / 86400000);
}

/**
 * Everything the detail dialog shows for one metric: the entry for `today`, how it moved
 * against the previous day with data and against 7 / 30 days earlier, and the per-day
 * history (newest first). Changes are measured from today's entry, or the latest one when
 * today has none.
 */
export function summarizeMetricHistory(spec, days = [], today) {
  const entries = days.filter((entry) => entry.day <= today);
  const current = entries.find((entry) => entry.day === today) ?? null;
  const anchor = current ?? entries[entries.length - 1] ?? null;

  const history = entries
    .map((entry, index) => {
      const before = entries[index - 1];
      return {
        ...entry,
        delta: before ? round(spec, entry.value - before.value) : null,
        gapDays: before ? daysBetween(before.day, entry.day) : null,
      };
    })
    .reverse();

  const changeSince = (daysBack) => {
    if (!anchor) return null;
    // The entry closest to `daysBack` days before the anchor, without going past it.
    const base = [...entries]
      .reverse()
      .find((entry) => entry.day < anchor.day && daysBetween(entry.day, anchor.day) >= daysBack);
    return base ? { delta: round(spec, anchor.value - base.value), fromDay: base.day } : null;
  };

  const values = entries.map((entry) => entry.value);
  const latest = anchor ? history.find((entry) => entry.day === anchor.day) : null;

  return {
    current: current ? latest : null,
    latest,
    previous: latest?.delta != null ? history[history.indexOf(latest) + 1] : null,
    change7: changeSince(7),
    change30: changeSince(30),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    count: entries.length,
    history,
  };
}
