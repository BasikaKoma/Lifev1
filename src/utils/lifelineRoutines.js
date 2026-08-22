import { generateId } from '../data/templates';
import { addDays, toDateString } from './lifeline';

export const ROUTINE_STACKS = {
  morning: { id: 'morning', label: 'Πρωί', defaultTime: '07:30' },
  day: { id: 'day', label: 'Μέρα', defaultTime: '13:00' },
  evening: { id: 'evening', label: 'Βράδυ', defaultTime: '21:30' },
};

export const ROUTINE_STACK_ORDER = ['morning', 'day', 'evening'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function localTimeHm(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function parseTimeMinutes(value) {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value.trim())) return null;
  const [hours, minutes] = value.trim().split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function inferRoutineStack(defaultTime = '', explicitStack = '') {
  if (explicitStack && ROUTINE_STACKS[explicitStack]) return explicitStack;
  const minutes = parseTimeMinutes(defaultTime);
  if (minutes == null) return 'morning';
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'day';
  return 'evening';
}

export function normalizeRoutineLog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!id || typeof entry !== 'object') continue;
    out[id] = {
      done: entry.done === true,
      time: typeof entry.time === 'string' ? entry.time : '',
    };
  }
  return out;
}

export function createRoutineTemplate(label = '', defaultTimeOrOpts = '') {
  const opts = typeof defaultTimeOrOpts === 'string' || defaultTimeOrOpts == null
    ? { defaultTime: defaultTimeOrOpts || '' }
    : defaultTimeOrOpts;
  const stack = inferRoutineStack(opts.defaultTime, opts.stack);
  const defaultTime = String(opts.defaultTime || '').trim() || ROUTINE_STACKS[stack].defaultTime;
  return {
    id: opts.id || `routine-${generateId()}`,
    label: String(label || '').trim(),
    defaultTime,
    stack,
  };
}

export function normalizeRoutineTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => createRoutineTemplate(item?.label, {
      id: item?.id,
      defaultTime: item?.defaultTime,
      stack: item?.stack,
    }))
    .filter((item) => item.label);
}

export function routineTemplatesEqual(a, b) {
  return JSON.stringify(normalizeRoutineTemplates(a))
    === JSON.stringify(normalizeRoutineTemplates(b));
}

export function mergeDayRoutines(templates, routineLog) {
  const log = normalizeRoutineLog(routineLog);
  return normalizeRoutineTemplates(templates).map((template) => ({
    ...template,
    done: log[template.id]?.done === true,
    time: log[template.id]?.time || template.defaultTime || '',
  }));
}

export function groupRoutinesByStack(dayRoutines, { includeEmpty = false } = {}) {
  const groups = Object.fromEntries(ROUTINE_STACK_ORDER.map((id) => [id, []]));
  for (const routine of dayRoutines || []) {
    const stack = ROUTINE_STACKS[routine.stack] ? routine.stack : 'morning';
    groups[stack].push(routine);
  }
  return ROUTINE_STACK_ORDER
    .map((id) => ({ ...ROUTINE_STACKS[id], items: groups[id] }))
    .filter((group) => includeEmpty || group.items.length > 0);
}

export function toggleRoutineDone(log, template, done) {
  const current = normalizeRoutineLog(log)[template.id] || { done: false, time: '' };
  const nextDone = done ?? !current.done;
  return {
    ...normalizeRoutineLog(log),
    [template.id]: {
      done: nextDone,
      time: nextDone ? (current.time || localTimeHm()) : current.time,
    },
  };
}

export function getRoutineDayScore(templates, routineLog) {
  const items = mergeDayRoutines(templates, routineLog);
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total,
    label: total > 0 ? `${done}/${total}` : '',
  };
}

export function getRoutineWeekScore(lifelineDays, templates, endDate, getEntry) {
  const total = normalizeRoutineTemplates(templates).length;
  if (!total) return { closed: 0, window: 7, label: '' };

  const end = toDateString(endDate);
  let closed = 0;
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(end, -i);
    const entry = getEntry ? getEntry(date) : lifelineDays?.[date];
    const score = getRoutineDayScore(templates, entry?.routines);
    if (score.total > 0 && score.done === score.total) closed += 1;
  }
  return { closed, window: 7, label: `${closed}/7` };
}
