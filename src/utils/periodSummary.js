import { addDays, parseDate, toDateString } from './lifeline';
import { buildSleepClock } from '../brain/snapshot/sleepClock';
import { computeTrackStatus } from '../lib/path/logic';
import { roleRank } from '../lib/path/schema';
import { collectCompletedItemsForDate, getDayEntry } from './lifelineDays';
import { getSelfHubDayEntry } from './selfHubDays';
import { summarizeCalls } from './callsDb';

const SLEEP_LOW = 70;
/** Oura reads 70+ as a good sleep / readiness score and under 60 as one to act on. */
const SCORE_GOOD = 70;
const SCORE_WARN = 60;
const NUMBER = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function eachDateInclusive(startDate, endDate) {
  const start = toDateString(startDate);
  const end = toDateString(endDate);
  if (!start || !end || start > end) return [];
  const dates = [];
  let cursor = start;
  while (cursor && cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function startOfWeekMonday(value = new Date()) {
  const date = typeof value === 'string' ? parseDate(value) : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return toDateString(new Date());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return toDateString(monday);
}

export function getPeriodRange(kind, date) {
  const day = toDateString(date);
  if (kind === 'month') {
    const parsed = parseDate(day);
    if (!parsed) return null;
    const startDate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-01`;
    const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
    return { kind: 'month', startDate, endDate: toDateString(end) };
  }
  const startDate = startOfWeekMonday(day);
  return { kind: 'week', startDate, endDate: addDays(startDate, 6) };
}

export function shiftPeriod(kind, startDate, delta) {
  const parsed = parseDate(startDate);
  if (!parsed) return getPeriodRange(kind, startDate);
  if (kind === 'month') {
    parsed.setMonth(parsed.getMonth() + Number(delta || 0));
    return getPeriodRange('month', toDateString(parsed));
  }
  return getPeriodRange('week', addDays(startDate, Number(delta || 0) * 7));
}

export function formatPeriodRangeLabel(kind, startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return '';
  if (kind === 'month') {
    return start.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('el-GR', { month: 'short', year: 'numeric' })}`;
  }
  const startText = start.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
  const endText = end.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startText} – ${endText}`;
}

export function formatPeriodAriaLabel(kind, startDate, endDate) {
  const label = formatPeriodRangeLabel(kind, startDate, endDate);
  return kind === 'month' ? `Σύνοψη μήνα ${label}` : `Σύνοψη εβδομάδας ${label}`;
}

function avg(values) {
  const nums = values.map(NUMBER).filter((value) => value != null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function round(value, digits = 0) {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function deltaOf(current, previous) {
  if (current == null || previous == null) return null;
  return current - previous;
}

function metricFromList(metrics, id) {
  const all = [...(metrics?.leftMetrics || []), ...(metrics?.rightMetrics || [])];
  const found = all.find((item) => item?.id === id);
  return NUMBER(found?.value);
}

function heartRateMetric(metrics) {
  return [...(metrics?.leftMetrics || [])].find((item) => item?.id === 'heartRate') || null;
}

function restingHrFromMetrics(metrics) {
  const hr = heartRateMetric(metrics);
  return NUMBER(hr?.resting) ?? NUMBER(hr?.value);
}

function avgHrFromMetrics(metrics) {
  return NUMBER(heartRateMetric(metrics)?.avg);
}

function ouraPayload(row) {
  if (!row?.payload) return {};
  if (typeof row.payload === 'string') {
    try {
      return JSON.parse(row.payload);
    } catch {
      return {};
    }
  }
  return row.payload;
}

function mainSleepSession(payload) {
  const sessions = Array.isArray(payload?.sleep_sessions) ? payload.sleep_sessions : [];
  const nights = sessions.filter((session) => {
    const type = String(session?.type || '').toLowerCase();
    return type !== 'rest' && !type.includes('nap');
  });
  const pool = nights.length ? nights : sessions;
  return pool.reduce((best, session) => {
    const duration = Number(session?.total_sleep_duration) || 0;
    const bestDuration = Number(best?.total_sleep_duration) || 0;
    return !best || duration > bestDuration ? session : best;
  }, null);
}

function weightFromMetrics(metrics) {
  return NUMBER(metrics?.weight?.kg);
}

function cmFromMetrics(metrics, kind) {
  return NUMBER(metrics?.[kind]?.cm);
}

function isoDay(value) {
  if (!value) return null;
  const asDate = toDateString(value);
  if (asDate) return asDate;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateString(parsed);
}

function inRange(iso, startDate, endDate) {
  const day = isoDay(iso);
  return Boolean(day && day >= startDate && day <= endDate);
}

function buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, bodyByDay) {
  const day = getDayEntry(lifelineDays, date);
  const hub = getSelfHubDayEntry(selfHubDays, date);
  const metrics = hub.health || day.metrics;
  const oura = ouraByDay?.[date] || null;
  const sleepSession = mainSleepSession(ouraPayload(oura));
  return {
    date,
    sleep: metricFromList(metrics, 'sleep') ?? NUMBER(oura?.sleep_score),
    readiness: metricFromList(metrics, 'readiness') ?? NUMBER(oura?.readiness_score),
    activity: metricFromList(metrics, 'activity') ?? NUMBER(oura?.activity_score),
    restingHr: NUMBER(oura?.resting_heart_rate) ?? restingHrFromMetrics(metrics),
    avgHr: NUMBER(oura?.avg_heart_rate) ?? NUMBER(sleepSession?.average_heart_rate) ?? avgHrFromMetrics(metrics),
    hrv: NUMBER(sleepSession?.average_hrv) ?? metricFromList(metrics, 'hrv'),
    weight: NUMBER(weightByDay?.[date]) ?? weightFromMetrics(metrics),
    waist: cmFromMetrics(metrics, 'waist') ?? NUMBER(bodyByDay?.waist?.[date]),
    thigh: cmFromMetrics(metrics, 'thigh') ?? NUMBER(bodyByDay?.thigh?.[date]),
    arm: cmFromMetrics(metrics, 'arm') ?? NUMBER(bodyByDay?.arm?.[date]),
    notes: String(day.notes || hub.journal?.notes || '').trim(),
    todos: Array.isArray(hub.journal?.todos) && hub.journal.todos.length
      ? hub.journal.todos
      : (day.todos || []),
    routines: (hub.journal?.routines && Object.keys(hub.journal.routines).length)
      ? hub.journal.routines
      : day.routines,
    todayThree: hub.hub?.todayThree || day.hubSnapshot?.todayThree || null,
  };
}

function seriesStats(days, key) {
  const values = days.map((day) => NUMBER(day[key])).filter((value) => value != null);
  return {
    avg: values.length ? avg(values) : null,
    first: values.length ? values[0] : null,
    last: values.length ? values[values.length - 1] : null,
    count: values.length,
  };
}

function pct(done, total) {
  if (!total) return null;
  return Math.round((done / total) * 100);
}

function durationHours(blocks) {
  const minutes = (blocks || []).reduce((sum, block) => sum + (Number(block.duration) || 0), 0);
  return minutes ? minutes / 60 : 0;
}

function formatHours(value) {
  if (value == null) return null;
  const rounded = round(value, 1);
  if (rounded == null) return null;
  return Number.isInteger(rounded) ? `${rounded}ω` : `${rounded}ω`;
}

function formatDelta(delta, { digits = 0, suffix = '', invert = false } = {}) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const rounded = round(delta, digits);
  if (rounded === 0) return { text: '0', tone: 'neutral' };
  const positive = invert ? rounded < 0 : rounded > 0;
  const sign = rounded > 0 ? '+' : '';
  return {
    text: `${sign}${digits ? rounded.toFixed(digits) : rounded}${suffix}`,
    tone: positive ? 'up' : 'down',
  };
}

function row(label, value, previous, { digits = 0, suffix = '', invert = false } = {}) {
  const current = value == null ? null : round(value, digits);
  if (current == null) return { label, value: '—', delta: null };
  const display = digits ? current.toFixed(digits) : String(current);
  return {
    label,
    value: `${display}${suffix}`,
    delta: formatDelta(deltaOf(current, previous == null ? null : round(previous, digits)), { digits, suffix, invert }),
  };
}

function emptyCard(id, title, eyebrow) {
  return {
    id,
    title,
    eyebrow,
    hasData: false,
    primary: null,
    primarySuffix: '',
    delta: null,
    status: null,
    meter: null,
    chart: null,
    rows: [],
    notes: [],
    verdict: null,
  };
}

/* ---------- Functional layer: status against a target, per-day axis ---------- */

function atLeast(value, good, warn) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}

const STATUS_RANK = { good: 0, warn: 1, bad: 2 };

function worst(...statuses) {
  return statuses
    .filter(Boolean)
    .reduce((acc, status) => (acc == null || STATUS_RANK[status] > STATUS_RANK[acc] ? status : acc), null);
}

function scoreTone(value) {
  return value == null ? 'empty' : atLeast(value, SCORE_GOOD, SCORE_WARN);
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

const WEEKDAY_LETTERS = ['Κ', 'Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ'];

/** One slot per day of the period: weekday letters for a week, day numbers (every 7th shown) for a month. */
function dayAxis(dates, today) {
  const short = dates.length <= 10;
  return dates.map((date) => {
    const parsed = parseDate(date);
    const dayOfMonth = parsed ? parsed.getDate() : 0;
    return {
      date,
      label: short ? WEEKDAY_LETTERS[parsed ? parsed.getDay() : 0] : String(dayOfMonth),
      major: short || dayOfMonth % 7 === 1,
      future: date > today,
    };
  });
}

function shortDate(date) {
  const [, month, day] = String(date).split('-');
  return `${Number(day)}/${Number(month)}`;
}

/** Blocks whose day has passed, plus today's blocks that already have an outcome — what the status is judged on. */
function dueBlocks(blocks, today) {
  return (blocks || []).filter((block) => (
    block.date < today || (block.date === today && block.status !== 'Planned')
  ));
}

/* ---------- Σώμα ---------- */

function summarizeBody(days, prevDays, axis) {
  const readiness = seriesStats(days, 'readiness');
  const activity = seriesStats(days, 'activity');
  const hr = seriesStats(days, 'restingHr');
  const avgHr = seriesStats(days, 'avgHr');
  const hrv = seriesStats(days, 'hrv');
  const weight = seriesStats(days, 'weight');
  const waist = seriesStats(days, 'waist');
  const thigh = seriesStats(days, 'thigh');
  const arm = seriesStats(days, 'arm');
  const prevReadiness = seriesStats(prevDays, 'readiness');
  const prevActivity = seriesStats(prevDays, 'activity');
  const prevHr = seriesStats(prevDays, 'restingHr');
  const prevAvgHr = seriesStats(prevDays, 'avgHr');
  const prevHrv = seriesStats(prevDays, 'hrv');
  const prevWeight = seriesStats(prevDays, 'weight');
  const prevWaist = seriesStats(prevDays, 'waist');
  const prevThigh = seriesStats(prevDays, 'thigh');
  const prevArm = seriesStats(prevDays, 'arm');
  const hasData = [readiness.avg, activity.avg, hr.avg, avgHr.avg, hrv.avg, weight.avg, waist.avg, thigh.avg, arm.avg].some((value) => value != null);
  if (!hasData) return emptyCard('body', 'Σώμα', 'Readiness · activity');

  const score = round(readiness.avg, 0);
  const measured = days.filter((day) => day.readiness != null);
  const low = measured.filter((day) => day.readiness < SCORE_GOOD).length;
  const hrvDelta = round(deltaOf(hrv.avg, prevHrv.avg), 0);
  const hrDelta = round(deltaOf(hr.avg, prevHr.avg), 0);
  const weightDelta = round(deltaOf(weight.avg, prevWeight.avg), 1);
  let verdict = null;
  if (low) {
    const signs = [
      hrvDelta != null && hrvDelta < 0 ? `HRV ${hrvDelta} ms` : null,
      hrDelta != null && hrDelta > 0 ? `RHR +${hrDelta}` : null,
    ].filter(Boolean);
    verdict = `${low}/${measured.length} ${plural(measured.length, 'μέρα', 'μέρες')} με readiness < ${SCORE_GOOD}${signs.length ? ` · ${signs.join(' · ')}` : ''} — το σώμα δεν ανέκαμψε πλήρως.`;
  } else if (weightDelta != null && Math.abs(weightDelta) >= 1) {
    verdict = `Βάρος ${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg vs προηγούμενη — τόσο γρήγορα είναι κυρίως νερό/αλάτι· κρίνε από την τάση και τη μέση.`;
  } else if (measured.length) {
    verdict = `Readiness ≥ ${SCORE_GOOD} κάθε μέρα — καλή ανάκαμψη.`;
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  return {
    id: 'body',
    title: 'Σώμα',
    eyebrow: 'Μέσος + Δ vs προηγούμενη',
    hasData: true,
    primary: score,
    primarySuffix: readiness.avg != null ? ' readiness' : '',
    delta: formatDelta(deltaOf(score, round(prevReadiness.avg, 0))),
    status: atLeast(score, SCORE_GOOD, SCORE_WARN),
    meter: score != null ? { value: score, max: 100, target: SCORE_GOOD, label: `Oura: ≥ ${SCORE_GOOD} = καλή ανάκαμψη` } : null,
    chart: measured.length
      ? {
        type: 'bars',
        label: 'Readiness ανά μέρα',
        reference: { value: SCORE_GOOD, label: String(SCORE_GOOD) },
        legend: [
          { tone: 'good', text: `≥ ${SCORE_GOOD}` },
          { tone: 'warn', text: `${SCORE_WARN}–${SCORE_GOOD - 1}` },
          { tone: 'bad', text: `< ${SCORE_WARN}` },
        ],
        days: axis.map((slot) => {
          const day = byDate.get(slot.date);
          if (!day || day.readiness == null) {
            return { ...slot, value: null, tone: slot.future ? 'future' : 'empty', tip: `${shortDate(slot.date)} · χωρίς δεδομένα` };
          }
          const extra = [
            day.hrv != null ? `HRV ${Math.round(day.hrv)} ms` : null,
            day.restingHr != null ? `RHR ${Math.round(day.restingHr)}` : null,
          ].filter(Boolean);
          return {
            ...slot,
            value: day.readiness,
            tone: scoreTone(day.readiness),
            tip: `${shortDate(slot.date)} · readiness ${Math.round(day.readiness)}${extra.length ? ` · ${extra.join(' · ')}` : ''}`,
          };
        }),
      }
      : null,
    rows: [
      row('Readiness', readiness.avg, prevReadiness.avg),
      row('Activity', activity.avg, prevActivity.avg),
      row('Resting HR', hr.avg, prevHr.avg, { invert: true }),
      row('Παλμοί', avgHr.avg, prevAvgHr.avg, { suffix: ' bpm', invert: true }),
      row('HRV', hrv.avg, prevHrv.avg, { suffix: ' ms' }),
      row('Βάρος', weight.avg, prevWeight.avg, { digits: 1, suffix: ' kg', invert: true }),
      row('Μέση', waist.avg, prevWaist.avg, { digits: 1, suffix: ' cm', invert: true }),
      row('Μηρός', thigh.avg, prevThigh.avg, { digits: 1, suffix: ' cm', invert: true }),
      row('Μπράτσο', arm.avg, prevArm.avg, { digits: 1, suffix: ' cm', invert: true }),
    ],
    notes: [],
    verdict,
  };
}

/* ---------- Ύπνος ---------- */

function workoutStreak(blocks, dates) {
  const doneDates = new Set(
    (blocks || [])
      .filter((block) => block.blockType === 'Workout' && block.status === 'Done')
      .map((block) => block.date)
  );
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    if (!doneDates.has(dates[i])) {
      if (streak > 0) break;
      continue;
    }
    streak += 1;
  }
  return streak;
}

function clockAxis(text, bedtime) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (bedtime && minutes < 12 * 60) return minutes + 1440;
  return minutes;
}

function formatMinutes(minutes) {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}λ`;
  if (!mins) return `${hours}ω`;
  return `${hours}ω ${mins}λ`;
}

function clockDays(days) {
  return days.map((day) => ({
    date: day.date,
    sleep: day.sleep,
    sourceIds: [`lifeline-day:${day.date}`],
  }));
}

function median(values) {
  const nums = values.filter((value) => value != null).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

const NIGHT_TARGET_MIN = 7 * 60;
const BEDTIME_WINDOW_MIN = 30;

/** Time actually asleep that night (Oura's total), falling back to time in bed. */
function nightAsleepMinutes(night, ouraByDay) {
  const seconds = NUMBER(mainSleepSession(ouraPayload(ouraByDay?.[night.date]))?.total_sleep_duration);
  return seconds ? Math.round(seconds / 60) : night.durationMinutes;
}

function sleepNightStats(clock, ouraByDay) {
  const typicalBed = clockAxis(clock.bedtime?.typical, true);
  const nights = clock.entries.map((night) => {
    const bedAxis = clockAxis(night.bedtime, true);
    return {
      ...night,
      asleep: nightAsleepMinutes(night, ouraByDay),
      onSchedule: typicalBed != null && bedAxis != null && Math.abs(bedAxis - typicalBed) <= BEDTIME_WINDOW_MIN,
    };
  });
  return {
    nights,
    typicalAsleep: median(nights.map((night) => night.asleep)),
    enough: nights.filter((night) => night.asleep >= NIGHT_TARGET_MIN).length,
    onSchedule: nights.filter((night) => night.onSchedule).length,
  };
}

function summarizeSleepClock(days, prevDays, ouraRows, ouraByDay, axis) {
  const clock = buildSleepClock(clockDays(days), ouraRows);
  const previous = buildSleepClock(clockDays(prevDays), ouraRows);
  const sleep = seriesStats(days, 'sleep');
  const prevSleep = seriesStats(prevDays, 'sleep');
  const score = round(sleep.avg, 0);
  const prevScore = round(prevSleep.avg, 0);
  if (!clock.count && score == null) return emptyCard('sleepClock', 'Ύπνος', 'Score · ώρα · ξύπνημα');

  const wakeDelta = deltaOf(clockAxis(clock.wake?.typical, false), clockAxis(previous.wake?.typical, false));
  const now = sleepNightStats(clock, ouraByDay);
  const prev = sleepNightStats(previous, ouraByDay);
  const durationDelta = deltaOf(now.typicalAsleep, prev.typicalAsleep);
  const previousBedtime = previous.bedtime?.typical
    ? { text: `προηγ. ${previous.bedtime.typical}`, tone: 'neutral' }
    : null;

  const short = clock.count - now.enough;
  let verdict = null;
  if (clock.count >= 3 && now.onSchedule / clock.count < 0.7) {
    verdict = `Μόνο ${now.onSchedule}/${clock.count} νύχτες κοντά στη συνηθισμένη ώρα (${clock.bedtime.typical}) — η σταθερή ώρα είναι ο πιο γρήγορος τρόπος να ανέβει το score.`;
  } else if (score != null && score < SCORE_GOOD) {
    verdict = `Μέσο score ${score}, κάτω από ${SCORE_GOOD}${short ? ` · ${short} ${plural(short, 'νύχτα', 'νύχτες')} κάτω από 7ω ύπνου` : ''}.`;
  } else if (clock.count) {
    verdict = short
      ? `Καλό score, αλλά ${short} ${plural(short, 'νύχτα', 'νύχτες')} κάτω από 7ω ύπνου.`
      : 'Καλός και σταθερός ύπνος.';
  }

  const byDate = new Map(now.nights.map((night) => [night.date, night]));
  return {
    id: 'sleepClock',
    title: 'Ύπνος',
    eyebrow: 'Score · ώρα · ξύπνημα',
    hasData: true,
    primary: score != null ? score : (clock.bedtime?.typical || null),
    primarySuffix: score != null ? '' : '',
    delta: score != null
      ? formatDelta(deltaOf(score, prevScore))
      : previousBedtime,
    status: atLeast(score, SCORE_GOOD, SCORE_WARN),
    meter: score != null ? { value: score, max: 100, target: SCORE_GOOD, label: `Oura: ≥ ${SCORE_GOOD} = καλός ύπνος` } : null,
    chart: clock.count
      ? {
        type: 'bars',
        label: 'Ώρες ύπνου ανά νύχτα, χρώμα από το score',
        reference: { value: NIGHT_TARGET_MIN, label: '7ω' },
        legend: [
          { tone: 'good', text: `score ≥ ${SCORE_GOOD}` },
          { tone: 'warn', text: `${SCORE_WARN}–${SCORE_GOOD - 1}` },
          { tone: 'bad', text: `< ${SCORE_WARN}` },
          { tone: 'warn', text: `εκτός ±${BEDTIME_WINDOW_MIN}λ από τη συνηθισμένη ώρα`, marker: true },
        ],
        days: axis.map((slot) => {
          const night = byDate.get(slot.date);
          if (!night) {
            return { ...slot, value: null, tone: slot.future ? 'future' : 'empty', tip: `${shortDate(slot.date)} · χωρίς δεδομένα` };
          }
          return {
            ...slot,
            value: night.asleep,
            tone: night.sleepScore != null ? scoreTone(night.sleepScore) : 'accent',
            marker: night.onSchedule ? null : 'warn',
            tip: `${shortDate(slot.date)} · ${night.bedtime}–${night.wake} · ${formatMinutes(night.asleep)} ύπνος${night.sleepScore != null ? ` · score ${night.sleepScore}` : ''}`,
          };
        }),
      }
      : null,
    rows: [
      row('Score', sleep.avg, prevSleep.avg),
      {
        label: 'Ώρα',
        value: clock.bedtime?.typical || '—',
        delta: previousBedtime,
      },
      {
        label: 'Ξύπνημα',
        value: clock.wake?.typical || '—',
        delta: wakeDelta == null ? null : {
          text: `${wakeDelta > 0 ? '+' : ''}${wakeDelta}λ`,
          tone: 'neutral',
        },
      },
      {
        label: 'Διάρκεια ύπνου',
        value: formatMinutes(now.typicalAsleep),
        delta: formatDelta(durationDelta, { suffix: 'λ' }),
      },
      { label: 'Νύχτες ≥ 7ω', value: `${now.enough}/${clock.count}`, delta: null },
      { label: `Σταθερή ώρα ±${BEDTIME_WINDOW_MIN}λ`, value: `${now.onSchedule}/${clock.count}`, delta: null },
    ],
    nights: clock.entries.map((night) => {
      const [, month, day] = night.date.split('-');
      return {
        date: `${Number(day)}/${Number(month)}`,
        span: `${night.bedtime}–${night.wake}`,
      };
    }),
    notes: [],
    verdict,
  };
}

/* ---------- Προπόνηση ---------- */

const WORKOUT_ACTIVITY_LABELS = {
  walking: 'Περπάτημα',
  running: 'Τρέξιμο',
  cycling: 'Ποδήλατο',
  swimming: 'Κολύμβηση',
  strength: 'Δύναμη',
  strengthtraining: 'Δύναμη',
  yoga: 'Yoga',
  hiking: 'Πεζοπορία',
  yardwork: 'Αυλή',
  workout: 'Προπόνηση',
};

function workoutActivityLabel(activity) {
  const key = String(activity || '').toLowerCase().replace(/[_\s-]+/g, '');
  if (WORKOUT_ACTIVITY_LABELS[key]) return WORKOUT_ACTIVITY_LABELS[key];
  const words = String(activity || 'Προπόνηση').replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function localDayKey(date) {
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function ouraWorkoutEntries(ouraRows, dates) {
  const wanted = new Set(dates);
  const entries = [];
  for (const row of ouraRows || []) {
    for (const workout of ouraPayload(row).workouts || []) {
      const start = workout?.start_datetime ? new Date(workout.start_datetime) : null;
      const end = workout?.end_datetime ? new Date(workout.end_datetime) : null;
      const day = start && !Number.isNaN(start.getTime())
        ? localDayKey(start)
        : String(row?.day || '').slice(0, 10);
      if (!wanted.has(day) || !start || !end || Number.isNaN(end.getTime())) continue;
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      if (minutes <= 0) continue;
      entries.push({ day, label: workoutActivityLabel(workout.activity || workout.label), minutes });
    }
  }
  return entries;
}

function ouraWorkoutMinutes(ouraRows, dates) {
  const totals = new Map();
  for (const entry of ouraWorkoutEntries(ouraRows, dates)) {
    totals.set(entry.label, (totals.get(entry.label) || 0) + entry.minutes);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, minutes]) => ({ label, minutes }));
}

const WORKOUT_MARKER_TEXT = { good: 'Path: έγινε', bad: 'Path: δεν έγινε', future: 'Path: προγραμματισμένη' };
/** WHO: muscle-strengthening on two or more days a week. */
const STRENGTH_PER_WEEK = 2;
const STRENGTH_PATTERN = /δύναμη|strength|weight|resistance|crossfit|functional/i;

/** Distinct days with a strength session, from Oura workouts or a done Path workout named like one. */
function strengthDayCount(entries, workouts) {
  const days = new Set(entries.filter((entry) => STRENGTH_PATTERN.test(entry.label)).map((entry) => entry.day));
  for (const block of workouts) {
    if (block.status === 'Done' && STRENGTH_PATTERN.test(block.title || '')) days.add(block.date);
  }
  return days.size;
}

function workoutMarker(dayWorkouts, slot, today) {
  if (!dayWorkouts.length) return null;
  if (dayWorkouts.some((block) => block.status === 'Done')) return 'good';
  const dropped = dayWorkouts.some((block) => block.status === 'Skipped' || block.status === 'Moved');
  return dropped || slot.date < today ? 'bad' : 'future';
}

function summarizeWorkout(blocks, prevBlocks, dates, ouraRows, prevDates, axis, today) {
  const workouts = (blocks || []).filter((block) => block.blockType === 'Workout');
  const prev = (prevBlocks || []).filter((block) => block.blockType === 'Workout');
  const activities = ouraWorkoutMinutes(ouraRows, dates);
  const prevActivities = ouraWorkoutMinutes(ouraRows, prevDates);
  if (!workouts.length && !prev.length && !activities.length && !prevActivities.length) {
    return emptyCard('workout', 'Προπόνηση', 'Oura · Path');
  }
  const done = workouts.filter((block) => block.status === 'Done').length;
  const planned = workouts.length;
  const prevDone = prev.filter((block) => block.status === 'Done').length;
  const prevPlanned = prev.length;
  const rate = pct(done, planned);
  const ouraMinutes = activities.reduce((sum, item) => sum + item.minutes, 0);
  const prevOuraMinutes = prevActivities.reduce((sum, item) => sum + item.minutes, 0);
  const pathHours = durationHours(workouts.filter((block) => block.status === 'Done'));
  const prevPathHours = durationHours(prev.filter((block) => block.status === 'Done'));
  const hoursLabel = ouraMinutes
    ? formatMinutes(ouraMinutes)
    : (formatHours(pathHours) || '—');
  const hoursDelta = ouraMinutes || prevOuraMinutes
    ? formatDelta(deltaOf(ouraMinutes / 60, prevOuraMinutes / 60), { digits: 1, suffix: 'ω' })
    : formatDelta(deltaOf(pathHours, prevPathHours), { digits: 1, suffix: 'ω' });

  // Status is judged on the workouts whose day has passed, so a Sunday session doesn't count against Saturday.
  const due = dueBlocks(workouts, today);
  const dueDone = due.filter((block) => block.status === 'Done').length;
  const missed = due.length - dueDone;
  const upcoming = planned - due.length;
  let verdict = null;
  if (!planned) {
    verdict = ouraMinutes ? `${formatMinutes(ouraMinutes)} προπόνησης από το Oura — χωρίς πλάνο στο Path.` : null;
  } else if (!due.length) {
    verdict = 'Καμία προγραμματισμένη προπόνηση δεν έχει λήξει ακόμα.';
  } else if (!missed) {
    verdict = `Έγιναν όλες όσες έληξαν (${dueDone}/${due.length})${upcoming ? ` · μένουν ${upcoming}` : ''}.`;
  } else {
    verdict = `${missed} ${plural(missed, 'προπόνηση δεν έγινε', 'προπονήσεις δεν έγιναν')} από ${due.length} που έληξαν${upcoming ? ` · μένουν ${upcoming}` : ''}.`;
  }

  const entries = ouraWorkoutEntries(ouraRows, dates);
  const hasOura = entries.length > 0;
  const strengthDays = strengthDayCount(entries, workouts);
  const strengthTarget = Math.max(1, Math.round((STRENGTH_PER_WEEK * dates.length) / 7));
  const chartDays = axis.map((slot) => {
    const own = workouts.filter((block) => block.date === slot.date);
    const marker = workoutMarker(own, slot, today);
    const dayEntries = entries.filter((entry) => entry.day === slot.date);
    const minutes = hasOura
      ? dayEntries.reduce((sum, entry) => sum + entry.minutes, 0)
      : own.filter((block) => block.status === 'Done').reduce((sum, block) => sum + loggedMinutes(block), 0);
    const parts = dayEntries.map((entry) => `${entry.label} ${formatMinutes(entry.minutes)}`);
    const tip = [
      shortDate(slot.date),
      minutes ? `${formatMinutes(minutes)}${parts.length ? ` (${parts.join(', ')})` : ''}` : 'καμία προπόνηση',
      marker ? WORKOUT_MARKER_TEXT[marker] : null,
    ].filter(Boolean).join(' · ');
    return {
      ...slot,
      value: minutes || null,
      tone: minutes ? 'accent' : (slot.future ? 'future' : 'empty'),
      marker,
      tip,
    };
  });

  return {
    id: 'workout',
    title: 'Προπόνηση',
    eyebrow: 'Oura · Path',
    hasData: planned > 0 || activities.length > 0,
    primary: rate,
    primarySuffix: rate != null ? '%' : '',
    delta: formatDelta(deltaOf(rate, pct(prevDone, prevPlanned)), { suffix: 'μ.μ.' }),
    status: due.length ? atLeast(dueDone / due.length, 0.8, 0.5) : null,
    meter: planned
      ? {
        value: done,
        max: planned,
        target: planned * 0.8,
        label: `στόχος: 8 στις 10 προγραμματισμένες${upcoming ? ` · μένουν ${upcoming}` : ''}`,
      }
      : null,
    chart: {
      type: 'bars',
      label: hasOura ? 'Λεπτά προπόνησης ανά μέρα (Oura)' : 'Λεπτά προπόνησης ανά μέρα (Path)',
      legend: [
        { tone: 'accent', text: hasOura ? 'λεπτά (Oura)' : 'λεπτά (Path)' },
        ...(planned
          ? [
            { tone: 'good', text: 'Path: έγινε', marker: true },
            { tone: 'bad', text: 'δεν έγινε', marker: true },
            { tone: 'future', text: 'προγραμματισμένη', marker: true },
          ]
          : []),
      ],
      days: chartDays,
    },
    rows: [
      { label: 'Done / Planned', value: planned ? `${done}/${planned}` : '—', delta: null },
      { label: 'Ώρες', value: hoursLabel, delta: hoursDelta },
      { label: 'Μέρες δύναμης', value: `${strengthDays}/${strengthTarget}`, delta: null },
      ...activities.map((item) => ({
        label: item.label,
        value: formatMinutes(item.minutes),
        delta: null,
      })),
      { label: 'Streak', value: `${workoutStreak(blocks, dates)} μ.`, delta: null },
    ],
    notes: [],
    verdict,
  };
}

/* ---------- Εκτέλεση ---------- */

function planChart(blocks, axis, today) {
  return {
    type: 'stack',
    label: 'Path blocks ανά μέρα',
    legend: [
      { tone: 'good', text: 'Done' },
      { tone: 'bad', text: 'Skipped / Moved' },
      { tone: 'muted', text: 'χωρίς status' },
      { tone: 'future', text: 'ανοιχτά' },
    ],
    days: axis.map((slot) => {
      const own = (blocks || []).filter((block) => block.date === slot.date);
      const done = own.filter((block) => block.status === 'Done').length;
      const dropped = own.filter((block) => block.status === 'Skipped' || block.status === 'Moved').length;
      const planned = own.filter((block) => block.status === 'Planned').length;
      const unlogged = slot.date < today ? planned : 0;
      const open = planned - unlogged;
      const parts = [
        done && `${done} done`,
        dropped && `${dropped} skipped/moved`,
        unlogged && `${unlogged} χωρίς status`,
        open && `${open} ανοιχτά`,
      ].filter(Boolean);
      return {
        ...slot,
        total: own.length,
        segments: [
          { tone: 'good', value: done },
          { tone: 'bad', value: dropped },
          { tone: 'muted', value: unlogged },
          { tone: 'future', value: open },
        ].filter((segment) => segment.value > 0),
        tip: `${shortDate(slot.date)} · ${parts.length ? parts.join(' · ') : 'κανένα block'}`,
      };
    }),
  };
}

function summarizeExecution(blocks, prevBlocks, completed, prevCompleted, axis, today) {
  if (!(blocks || []).length && !(prevBlocks || []).length && !completed.length) {
    return emptyCard('execution', 'Εκτέλεση', 'Path blocks που έληξαν');
  }
  // Only blocks whose day has passed count: tomorrow's plan is not a miss yet.
  const due = dueBlocks(blocks, today);
  const done = due.filter((block) => block.status === 'Done').length;
  const unlogged = due.filter((block) => block.status === 'Planned').length;
  const prevDue = dueBlocks(prevBlocks, today);
  const prevDone = prevDue.filter((block) => block.status === 'Done').length;
  const rate = pct(done, due.length);
  const unloggedHeavy = due.length > 0 && unlogged / due.length >= 0.3;
  const open = (blocks || []).filter((block) => block.status === 'Planned' && block.date >= today).length;

  let verdict = null;
  if (unloggedHeavy) {
    verdict = `${unlogged} από ${due.length} blocks που έληξαν δεν έχουν status — κλείσ' τα (Done/Skipped) για να ξέρεις τι έγινε πραγματικά.`;
  } else if (rate != null && rate < 60) {
    verdict = `Έκλεισες ${rate}% όσων έληξαν — σχεδίασε λιγότερα, όχι περισσότερα.`;
  } else if (rate != null && rate >= 80) {
    verdict = `Έκλεισες ${rate}% όσων έληξαν — κλείνεις ό,τι σχεδιάζεις.`;
  } else if (rate != null) {
    verdict = `Έκλεισες ${rate}% όσων έληξαν — κοντά στο 80%.`;
  }

  return {
    id: 'execution',
    title: 'Εκτέλεση',
    eyebrow: 'Path blocks που έληξαν',
    hasData: (blocks || []).length > 0 || completed.length > 0,
    primary: rate != null ? rate : '—',
    primarySuffix: rate != null ? '%' : '',
    delta: formatDelta(deltaOf(rate, pct(prevDone, prevDue.length)), { suffix: 'μ.μ.' }),
    status: worst(atLeast(rate, 80, 60), unloggedHeavy ? 'warn' : null),
    meter: due.length
      ? {
        value: done,
        max: due.length,
        target: due.length * 0.8,
        label: `στόχος ≥ 80%${open ? ` · ${open} ακόμα ανοιχτά` : ''}`,
      }
      : null,
    chart: (blocks || []).length ? planChart(blocks, axis, today) : null,
    rows: [
      { label: 'Done / έληξαν', value: due.length ? `${done}/${due.length}` : '—', delta: null },
      { label: 'Χωρίς status', value: String(unlogged), delta: null },
      { label: 'Checkpoints', value: String(completed.length), delta: formatDelta(deltaOf(completed.length, prevCompleted.length)) },
    ],
    notes: [],
    verdict,
  };
}

/* ---------- Εστίαση ---------- */

const THREE_MARKER_TEXT = { good: 'Today three: όλα', warn: 'Today three: μερικά', bad: 'Today three: κανένα' };

function threeMarker(day, slot) {
  const items = day?.todayThree?.items || [];
  if (!items.length) return null;
  if (slot.future) return 'future';
  const done = items.filter((item) => item.done).length;
  if (done === items.length) return 'good';
  return done ? 'warn' : 'bad';
}

/** "6h", "6ω", "3ω 30λ", "6 ώρες / εβδομάδα", "90 min" → minutes per week. Block counts are not time and are ignored. */
export function allocationMinutes(text) {
  const value = String(text || '').toLowerCase().replace(',', '.');
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|ω|ώρ|ωρ)/);
  const minutes = (hours ? value.slice(hours.index + hours[0].length) : value).match(/(\d+)\s*(m|min|λ|λεπ)/);
  if (!hours && !minutes) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

/** Time logged on a block: the timer when it ran, else the planned length once it is Done. */
function loggedMinutes(block) {
  const worked = NUMBER(block?.workedMinutes);
  if (worked != null && worked > 0) return worked;
  return block?.status === 'Done' ? (NUMBER(block.duration) || 0) : 0;
}

const TRACK_TEXT = { 'On track': 'εντός', 'At risk': 'πίσω' };

/** Time per active Path goal against its Weekly allocation, paced to the days already gone. */
function goalTime(blocks, pathBundle, dayCount, elapsedCount) {
  const goals = (pathBundle?.goals || []).filter((goal) => goal.status === 'Active');
  if (!goals.length) return null;
  const fraction = Math.min(1, Math.max(1, elapsedCount) / Math.max(1, dayCount));
  const total = (blocks || []).reduce((sum, block) => sum + loggedMinutes(block), 0);
  const items = goals
    .map((goal) => {
      const minutes = (blocks || []).filter((block) => block.goalId === goal.id).reduce((sum, block) => sum + loggedMinutes(block), 0);
      const weekly = allocationMinutes(goal.weeklyAllocation);
      const budget = weekly != null ? Math.round((weekly * dayCount) / 7) : null;
      const pace = budget != null ? budget * fraction : null;
      return { goal, minutes, budget, pace, ratio: pace ? minutes / pace : null };
    })
    .sort((a, b) => roleRank(a.goal.role) - roleRank(b.goal.role) || b.minutes - a.minutes);
  const other = Math.max(0, total - items.reduce((sum, item) => sum + item.minutes, 0));
  return { items, other, total };
}

function goalChart(time, metrics) {
  const title = (item) => item.goal.title || 'Στόχος';
  return {
    type: 'bullets',
    label: 'Χρόνος ανά στόχο vs Weekly allocation',
    legend: [
      { tone: 'good', text: 'στο budget' },
      { tone: 'warn', text: 'λίγο πίσω' },
      { tone: 'bad', text: '< μισό budget' },
      { tone: 'tick', text: 'budget' },
    ],
    items: [
      ...time.items.map((item) => {
        const track = TRACK_TEXT[computeTrackStatus(item.goal, metrics || [])];
        return {
          label: `${item.goal.role === 'Primary' ? '★ ' : ''}${title(item)}`,
          value: item.minutes,
          target: item.budget,
          tone: item.ratio == null ? 'accent' : atLeast(item.ratio, 0.9, 0.5),
          display: `${formatMinutes(Math.round(item.minutes))}${item.budget ? ` / ${formatMinutes(item.budget)}` : ''}`,
          tip: `${title(item)} · ${formatMinutes(Math.round(item.minutes))}${item.budget ? ` από ${formatMinutes(item.budget)}` : ''}${track ? ` · στόχος ${track}` : ''}`,
        };
      }),
      ...(time.other
        ? [{ label: 'Εκτός στόχων', value: time.other, target: null, tone: 'muted', display: formatMinutes(Math.round(time.other)), tip: `Εκτός στόχων · ${formatMinutes(Math.round(time.other))}` }]
        : []),
    ],
  };
}

function summarizeFocus(days, prevDays, blocks, prevBlocks, axis, today, pathBundle, dayCount, elapsedCount) {
  const deep = (blocks || []).filter((block) => block.blockType === 'Deep Work');
  const prevDeep = (prevBlocks || []).filter((block) => block.blockType === 'Deep Work');
  const doneMinutes = (list) => list.filter((block) => block.status === 'Done').reduce((sum, block) => sum + loggedMinutes(block), 0);
  const doneHours = doneMinutes(deep) / 60;
  const plannedHours = durationHours(deep);
  const prevDoneHours = doneMinutes(prevDeep) / 60;
  let threeDone = 0;
  let threeTotal = 0;
  let prevThreeDone = 0;
  let prevThreeTotal = 0;
  for (const day of days) {
    const items = day.todayThree?.items || [];
    threeTotal += items.length;
    threeDone += items.filter((item) => item.done).length;
  }
  for (const day of prevDays) {
    const items = day.todayThree?.items || [];
    prevThreeTotal += items.length;
    prevThreeDone += items.filter((item) => item.done).length;
  }
  const time = goalTime(blocks, pathBundle, dayCount, elapsedCount);
  if (!plannedHours && !threeTotal && !doneHours && !time?.total) return emptyCard('focus', 'Εστίαση', 'Deep Work · Today three · στόχοι');

  const plannedDueHours = durationHours(dueBlocks(deep, today));
  const deepStatus = plannedDueHours ? atLeast(doneHours / plannedDueHours, 0.8, 0.5) : null;
  const threeStatus = threeTotal ? atLeast(threeDone / threeTotal, 0.8, 0.5) : null;
  const behind = time?.items.find((item) => item.pace && item.ratio < 0.5);
  let verdict = null;
  if (behind) {
    verdict = `«${behind.goal.title || 'Στόχος'}» πήρε ${formatMinutes(Math.round(behind.minutes))} από ~${formatMinutes(Math.round(behind.pace))} που του αναλογούσαν ως τώρα.`;
  } else if (deepStatus && deepStatus !== 'good') {
    verdict = `Deep Work: ${formatHours(doneHours) || '0ω'} από ${formatHours(plannedDueHours)} που έληξαν — προστάτεψε τα blocks από διακοπές.`;
  } else if (threeStatus && threeStatus !== 'good') {
    verdict = `Today three: ${threeDone}/${threeTotal} — διάλεγε 3 που χωράνε πραγματικά στη μέρα.`;
  } else if (deepStatus || threeStatus) {
    verdict = 'Η εστίαση κράτησε.';
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  return {
    id: 'focus',
    title: 'Εστίαση',
    eyebrow: 'Deep Work + Today three + στόχοι',
    hasData: true,
    primary: round(doneHours, 1),
    primarySuffix: 'ω',
    delta: formatDelta(deltaOf(doneHours, prevDoneHours), { digits: 1, suffix: 'ω' }),
    status: worst(deepStatus, threeStatus),
    meter: plannedHours
      ? {
        value: round(doneHours, 1),
        max: Math.max(plannedHours, doneHours),
        target: plannedHours * 0.8,
        label: 'στόχος: 80% των ωρών Deep Work που σχεδίασες',
      }
      : (threeTotal
        ? { value: threeDone, max: threeTotal, target: threeTotal * 0.8, label: 'Today three: στόχος 80%' }
        : null),
    chart: {
      type: 'bars',
      label: 'Ώρες Deep Work ανά μέρα',
      legend: [
        { tone: 'accent', text: 'Deep Work' },
        ...(threeTotal
          ? [
            { tone: 'good', text: 'Today three: όλα', marker: true },
            { tone: 'warn', text: 'μερικά', marker: true },
            { tone: 'bad', text: 'κανένα', marker: true },
          ]
          : []),
      ],
      days: axis.map((slot) => {
        const minutes = doneMinutes(deep.filter((block) => block.date === slot.date));
        const marker = threeMarker(byDate.get(slot.date), slot);
        const items = byDate.get(slot.date)?.todayThree?.items || [];
        const tip = [
          shortDate(slot.date),
          minutes ? `${formatMinutes(minutes)} Deep Work` : 'χωρίς Deep Work',
          items.length && !slot.future ? `${THREE_MARKER_TEXT[marker] || 'Today three'} (${items.filter((item) => item.done).length}/${items.length})` : null,
        ].filter(Boolean).join(' · ');
        return {
          ...slot,
          value: minutes || null,
          tone: minutes ? 'accent' : (slot.future ? 'future' : 'empty'),
          marker,
          tip,
        };
      }),
    },
    extraChart: time ? goalChart(time, pathBundle?.metrics) : null,
    rows: [
      { label: 'Deep Work', value: `${formatHours(doneHours) || '0ω'} / ${formatHours(plannedHours) || '0ω'}`, delta: null },
      { label: 'Today three', value: threeTotal ? `${threeDone}/${threeTotal}` : '—', delta: formatDelta(deltaOf(pct(threeDone, threeTotal), pct(prevThreeDone, prevThreeTotal)), { suffix: 'μ.μ.' }) },
    ],
    notes: [],
    verdict,
  };
}

/* ---------- Έξοδος ---------- */

function summarizeOutward(brandItems, prevBrand, calls, prevCalls) {
  const published = (brandItems || []).length;
  const prevPublished = (prevBrand || []).length;
  const callStats = summarizeCalls(calls || []);
  const prevCallStats = summarizeCalls(prevCalls || []);
  if (!published && !callStats.total) return emptyCard('outward', 'Έξοδος', 'Brand · Calls');
  return {
    id: 'outward',
    title: 'Έξοδος',
    eyebrow: 'Brand + Calls',
    hasData: true,
    primary: published,
    primarySuffix: ' published',
    delta: formatDelta(deltaOf(published, prevPublished)),
    status: null,
    meter: null,
    chart: null,
    rows: [
      { label: 'Published', value: String(published), delta: formatDelta(deltaOf(published, prevPublished)) },
      { label: 'Κλήσεις', value: String(callStats.total), delta: formatDelta(deltaOf(callStats.total, prevCallStats.total)) },
      { label: 'Conversion', value: callStats.total ? `${callStats.conversionRate}%` : '—', delta: formatDelta(deltaOf(callStats.conversionRate, prevCallStats.conversionRate), { suffix: 'μ.μ.' }) },
    ],
    notes: [],
    verdict: null,
  };
}

/* ---------- Τι κόλλησε ---------- */

function summarizeStuck(days, blocks, stages, obstacles, axis) {
  const lowSleep = days.filter((day) => day.sleep != null && day.sleep < SLEEP_LOW);
  const skipped = (blocks || []).filter((block) => block.status === 'Skipped' || block.status === 'Moved');
  const blockers = [];
  for (const stage of stages || []) {
    for (const blocker of stage.blockers || []) {
      const status = String(blocker.status || 'Open');
      if (status === 'Resolved' || status === 'Closed') continue;
      blockers.push({ title: blocker.title || 'Blocker', severity: blocker.severity || 'Medium' });
    }
  }
  for (const obstacle of obstacles || []) {
    if (obstacle.completedAt || obstacle.status === 'Resolved' || obstacle.status === 'Done') continue;
    blockers.push({ title: obstacle.title || 'Obstacle', severity: obstacle.severity || 'Medium' });
  }
  const notes = [];
  if (blockers.length) notes.push(`${blockers.length} ανοιχτά blockers`);
  if (skipped.length) notes.push(`${skipped.length} Skipped/Moved Path blocks`);
  if (lowSleep.length) notes.push(`${lowSleep.length} μέρες ύπνου < ${SLEEP_LOW}`);
  if (!notes.length) {
    return {
      id: 'stuck',
      title: 'Τι κόλλησε',
      eyebrow: 'Blockers · skipped · ύπνος',
      hasData: true,
      primary: 0,
      primarySuffix: '',
      delta: null,
      status: 'good',
      meter: null,
      chart: null,
      rows: [],
      notes: [],
      verdict: 'Τίποτα εμφανές αυτή την περίοδο.',
    };
  }

  const total = blockers.length + skipped.length + lowSleep.length;
  const skippedDates = new Set(skipped.map((block) => block.date));
  const lowDates = new Set(lowSleep.map((day) => day.date));
  const overlap = [...skippedDates].filter((date) => lowDates.has(date)).length;
  const repeats = new Map();
  for (const block of skipped) {
    const key = block.templateId || block.title || block.id;
    const entry = repeats.get(key) || { title: block.title || 'Path block', count: 0 };
    entry.count += 1;
    repeats.set(key, entry);
  }
  const recurring = [...repeats.values()].filter((item) => item.count >= 2).sort((a, b) => b.count - a.count)[0];
  let verdict = null;
  if (overlap && skippedDates.size >= 2 && overlap / skippedDates.size >= 0.5) {
    verdict = `${overlap} από τις ${skippedDates.size} μέρες με skipped/moved ήταν μέρες με ύπνο < ${SLEEP_LOW} — ο ύπνος ρίχνει την εκτέλεση.`;
  } else if (recurring) {
    verdict = `«${recurring.title}» έπεσε ${recurring.count}× — μίκρυνέ το ή άλλαξέ του ώρα/μέρα.`;
  } else if (blockers.length) {
    verdict = `Ξεμπλόκαρε πρώτα το «${blockers[0].title}».`;
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  const skippedOn = (date) => skipped.filter((block) => block.date === date).length;
  return {
    id: 'stuck',
    title: 'Τι κόλλησε',
    eyebrow: 'Blockers · skipped · ύπνος',
    hasData: true,
    primary: total,
    primarySuffix: '',
    delta: null,
    status: total <= 3 ? 'warn' : 'bad',
    meter: null,
    chart: skipped.length || lowSleep.length
      ? {
        type: 'grid',
        label: 'Πότε κόλλησε',
        legend: [
          { tone: 'bad', text: 'συνέβη' },
          { tone: 'miss', text: 'καθαρή μέρα' },
        ],
        rows: [
          {
            label: 'Skipped/Moved',
            cells: axis.map((slot) => {
              const count = skippedOn(slot.date);
              if (slot.future && !count) return { ...slot, tone: 'future', tip: `${shortDate(slot.date)} · δεν ήρθε ακόμα` };
              return { ...slot, tone: count ? 'bad' : 'miss', tip: `${shortDate(slot.date)} · ${count} skipped/moved` };
            }),
          },
          {
            label: `Ύπνος < ${SLEEP_LOW}`,
            cells: axis.map((slot) => {
              const score = byDate.get(slot.date)?.sleep;
              if (score == null) {
                return { ...slot, tone: slot.future ? 'future' : 'empty', tip: `${shortDate(slot.date)} · χωρίς score` };
              }
              return { ...slot, tone: score < SLEEP_LOW ? 'bad' : 'miss', tip: `${shortDate(slot.date)} · score ${Math.round(score)}` };
            }),
          },
        ],
      }
      : null,
    rows: [
      { label: 'Blockers', value: String(blockers.length), delta: null },
      { label: 'Skipped/Moved', value: String(skipped.length), delta: null },
      { label: `Ύπνος < ${SLEEP_LOW}`, value: String(lowSleep.length), delta: null },
    ],
    notes: [
      ...blockers.slice(0, 3).map((item) => item.title),
      ...skipped.slice(0, 2).map((block) => block.title || 'Path block'),
    ].filter(Boolean),
    verdict,
  };
}

function indexOura(rows = []) {
  const map = {};
  for (const row of rows) {
    const day = toDateString(row?.day);
    if (day) map[day] = row;
  }
  return map;
}

function indexWeight(readings = [], { average = false } = {}) {
  const buckets = {};
  for (const reading of readings) {
    const day = toDateString(reading?.day);
    if (!day) continue;
    const fromPayload = average && Array.isArray(reading?.payload?.readings)
      ? reading.payload.readings
          .map((row) => NUMBER(row?.value))
          .filter((value) => value != null)
      : [];
    const values = fromPayload.length
      ? fromPayload
      : [NUMBER(reading?.value)].filter((value) => value != null);
    if (!values.length) continue;
    if (!buckets[day]) buckets[day] = [];
    buckets[day].push(...values);
  }

  const map = {};
  for (const [day, values] of Object.entries(buckets)) {
    map[day] = average
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : values[values.length - 1];
  }
  return map;
}

function blocksInDates(blocks, dates) {
  const set = new Set(dates);
  return (blocks || []).filter((block) => set.has(block.date));
}

function completedInDates(projectActivity, dates) {
  const items = [];
  for (const date of dates) {
    items.push(...collectCompletedItemsForDate(projectActivity, date));
  }
  return items;
}

function publishedInRange(items, startDate, endDate) {
  return (items || []).filter((item) => (
    item.stage === 'published' && inRange(item.publishedAt || item.updatedAt, startDate, endDate)
  ));
}

function callsInRange(calls, startDate, endDate) {
  return (calls || []).filter((call) => inRange(call.calledAt, startDate, endDate));
}

/**
 * Build the Life Summary cards for a week or month. Each card keeps its own
 * metrics and adds a status against a target, a meter, a per-day chart and a
 * one-line verdict. Statuses only judge days that have already happened.
 */
export function summarizePeriod({
  kind = 'week',
  startDate,
  endDate,
  today = toDateString(new Date()),
  lifelineDays = {},
  selfHubDays = {},
  pathBundle = null,
  projectActivity = [],
  stages = [],
  obstacles = [],
  brandItems = [],
  calls = [],
  ouraRows = [],
  weightReadings = [],
  waistReadings = [],
  thighReadings = [],
  armReadings = [],
} = {}) {
  const range = startDate && endDate
    ? { kind, startDate: toDateString(startDate), endDate: toDateString(endDate) }
    : getPeriodRange(kind, startDate);
  if (!range?.startDate || !range?.endDate) {
    return {
      kind,
      startDate: null,
      endDate: null,
      label: '',
      cards: [],
    };
  }

  const previous = shiftPeriod(range.kind, range.startDate, -1);
  const dates = eachDateInclusive(range.startDate, range.endDate);
  const prevDates = eachDateInclusive(previous.startDate, previous.endDate);
  const ouraByDay = indexOura(ouraRows);
  const weightByDay = indexWeight(weightReadings, { average: true });
  const bodyByDay = {
    waist: indexWeight(waistReadings),
    thigh: indexWeight(thighReadings),
    arm: indexWeight(armReadings),
  };
  const days = dates.map((date) => buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, bodyByDay));
  const prevDays = prevDates.map((date) => buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, bodyByDay));
  const blocks = blocksInDates(pathBundle?.blocks, dates);
  const prevBlocks = blocksInDates(pathBundle?.blocks, prevDates);
  const completed = completedInDates(projectActivity, dates);
  const prevCompleted = completedInDates(projectActivity, prevDates);
  const brand = publishedInRange(brandItems, range.startDate, range.endDate);
  const prevBrand = publishedInRange(brandItems, previous.startDate, previous.endDate);
  const periodCalls = callsInRange(calls, range.startDate, range.endDate);
  const prevCalls = callsInRange(calls, previous.startDate, previous.endDate);
  const axis = dayAxis(dates, today);
  const elapsedCount = dates.filter((date) => date <= today).length;
  const outward = summarizeOutward(brand, prevBrand, periodCalls, prevCalls);

  const cards = [
    summarizeBody(days, prevDays, axis),
    summarizeSleepClock(days, prevDays, ouraRows, ouraByDay, axis),
    summarizeWorkout(blocks, prevBlocks, dates, ouraRows, prevDates, axis, today),
    summarizeExecution(blocks, prevBlocks, completed, prevCompleted, axis, today),
    summarizeFocus(days, prevDays, blocks, prevBlocks, axis, today, pathBundle, dates.length, elapsedCount),
    // Έξοδος only shows when something actually went out.
    ...(outward.hasData ? [outward] : []),
    summarizeStuck(days, blocks, stages, obstacles, axis),
  ];

  return {
    kind: range.kind,
    startDate: range.startDate,
    endDate: range.endDate,
    previous,
    label: formatPeriodRangeLabel(range.kind, range.startDate, range.endDate),
    ariaLabel: formatPeriodAriaLabel(range.kind, range.startDate, range.endDate),
    dayCount: dates.length,
    cards,
  };
}
