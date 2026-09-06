import { parseOuraPayload } from './heartRateMetric';
import { parseDate } from './lifeline';
import { localTodayIsoDate } from './selfDateUtils';

/**
 * Builds small "event cards" placed along the Self hub day timeline.
 * Each event is positioned by its hour of the day and carries an icon + label.
 *
 * @typedef {'meal'|'routine'|'pulse'|'note'|'idea'|'done'|'checkpoint'|'milestone'|'task'|'obstacle'|'resource'|'image'|'sticky'|'sleep'|'wake'|'workout'|'session'|'tag'|'path'} SelfTimelineEventType
 * @typedef {Object} SelfTimelineEvent
 * @property {string} id
 * @property {number} hour
 * @property {SelfTimelineEventType} type
 * @property {string} label
 * @property {string} typeLabel
 * @property {string} icon
 * @property {string} tone
 * @property {string|null} timeLabel
 */

/** Category registry — icon, tone and Greek label per event type. */
export const SELF_TIMELINE_EVENT_TYPES = {
  meal: { icon: 'meal', tone: 'amber', typeLabel: 'Γεύμα', priority: 6 },
  routine: { icon: 'routine', tone: 'emerald', typeLabel: 'Ρουτίνα', priority: 7 },
  pulse: { icon: 'pulse', tone: 'rose', typeLabel: 'Έντονοι παλμοί', priority: 5 },
  note: { icon: 'note', tone: 'sky', typeLabel: 'Σημείωση', priority: 9 },
  idea: { icon: 'idea', tone: 'violet', typeLabel: 'Ιδέα', priority: 10 },
  done: { icon: 'checkCircle', tone: 'emerald', typeLabel: 'Ολοκληρώθηκε', priority: 3 },
  checkpoint: { icon: 'checkCircle', tone: 'emerald', typeLabel: 'Checkpoint complete', priority: 2 },
  milestone: { icon: 'flag', tone: 'gold', typeLabel: 'Milestone', priority: 1 },
  task: { icon: 'checkCircle', tone: 'sky', typeLabel: 'Task', priority: 3 },
  obstacle: { icon: 'obstacle', tone: 'rose', typeLabel: 'Obstacle', priority: 2 },
  resource: { icon: 'resource', tone: 'violet', typeLabel: 'Resource', priority: 4 },
  image: { icon: 'image', tone: 'sky', typeLabel: 'Εικόνα', priority: 8 },
  sticky: { icon: 'note', tone: 'amber', typeLabel: 'Σημείωση', priority: 9 },
  sleep: { icon: 'moon', tone: 'indigo', typeLabel: 'Ύπνος', priority: 1 },
  wake: { icon: 'sun', tone: 'gold', typeLabel: 'Ξύπνημα', priority: 0 },
  workout: { icon: 'workout', tone: 'orange', typeLabel: 'Προπόνηση', priority: 3 },
  session: { icon: 'aura', tone: 'violet', typeLabel: 'Session', priority: 4 },
  tag: { icon: 'tag', tone: 'sky', typeLabel: 'Tag', priority: 8 },
  path: { icon: 'checkCircle', tone: 'emerald', typeLabel: 'Path', priority: 3 },
};

const WORKOUT_LABELS = {
  walking: 'Περπάτημα',
  running: 'Τρέξιμο',
  cycling: 'Ποδήλατο',
  swimming: 'Κολύμβηση',
  strength: 'Δύναμη',
  yoga: 'Yoga',
  dancing: 'Χορός',
  hiking: 'Πεζοπορία',
  workout: 'Προπόνηση',
  elliptical: 'Ελλειπτικό',
  rower: 'Κωπηλασία',
};

const SESSION_LABELS = {
  meditation: 'Διαλογισμός',
  breathing: 'Αναπνοές',
  nap: 'Υπνάκος',
  relaxation: 'Χαλάρωση',
  rest: 'Ξεκούραση',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hourFromHm(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h + m / 60;
}

function localDateFromIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function hourFromIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function hmFromHour(hour) {
  const clamped = Math.max(0, Math.min(24, hour));
  const h = Math.min(23, Math.floor(clamped));
  const m = Math.round((clamped - Math.floor(clamped)) * 60) % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function truncate(text, max = 22) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function humanizeKey(value, map, fallback) {
  if (!value) return fallback;
  const key = String(value).toLowerCase().replace(/[_\s-]+/g, '');
  if (map[key]) return map[key];
  return String(value).replace(/[_-]+/g, ' ');
}

function makeEvent(type, { id, hour, label, timeLabel, typeLabel }) {
  const config = SELF_TIMELINE_EVENT_TYPES[type];
  if (!config || hour == null || !Number.isFinite(hour)) return null;
  return {
    id,
    hour: Math.max(0, Math.min(24, hour)),
    type,
    label: truncate(label || config.typeLabel),
    typeLabel: typeLabel || config.typeLabel,
    icon: config.icon,
    tone: config.tone,
    timeLabel: timeLabel ?? hmFromHour(hour),
  };
}

/** Clip an ISO interval onto a local calendar day, returning hours 0–24. */
function intervalOnDate(startIso, endIso, dateStr) {
  if (!startIso || !endIso || !dateStr) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const dayStart = parseDate(dateStr);
  if (!dayStart) return null;
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const clipStart = start < dayStart ? dayStart : start;
  const clipEnd = end > dayEnd ? dayEnd : end;
  if (clipEnd <= clipStart) return null;
  return {
    startHour: (clipStart.getTime() - dayStart.getTime()) / 3600000,
    endHour: (clipEnd.getTime() - dayStart.getTime()) / 3600000,
    startOnDate: start >= dayStart && start < dayEnd,
    endOnDate: end >= dayStart && end < dayEnd,
  };
}

function makeSegment(tone, start, end, label) {
  if (end - start < 0.08) return null;
  return { start, end, tone, label };
}

function routineEvents(routines) {
  if (!Array.isArray(routines)) return [];
  const events = [];
  for (const routine of routines) {
    if (!routine?.done) continue;
    const hour = hourFromHm(routine.time);
    if (hour == null) continue;
    const isMeal = /γευμα|φαγητ|breakfast|lunch|dinner|meal|πρωιν|μεσημερ|βραδιν|σνακ|snack/i.test(
      routine.label || '',
    );
    const event = makeEvent(isMeal ? 'meal' : 'routine', {
      id: `routine-${routine.id}`,
      hour,
      label: routine.label,
      timeLabel: routine.time,
    });
    if (event) events.push(event);
  }
  return events;
}

function noteEvents(notes) {
  if (!Array.isArray(notes)) return [];
  const events = [];
  for (const note of notes) {
    const hour = hourFromIso(note?.timestamp || note?.completedAt);
    if (hour == null) continue;
    const title = note.title || note.projectTitle || 'Σημείωση';
    const isIdea = /ιδεα|idea|brainstorm|concept|σκεψη/i.test(title);
    const event = makeEvent(isIdea ? 'idea' : 'note', {
      id: `note-${note.id}`,
      hour,
      label: title,
    });
    if (event) events.push(event);
  }
  return events;
}

function hourFromTimestamp(iso, dateStr) {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (dateStr && dateStr === localTodayIsoDate()) return currentHourForDate(dateStr);
    return 12;
  }
  return hourFromIso(iso);
}

function completedEvents(completed, dateStr) {
  if (!Array.isArray(completed)) return [];
  const events = [];
  for (const item of completed) {
    const hour = hourFromTimestamp(item?.completedAt || item?.timestamp, dateStr);
    if (hour == null) continue;
    const type = SELF_TIMELINE_EVENT_TYPES[item.kind] ? item.kind : 'done';
    const eventId = `${type}-${String(item.id).split(':').pop()}`;
    const event = makeEvent(type, {
      id: eventId,
      hour,
      label: item.title,
      timeLabel: item.timeLabel || hmFromHour(hour),
      typeLabel: item.kind === 'path' && item.status ? item.status : undefined,
    });
    if (event) events.push(event);
  }
  return events;
}

function pulseEvents(heartRate, ouraSamples, sleepWindows = []) {
  const samples = Array.isArray(ouraSamples) && ouraSamples.length >= 4
    ? ouraSamples
    : heartRate?.chart?.samples;
  if (!Array.isArray(samples) || samples.length < 4) return [];

  const bpms = samples.map((s) => s.bpm).filter((b) => Number.isFinite(b));
  if (!bpms.length) return [];

  const avg = bpms.reduce((sum, b) => sum + b, 0) / bpms.length;
  const max = Math.max(...bpms);
  const threshold = Math.max(avg + 18, 100, avg + (max - avg) * 0.6);

  const candidates = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample.bpm) || sample.bpm < threshold) continue;
    const hour = hourFromIso(sample.timestamp);
    if (hour == null) continue;
    if (sleepWindows.some((w) => hour >= w.start && hour <= w.end)) continue;
    candidates.push({ hour, bpm: Math.round(sample.bpm), iso: sample.timestamp });
  }
  if (!candidates.length) return [];

  candidates.sort((a, b) => b.bpm - a.bpm);
  const picked = [];
  for (const candidate of candidates) {
    if (picked.length >= 3) break;
    if (picked.some((p) => Math.abs(p.hour - candidate.hour) < 0.75)) continue;
    picked.push(candidate);
  }

  return picked.map((peak) =>
    makeEvent('pulse', {
      id: `pulse-${peak.iso}`,
      hour: peak.hour,
      label: `${peak.bpm} bpm`,
      timeLabel: hmFromHour(peak.hour),
    }),
  );
}

function sleepEventsAndSegments(sessions, dateStr) {
  const events = [];
  const segments = [];
  const windows = [];
  if (!Array.isArray(sessions)) return { events, segments, windows };

  sessions.forEach((session, index) => {
    const startIso = session?.bedtime_start;
    const endIso = session?.bedtime_end;
    const clip = intervalOnDate(startIso, endIso, dateStr);
    if (!clip) return;

    const type = String(session?.type || '').toLowerCase();
    const isNap = type.includes('nap') || type === 'rest';
    const durationMin = Math.round((clip.endHour - clip.startHour) * 60);
    const durationLabel = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}ώ ${durationMin % 60}λ`
      : `${durationMin}λ`;
    const sleepLabel = isNap ? 'Υπνάκος' : 'Ύπνος';

    const segment = makeSegment(
      'sleep',
      clip.startHour,
      clip.endHour,
      `${sleepLabel} · ${durationLabel}`,
    );
    if (segment) {
      segments.push(segment);
      windows.push({ start: clip.startHour, end: clip.endHour });
    }

    if (clip.startOnDate) {
      const event = makeEvent('sleep', {
        id: `sleep-start-${session.id || startIso || index}`,
        hour: clip.startHour,
        label: sleepLabel,
        timeLabel: hmFromHour(clip.startHour),
      });
      if (event) events.push(event);
    }

    if (clip.endOnDate) {
      const event = makeEvent('wake', {
        id: `wake-${session.id || endIso || index}`,
        hour: clip.endHour,
        label: isNap ? 'Τέλος υπνάκου' : 'Ξύπνημα',
        timeLabel: hmFromHour(clip.endHour),
      });
      if (event) events.push(event);
    }
  });

  return { events, segments, windows };
}

function rangedOuraEvents(items, { type, dateStr, idPrefix, labelOf, tone }) {
  const events = [];
  const segments = [];
  if (!Array.isArray(items)) return { events, segments };

  items.forEach((item, index) => {
    const startIso = item?.start_datetime || item?.start_time || item?.timestamp;
    const endIso = item?.end_datetime || item?.end_time || startIso;
    const clip = intervalOnDate(startIso, endIso || startIso, dateStr);
    const hour = clip?.startOnDate
      ? clip.startHour
      : localDateFromIso(startIso) === dateStr
        ? hourFromIso(startIso)
        : null;
    if (hour == null) return;

    const label = labelOf(item);
    const event = makeEvent(type, {
      id: `${idPrefix}-${item.id || startIso || index}`,
      hour,
      label,
      timeLabel: hmFromHour(hour),
    });
    if (event) events.push(event);

    if (clip && clip.endHour - clip.startHour >= 0.12) {
      const segment = makeSegment(tone, clip.startHour, clip.endHour, label);
      if (segment) segments.push(segment);
    }
  });

  return { events, segments };
}

function tagEvents(tags, dateStr) {
  if (!Array.isArray(tags)) return [];
  const events = [];
  tags.forEach((tag, index) => {
    const iso = tag?.timestamp || tag?.start_time || tag?.start_datetime;
    if (localDateFromIso(iso) !== dateStr) return;
    const hour = hourFromIso(iso);
    if (hour == null) return;
    const text = tag?.text
      || (Array.isArray(tag?.tags) ? tag.tags.filter(Boolean).join(', ') : '')
      || tag?.comment
      || 'Tag';
    const event = makeEvent('tag', {
      id: `tag-${tag.id || iso || index}`,
      hour,
      label: text,
    });
    if (event) events.push(event);
  });
  return events;
}

function ouraTimelineFromRow(ouraRow, dateStr) {
  const empty = { events: [], segments: [], windows: [], samples: [] };
  if (!ouraRow) return empty;

  const payload = parseOuraPayload(ouraRow.payload);
  const sleep = sleepEventsAndSegments(payload.sleep_sessions, dateStr);

  const workouts = rangedOuraEvents(payload.workouts, {
    type: 'workout',
    dateStr,
    idPrefix: 'workout',
    tone: 'workout',
    labelOf: (item) => humanizeKey(item?.activity || item?.label, WORKOUT_LABELS, 'Προπόνηση'),
  });

  const sessions = rangedOuraEvents(payload.sessions, {
    type: 'session',
    dateStr,
    idPrefix: 'session',
    tone: 'session',
    labelOf: (item) => humanizeKey(item?.type || item?.mood, SESSION_LABELS, 'Session'),
  });

  return {
    events: [
      ...sleep.events,
      ...workouts.events,
      ...sessions.events,
      ...tagEvents(payload.tags, dateStr),
    ],
    segments: [...sleep.segments, ...workouts.segments, ...sessions.segments],
    windows: sleep.windows,
    samples: Array.isArray(payload.heart_rate_samples) ? payload.heart_rate_samples : [],
  };
}

function capEvents(events, limit) {
  if (events.length <= limit) return events;
  return [...events]
    .sort((a, b) => {
      const pa = SELF_TIMELINE_EVENT_TYPES[a.type]?.priority ?? 20;
      const pb = SELF_TIMELINE_EVENT_TYPES[b.type]?.priority ?? 20;
      if (pa !== pb) return pa - pb;
      return a.hour - b.hour;
    })
    .slice(0, limit)
    .sort((a, b) => a.hour - b.hour);
}

/**
 * @param {Object} params
 * @param {Array} [params.routines]
 * @param {Object} [params.projectDay]
 * @param {Object} [params.heartRate]
 * @param {Object|null} [params.ouraRow]
 * @param {string} [params.date]
 * @param {number} [params.limit]
 * @returns {{ events: SelfTimelineEvent[], segments: import('./selfHubSchema').SelfHubDaySegment[] }}
 */
export function buildSelfHubTimelineEvents({
  routines = [],
  projectDay = null,
  heartRate = null,
  ouraRow = null,
  date = localTodayIsoDate(),
  limit = 18,
} = {}) {
  const oura = ouraTimelineFromRow(ouraRow, date);
  const events = [
    ...oura.events,
    ...routineEvents(routines),
    ...noteEvents(projectDay?.notes),
    ...completedEvents(projectDay?.completed, date),
    ...pulseEvents(heartRate, oura.samples, oura.windows),
  ];

  const seen = new Set();
  const deduped = events.filter((event) => {
    if (!event || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  return {
    events: capEvents(deduped, limit),
    segments: oura.segments,
  };
}

export function normalizeTimelineSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const events = Array.isArray(raw.events)
    ? raw.events.filter((event) => event?.id && Number.isFinite(event.hour))
    : [];
  const segments = Array.isArray(raw.segments)
    ? raw.segments.filter((seg) => Number.isFinite(seg?.start) && Number.isFinite(seg?.end) && seg.end > seg.start)
    : [];
  if (!events.length && !segments.length) return null;
  return {
    events,
    segments,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
    currentHour: typeof raw.currentHour === 'number' && Number.isFinite(raw.currentHour)
      ? raw.currentHour
      : null,
  };
}

export function timelineSnapshotSignature(snapshot) {
  const normalized = normalizeTimelineSnapshot(snapshot);
  if (!normalized) return '';
  return JSON.stringify({
    events: normalized.events.map((event) => [event.id, event.hour, event.label, event.type]),
    segments: normalized.segments.map((seg) => [seg.start, seg.end, seg.tone]),
  });
}

/** Progress head: live clock for today, full bar for archived days. */
export function currentHourForDate(dateStr, now = new Date()) {
  if (dateStr && dateStr !== localTodayIsoDate()) return 24;
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

export function createDayProgressModel({ date, segments = [], currentHour } = {}) {
  return {
    currentHour: currentHour ?? currentHourForDate(date),
    markers: ['12AM', '6AM', '12PM', '6PM', '12AM'],
    segments,
    referenceTime: null,
  };
}

/**
 * Live rebuild from Oura + day logs; fall back to the archived snapshot
 * so past Lifeline days keep their timeline even without a fresh fetch.
 */
export function resolveDayTimeline({
  date = localTodayIsoDate(),
  ouraRow = null,
  routines = [],
  projectDay = null,
  heartRate = null,
  archived = null,
  limit = 18,
} = {}) {
  const live = buildSelfHubTimelineEvents({
    routines,
    projectDay,
    heartRate,
    ouraRow,
    date,
    limit,
  });
  const hasLive = live.events.length > 0 || live.segments.length > 0;
  if (hasLive) {
    return {
      events: live.events,
      segments: live.segments,
      source: 'live',
    };
  }

  const stored = normalizeTimelineSnapshot(archived);
  if (stored) {
    return {
      events: stored.events,
      segments: stored.segments,
      source: 'archive',
    };
  }

  return { events: [], segments: [], source: 'none' };
}
