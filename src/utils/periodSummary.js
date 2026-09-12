import { addDays, parseDate, toDateString } from './lifeline';
import {
  collectCompletedItemsForDate,
  getDayEntry,
  getRoutineDayScore,
  groupRoutinesByStack,
  mergeDayRoutines,
  normalizeRoutineTemplates,
} from './lifelineDays';
import { ROUTINE_STACK_ORDER, ROUTINE_STACKS } from './lifelineRoutines';
import { getSelfHubDayEntry } from './selfHubDays';
import { summarizeCalls } from './callsDb';

const SLEEP_LOW = 70;
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

function restingHrFromMetrics(metrics) {
  const hr = [...(metrics?.leftMetrics || [])].find((item) => item?.id === 'heartRate');
  return NUMBER(hr?.resting) ?? NUMBER(hr?.value);
}

function weightFromMetrics(metrics) {
  return NUMBER(metrics?.weight?.kg);
}

function waistFromMetrics(metrics) {
  return NUMBER(metrics?.waist?.cm);
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

function buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, waistByDay) {
  const day = getDayEntry(lifelineDays, date);
  const hub = getSelfHubDayEntry(selfHubDays, date);
  const metrics = hub.health || day.metrics;
  const oura = ouraByDay?.[date] || null;
  return {
    date,
    sleep: metricFromList(metrics, 'sleep') ?? NUMBER(oura?.sleep_score),
    readiness: metricFromList(metrics, 'readiness') ?? NUMBER(oura?.readiness_score),
    activity: metricFromList(metrics, 'activity') ?? NUMBER(oura?.activity_score),
    restingHr: restingHrFromMetrics(metrics) ?? NUMBER(oura?.resting_heart_rate),
    weight: weightFromMetrics(metrics) ?? NUMBER(weightByDay?.[date]),
    waist: waistFromMetrics(metrics) ?? NUMBER(waistByDay?.[date]),
    dayScore: NUMBER(metrics?.dayScore?.value),
    capacityLabel:
      hub.hub?.capacity?.label
      || day.hubSnapshot?.capacity?.label
      || null,
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
    rows: [],
    notes: [],
  };
}

function summarizeBody(days, prevDays) {
  const sleep = seriesStats(days, 'sleep');
  const readiness = seriesStats(days, 'readiness');
  const activity = seriesStats(days, 'activity');
  const hr = seriesStats(days, 'restingHr');
  const weight = seriesStats(days, 'weight');
  const waist = seriesStats(days, 'waist');
  const prevSleep = seriesStats(prevDays, 'sleep');
  const prevReadiness = seriesStats(prevDays, 'readiness');
  const prevActivity = seriesStats(prevDays, 'activity');
  const prevHr = seriesStats(prevDays, 'restingHr');
  const prevWeight = seriesStats(prevDays, 'weight');
  const prevWaist = seriesStats(prevDays, 'waist');
  const hasData = [sleep.avg, readiness.avg, activity.avg, hr.avg, weight.first, weight.last, waist.first, waist.last].some((value) => value != null);
  if (!hasData) return emptyCard('body', 'Σώμα', 'Ύπνος · readiness · activity');

  const weightDelta = weight.first != null && weight.last != null ? weight.last - weight.first : null;
  const waistDelta = waist.first != null && waist.last != null ? waist.last - waist.first : null;
  return {
    id: 'body',
    title: 'Σώμα',
    eyebrow: 'Μέσος + Δ vs προηγούμενη',
    hasData: true,
    primary: round(sleep.avg, 0),
    primarySuffix: sleep.avg != null ? ' ύπνος' : '',
    delta: formatDelta(deltaOf(round(sleep.avg, 0), round(prevSleep.avg, 0))),
    rows: [
      row('Ύπνος', sleep.avg, prevSleep.avg),
      row('Readiness', readiness.avg, prevReadiness.avg),
      row('Activity', activity.avg, prevActivity.avg),
      row('Resting HR', hr.avg, prevHr.avg, { invert: true }),
      {
        label: 'Βάρος',
        value: weight.last != null ? `${round(weight.last, 1)} kg` : '—',
        delta: formatDelta(weightDelta ?? deltaOf(weight.last, prevWeight.last), { digits: 1, suffix: ' kg', invert: true }),
      },
      {
        label: 'Μέση',
        value: waist.last != null ? `${round(waist.last, 1)} cm` : '—',
        delta: formatDelta(waistDelta ?? deltaOf(waist.last, prevWaist.last), { digits: 1, suffix: ' cm', invert: true }),
      },
    ],
    notes: [],
  };
}

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

function summarizeWorkout(blocks, prevBlocks, dates) {
  const workouts = (blocks || []).filter((block) => block.blockType === 'Workout');
  const prev = (prevBlocks || []).filter((block) => block.blockType === 'Workout');
  if (!workouts.length && !prev.length) return emptyCard('workout', 'Προπόνηση', 'Path Workout');
  const done = workouts.filter((block) => block.status === 'Done').length;
  const planned = workouts.length;
  const prevDone = prev.filter((block) => block.status === 'Done').length;
  const prevPlanned = prev.length;
  const rate = pct(done, planned);
  const hours = durationHours(workouts.filter((block) => block.status === 'Done'));
  return {
    id: 'workout',
    title: 'Προπόνηση',
    eyebrow: 'Workout blocks',
    hasData: planned > 0,
    primary: rate,
    primarySuffix: rate != null ? '%' : '',
    delta: formatDelta(deltaOf(rate, pct(prevDone, prevPlanned)), { suffix: 'μ.μ.' }),
    rows: [
      { label: 'Done / Planned', value: planned ? `${done}/${planned}` : '—', delta: null },
      { label: 'Ώρες', value: formatHours(hours) || '—', delta: formatDelta(deltaOf(hours, durationHours(prev.filter((block) => block.status === 'Done'))), { digits: 1, suffix: 'ω' }) },
      { label: 'Streak', value: `${workoutStreak(blocks, dates)} μ.`, delta: null },
    ],
    notes: [],
  };
}

function summarizeExecution(days, prevDays, blocks, prevBlocks, completed, prevCompleted) {
  const todoDone = days.reduce((sum, day) => sum + day.todos.filter((todo) => todo.done).length, 0);
  const todoTotal = days.reduce((sum, day) => sum + day.todos.length, 0);
  const prevTodoDone = prevDays.reduce((sum, day) => sum + day.todos.filter((todo) => todo.done).length, 0);
  const prevTodoTotal = prevDays.reduce((sum, day) => sum + day.todos.length, 0);
  const pathDone = (blocks || []).filter((block) => block.status === 'Done').length;
  const pathTotal = (blocks || []).length;
  const prevPathDone = (prevBlocks || []).filter((block) => block.status === 'Done').length;
  const prevPathTotal = (prevBlocks || []).length;
  const done = todoDone + completed.length + pathDone;
  const total = todoTotal + completed.length + pathTotal;
  const prevDone = prevTodoDone + prevCompleted.length + prevPathDone;
  const prevTotal = prevTodoTotal + prevCompleted.length + prevPathTotal;
  if (!total && !prevTotal) return emptyCard('execution', 'Εκτέλεση', 'Tasks · Path');
  const rate = pct(done, total);
  return {
    id: 'execution',
    title: 'Εκτέλεση',
    eyebrow: 'Close rate',
    hasData: total > 0,
    primary: rate,
    primarySuffix: '%',
    delta: formatDelta(deltaOf(rate, pct(prevDone, prevTotal)), { suffix: 'μ.μ.' }),
    rows: [
      { label: 'Todos', value: todoTotal ? `${todoDone}/${todoTotal}` : '—', delta: null },
      { label: 'Checkpoints', value: String(completed.length), delta: formatDelta(deltaOf(completed.length, prevCompleted.length)) },
      { label: 'Path blocks', value: pathTotal ? `${pathDone}/${pathTotal}` : '—', delta: null },
    ],
    notes: [],
  };
}

function summarizeRoutines(days, templates, periodDays) {
  const list = normalizeRoutineTemplates(templates);
  if (!list.length) return emptyCard('routines', 'Routines', 'Πρωί · Μέρα · Βράδυ');
  const windowSize = Math.max(1, periodDays);
  const stacks = ROUTINE_STACK_ORDER.map((id) => {
    let closed = 0;
    let active = 0;
    for (const day of days) {
      const merged = mergeDayRoutines(list, day.routines);
      const group = groupRoutinesByStack(merged, { includeEmpty: true }).find((item) => item.id === id);
      const items = group?.items || [];
      if (!items.length) continue;
      active += 1;
      if (items.every((item) => item.done)) closed += 1;
    }
    return {
      id,
      label: ROUTINE_STACKS[id].label,
      closed,
      active,
    };
  });
  const scored = days.filter((day) => {
    const score = getRoutineDayScore(list, day.routines);
    return score.total > 0 && score.done === score.total;
  }).length;
  return {
    id: 'routines',
    title: 'Routines',
    eyebrow: `Πρωί · Μέρα · Βράδυ / ${windowSize}`,
    hasData: true,
    primary: scored,
    primarySuffix: `/${windowSize}`,
    delta: null,
    rows: stacks.map((stack) => ({
      label: stack.label,
      value: `${stack.closed}/${stack.active || windowSize}`,
      delta: null,
    })),
    notes: [],
  };
}

function summarizeEnergy(days, prevDays) {
  const score = seriesStats(days, 'dayScore');
  const prev = seriesStats(prevDays, 'dayScore');
  const recovery = days.filter((day) => day.capacityLabel === 'Recovery').length;
  if (score.avg == null && !recovery) return emptyCard('energy', 'Ενέργεια', 'Day score · Recovery');
  const display = score.avg != null ? round(score.avg / 10, 1) : null;
  const prevDisplay = prev.avg != null ? round(prev.avg / 10, 1) : null;
  return {
    id: 'energy',
    title: 'Ενέργεια',
    eyebrow: 'Day score + Recovery',
    hasData: true,
    primary: display,
    primarySuffix: display != null ? '/10' : '',
    delta: formatDelta(deltaOf(display, prevDisplay), { digits: 1 }),
    rows: [
      row('Μέσος', display, prevDisplay, { digits: 1, suffix: '/10' }),
      { label: 'Recovery μέρες', value: String(recovery), delta: formatDelta(deltaOf(recovery, prevDays.filter((day) => day.capacityLabel === 'Recovery').length)) },
    ],
    notes: [],
  };
}

function summarizeFocus(days, prevDays, blocks, prevBlocks) {
  const deep = (blocks || []).filter((block) => block.blockType === 'Deep Work');
  const prevDeep = (prevBlocks || []).filter((block) => block.blockType === 'Deep Work');
  const doneHours = durationHours(deep.filter((block) => block.status === 'Done'));
  const plannedHours = durationHours(deep);
  const prevDoneHours = durationHours(prevDeep.filter((block) => block.status === 'Done'));
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
  if (!plannedHours && !threeTotal) return emptyCard('focus', 'Εστίαση', 'Deep Work · Today three');
  return {
    id: 'focus',
    title: 'Εστίαση',
    eyebrow: 'Deep Work + Today three',
    hasData: true,
    primary: round(doneHours, 1),
    primarySuffix: 'ω',
    delta: formatDelta(deltaOf(doneHours, prevDoneHours), { digits: 1, suffix: 'ω' }),
    rows: [
      { label: 'Deep Work', value: `${formatHours(doneHours) || '0ω'} / ${formatHours(plannedHours) || '0ω'}`, delta: null },
      { label: 'Today three', value: threeTotal ? `${threeDone}/${threeTotal}` : '—', delta: formatDelta(deltaOf(pct(threeDone, threeTotal), pct(prevThreeDone, prevThreeTotal)), { suffix: 'μ.μ.' }) },
    ],
    notes: [],
  };
}

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
    rows: [
      { label: 'Published', value: String(published), delta: formatDelta(deltaOf(published, prevPublished)) },
      { label: 'Κλήσεις', value: String(callStats.total), delta: formatDelta(deltaOf(callStats.total, prevCallStats.total)) },
      { label: 'Conversion', value: callStats.total ? `${callStats.conversionRate}%` : '—', delta: formatDelta(deltaOf(callStats.conversionRate, prevCallStats.conversionRate), { suffix: 'μ.μ.' }) },
    ],
    notes: [],
  };
}

function summarizeStuck(days, blocks, stages, obstacles) {
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
      rows: [],
      notes: ['Τίποτα εμφανές αυτή την περίοδο.'],
    };
  }
  return {
    id: 'stuck',
    title: 'Τι κόλλησε',
    eyebrow: 'Blockers · skipped · ύπνος',
    hasData: true,
    primary: blockers.length + skipped.length + lowSleep.length,
    primarySuffix: '',
    delta: null,
    rows: [
      { label: 'Blockers', value: String(blockers.length), delta: null },
      { label: 'Skipped/Moved', value: String(skipped.length), delta: null },
      { label: `Ύπνος < ${SLEEP_LOW}`, value: String(lowSleep.length), delta: null },
    ],
    notes: [
      ...blockers.slice(0, 3).map((item) => item.title),
      ...skipped.slice(0, 2).map((block) => block.title || 'Path block'),
    ].filter(Boolean),
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

function indexWeight(readings = []) {
  const map = {};
  for (const reading of readings) {
    const day = toDateString(reading?.day);
    const value = NUMBER(reading?.value);
    if (!day || value == null) continue;
    map[day] = value;
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
 * Build the 8 Life Summary cards for a week or month.
 */
export function summarizePeriod({
  kind = 'week',
  startDate,
  endDate,
  lifelineDays = {},
  selfHubDays = {},
  routineTemplates = [],
  pathBundle = null,
  projectActivity = [],
  stages = [],
  obstacles = [],
  brandItems = [],
  calls = [],
  ouraRows = [],
  weightReadings = [],
  waistReadings = [],
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
  const weightByDay = indexWeight(weightReadings);
  const waistByDay = indexWeight(waistReadings);
  const days = dates.map((date) => buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, waistByDay));
  const prevDays = prevDates.map((date) => buildDayHealth(date, lifelineDays, selfHubDays, ouraByDay, weightByDay, waistByDay));
  const blocks = blocksInDates(pathBundle?.blocks, dates);
  const prevBlocks = blocksInDates(pathBundle?.blocks, prevDates);
  const completed = completedInDates(projectActivity, dates);
  const prevCompleted = completedInDates(projectActivity, prevDates);
  const brand = publishedInRange(brandItems, range.startDate, range.endDate);
  const prevBrand = publishedInRange(brandItems, previous.startDate, previous.endDate);
  const periodCalls = callsInRange(calls, range.startDate, range.endDate);
  const prevCalls = callsInRange(calls, previous.startDate, previous.endDate);

  const cards = [
    summarizeBody(days, prevDays),
    summarizeWorkout(blocks, prevBlocks, dates),
    summarizeExecution(days, prevDays, blocks, prevBlocks, completed, prevCompleted),
    summarizeRoutines(days, routineTemplates, dates.length),
    summarizeEnergy(days, prevDays),
    summarizeFocus(days, prevDays, blocks, prevBlocks),
    summarizeOutward(brand, prevBrand, periodCalls, prevCalls),
    summarizeStuck(days, blocks, stages, obstacles),
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
