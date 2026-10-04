import { generateId } from '../data/templates';

export const RHYTHM_WEEKDAYS = [
  { value: 1, short: 'Δε', label: 'Δευτέρα' },
  { value: 2, short: 'Τρ', label: 'Τρίτη' },
  { value: 3, short: 'Τε', label: 'Τετάρτη' },
  { value: 4, short: 'Πε', label: 'Πέμπτη' },
  { value: 5, short: 'Πα', label: 'Παρασκευή' },
  { value: 6, short: 'Σα', label: 'Σάββατο' },
  { value: 7, short: 'Κυ', label: 'Κυριακή' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function rhythmToday(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function rhythmClock(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function weekdayFromIso(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function normalizeWeekdays(raw, cadence) {
  const list = [...new Set(
    (Array.isArray(raw) ? raw : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7),
  )].sort((a, b) => a - b);
  if (cadence === 'weekly') return [list[0] || 1];
  return list;
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${match[1]}:${match[2]}`;
}

export function shiftRhythmDate(isoDate, days) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return rhythmToday();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + Number(days || 0));
  return rhythmToday(date);
}

const RHYTHM_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

export function rhythmDayLabel(isoDate, now = new Date()) {
  const today = rhythmToday(now);
  if (isoDate === today) return 'Σήμερα';
  if (isoDate === shiftRhythmDate(today, -1)) return 'Χθες';
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const weekday = RHYTHM_WEEKDAYS.find((day) => day.value === weekdayFromIso(isoDate));
  const month = RHYTHM_MONTHS[Number(match[2]) - 1] || '';
  return `${weekday?.label || ''} ${Number(match[3])} ${month}`.trim();
}

export function createRhythmItem(label = '', overrides = {}) {
  const cadence = overrides.cadence === 'weekly' ? 'weekly' : 'daily';
  return {
    id: overrides.id || `rhythm-${generateId()}`,
    label: String(label || '').trim(),
    cadence,
    weekdays: normalizeWeekdays(overrides.weekdays, cadence),
    defaultTime: normalizeTime(overrides.defaultTime),
    enabled: overrides.enabled !== false,
  };
}

function normalizeLogEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    done: raw.done === true,
    time: typeof raw.time === 'string' ? raw.time : '',
  };
}

export function emptyProjectRhythm() {
  return { items: [], logs: {} };
}

export function normalizeProjectRhythm(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const items = (Array.isArray(source.items) ? source.items : [])
    .map((item) => createRhythmItem(item?.label, item))
    .filter((item) => item.label);
  const ids = new Set(items.map((item) => item.id));
  const logs = {};
  const rawLogs = source.logs && typeof source.logs === 'object' && !Array.isArray(source.logs)
    ? source.logs
    : {};
  for (const [date, day] of Object.entries(rawLogs)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object' || Array.isArray(day)) continue;
    const nextDay = {};
    for (const [id, entry] of Object.entries(day)) {
      if (!ids.has(id)) continue;
      const normalized = normalizeLogEntry(entry);
      if (normalized) nextDay[id] = normalized;
    }
    if (Object.keys(nextDay).length) logs[date] = nextDay;
  }
  return { items, logs };
}

/** Monday of the week that contains isoDate. Weekly checks are stored on this day. */
export function weekStartIso(isoDate) {
  const weekday = weekdayFromIso(isoDate);
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!weekday || !match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() - (weekday - 1));
  return rhythmToday(date);
}

export function rhythmLogKey(item, isoDate) {
  if (item?.cadence === 'weekly') return weekStartIso(isoDate);
  return isoDate || null;
}

export function presentRhythmItem(rhythm, item, isoDate) {
  const data = normalizeProjectRhythm(rhythm);
  const key = rhythmLogKey(item, isoDate);
  const entry = key ? data.logs[key]?.[item.id] : null;
  return {
    ...item,
    done: entry?.done === true,
    time: entry?.time || '',
  };
}

export function isRhythmDue(item, isoDate) {
  if (!item || item.enabled === false) return false;
  const weekday = weekdayFromIso(isoDate);
  if (!weekday) return false;
  if (item.cadence === 'weekly') return item.weekdays[0] === weekday;
  if (!item.weekdays?.length) return true;
  return item.weekdays.includes(weekday);
}

function sortRhythmItems(items) {
  return [...items].sort((a, b) => {
    const time = (a.defaultTime || '99:99').localeCompare(b.defaultTime || '99:99');
    if (time) return time;
    return a.label.localeCompare(b.label, 'el');
  });
}

export function dueRhythmItems(rhythm, isoDate) {
  const data = normalizeProjectRhythm(rhythm);
  return sortRhythmItems(data.items.filter((item) => isRhythmDue(item, isoDate)))
    .map((item) => presentRhythmItem(data, item, isoDate));
}

export function weeklyItemsForWeek(rhythm, isoDate) {
  const data = normalizeProjectRhythm(rhythm);
  return sortRhythmItems(data.items.filter((item) => item.cadence === 'weekly' && item.enabled !== false))
    .map((item) => presentRhythmItem(data, item, isoDate));
}

export function rhythmDayScore(rhythm, isoDate) {
  const daily = dueRhythmItems(rhythm, isoDate).filter((item) => item.cadence !== 'weekly');
  const weekly = weeklyItemsForWeek(rhythm, isoDate);
  const items = [...daily, ...weekly];
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, label: items.length ? `${done}/${items.length}` : '' };
}

export function weekdayLabel(value) {
  return RHYTHM_WEEKDAYS.find((day) => day.value === value)?.label || '';
}

export function addRhythmItem(rhythm, draft) {
  const data = normalizeProjectRhythm(rhythm);
  const item = createRhythmItem(draft?.label, draft);
  if (!item.label) return data;
  return { ...data, items: [...data.items, item] };
}

export function patchRhythmItem(rhythm, itemId, patch) {
  const data = normalizeProjectRhythm(rhythm);
  return {
    ...data,
    items: data.items.map((item) => {
      if (item.id !== itemId) return item;
      return createRhythmItem(
        patch.label !== undefined ? patch.label : item.label,
        {
          id: item.id,
          cadence: patch.cadence ?? item.cadence,
          weekdays: patch.weekdays ?? item.weekdays,
          defaultTime: patch.defaultTime ?? item.defaultTime,
          enabled: patch.enabled ?? item.enabled,
        },
      );
    }).filter((item) => item.label),
  };
}

export function removeRhythmItem(rhythm, itemId) {
  const data = normalizeProjectRhythm(rhythm);
  const logs = {};
  for (const [date, day] of Object.entries(data.logs)) {
    const nextDay = { ...day };
    delete nextDay[itemId];
    if (Object.keys(nextDay).length) logs[date] = nextDay;
  }
  return {
    items: data.items.filter((item) => item.id !== itemId),
    logs,
  };
}

export function toggleRhythmDone(rhythm, itemId, isoDate, done, now = new Date()) {
  const data = normalizeProjectRhythm(rhythm);
  const item = data.items.find((entry) => entry.id === itemId);
  const key = item ? rhythmLogKey(item, isoDate) : null;
  if (!item || !key) return data;
  const day = data.logs[key] || {};
  const current = day[itemId] || { done: false, time: '' };
  const nextDone = done ?? !current.done;
  const stamp = isoDate === rhythmToday(now) ? rhythmClock(now) : (item.defaultTime || '');
  return {
    ...data,
    logs: {
      ...data.logs,
      [key]: {
        ...day,
        [itemId]: {
          done: nextDone,
          time: nextDone ? (current.time || stamp) : current.time,
        },
      },
    },
  };
}

export function setRhythmDoneTime(rhythm, itemId, isoDate, time) {
  const data = normalizeProjectRhythm(rhythm);
  const item = data.items.find((entry) => entry.id === itemId);
  const key = item ? rhythmLogKey(item, isoDate) : null;
  if (!item || !key) return data;
  const day = data.logs[key] || {};
  const current = day[itemId];
  if (!current?.done) return data;
  return {
    ...data,
    logs: {
      ...data.logs,
      [key]: {
        ...day,
        [itemId]: { done: true, time: normalizeTime(time) },
      },
    },
  };
}
