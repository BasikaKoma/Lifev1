function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function dayKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const MIN_NIGHT_MINUTES = 30;
const MAX_NIGHT_MINUTES = 20 * 60;

function sessionDurationMs(session) {
  const start = Date.parse(session?.bedtime_start);
  const end = Date.parse(session?.bedtime_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function pickMainSession(sessions) {
  const timed = (sessions || []).filter((session) => sessionDurationMs(session) > 0);
  const nights = timed.filter((session) => {
    const type = String(session?.type || '').toLowerCase();
    return type !== 'rest' && !type.includes('nap');
  });
  return nights.reduce((best, session) => (
    !best || sessionDurationMs(session) > sessionDurationMs(best) ? session : best
  ), null);
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/** Evening bedtimes stay on the same axis as after-midnight ones (01:00 is later than 23:40). */
function bedtimeAxis(date) {
  const minutes = minutesOfDay(date);
  return minutes < 12 * 60 ? minutes + 1440 : minutes;
}

function formatClock(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function span(values) {
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

function clockSummary(axisValues, format) {
  if (!axisValues.length) return null;
  const typical = median(axisValues);
  const earliest = Math.min(...axisValues);
  const latest = Math.max(...axisValues);
  return {
    typical: format(typical),
    earliest: format(earliest),
    latest: format(latest),
    driftMinutes: span(axisValues),
  };
}

function numericScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sleepNightFromOuraRow(row) {
  const date = dayKey(row?.day);
  if (!date) return null;
  const payload = parsePayload(row.payload);
  const session = pickMainSession(payload.sleep_sessions);
  if (!session) return null;
  const start = new Date(session.bedtime_start);
  const end = new Date(session.bedtime_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes < MIN_NIGHT_MINUTES || durationMinutes > MAX_NIGHT_MINUTES) return null;
  return {
    date,
    bedtime: formatClock(bedtimeAxis(start)),
    wake: formatClock(minutesOfDay(end)),
    bedtimeAxis: bedtimeAxis(start),
    wakeMinutes: minutesOfDay(end),
    durationMinutes,
    sleepScore: numericScore(row.sleep_score) ?? numericScore(payload.sleep?.score),
  };
}

export function buildSleepClock(recentDays = [], ouraRows = []) {
  const byDate = new Map((recentDays || []).filter((day) => day?.date).map((day) => [day.date, day]));
  const byNight = new Map();
  for (const row of ouraRows || []) {
    const night = sleepNightFromOuraRow(row);
    if (!night || (byDate.size && !byDate.has(night.date))) continue;
    const existing = byNight.get(night.date);
    if (!existing || night.durationMinutes > existing.durationMinutes) byNight.set(night.date, night);
  }

  const entries = [...byNight.values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((night) => {
      const day = byDate.get(night.date);
      return {
        date: night.date,
        bedtime: night.bedtime,
        wake: night.wake,
        durationMinutes: night.durationMinutes,
        sleepScore: night.sleepScore ?? numericScore(day?.sleep),
        wakeDayHadWork: Boolean(day?.hadWork),
        sourceId: day?.sourceIds?.[0] || `lifeline-day:${night.date}`,
      };
    });

  const durations = entries.map((night) => night.durationMinutes);
  return {
    count: entries.length,
    bedtime: clockSummary([...byNight.values()].map((night) => night.bedtimeAxis), formatClock),
    wake: clockSummary([...byNight.values()].map((night) => night.wakeMinutes), formatClock),
    duration: durations.length
      ? {
        typicalMinutes: median(durations),
        shortestMinutes: Math.min(...durations),
        longestMinutes: Math.max(...durations),
        driftMinutes: span(durations),
      }
      : null,
    entries,
  };
}
