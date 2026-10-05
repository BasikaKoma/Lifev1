import { applyBlockStatus, applyBlockStatusMoment, createEmptyBlock } from './schema';

const YOGA_RE = /yoga|γιογκα/;
const MEDITATION_RE = /διαλογ|meditat|mindful/;
const WALKING_RE = /περπατ|walk/;
const RUNNING_RE = /τρεξ|runn/;
const STRENGTH_RE = /strength|δυναμ|βαρη|γυμναστ|σωμα|ποδι|προπον|weights|gym/;

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ω]/g, '');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function clockFromDate(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function minutesFromClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parsePayload(raw) {
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

function sameMinute(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return Math.abs(left.getTime() - right.getTime()) < 60000;
}

/** Path block → strength | yoga | meditation | walking | running, or null when it should stay manual. */
export function pathBlockActivityKind(block) {
  const text = compact(block?.title || '');
  if (YOGA_RE.test(text)) return 'yoga';
  if (block?.blockType === 'Meditation' || MEDITATION_RE.test(text)) return 'meditation';
  if (WALKING_RE.test(text)) return 'walking';
  if (RUNNING_RE.test(text)) return 'running';
  if (STRENGTH_RE.test(text)) return 'strength';
  return null;
}

/** Oura workout or session → the same kind, or null. */
export function ouraActivityKind(item, source) {
  const key = compact(item?.activity || item?.type || item?.label || '');
  if (!key) return null;
  if (key.includes('yoga') || key.includes('γιογκα')) return 'yoga';
  if (key.includes('meditat') || key.includes('διαλογ')) return 'meditation';
  if (source === 'session') return null;
  if (
    key === 'strength'
    || key.includes('strengthtrain')
    || key.includes('weightlifting')
    || key === 'crossfit'
    || key.includes('δυναμη')
  ) return 'strength';
  if (key === 'walking' || key === 'walk') return 'walking';
  if (key === 'running' || key === 'run') return 'running';
  return null;
}

function pushActivity(list, item, source) {
  const kind = ouraActivityKind(item, source);
  if (!kind) return;
  const start = item?.start_datetime ? new Date(item.start_datetime) : null;
  const end = item?.end_datetime ? new Date(item.end_datetime) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1 || minutes > 360) return;
  const id = item?.id
    ? `${source}:${item.id}`
    : `${source}:${kind}:${start.toISOString()}`;
  list.push({
    id,
    kind,
    day: localDayKey(start),
    startTime: clockFromDate(start),
    minutes,
    endIso: end.toISOString(),
    startMs: start.getTime(),
  });
}

function dedupeActivities(list) {
  const seen = new Set();
  return list.filter((activity) => {
    if (seen.has(activity.id)) return false;
    seen.add(activity.id);
    return true;
  });
}

/** Oura often splits one session into back-to-back records. Keep them as one window. */
export function mergeAdjacentActivities(activities, gapMinutes = 15) {
  const groups = new Map();
  for (const activity of [...activities].sort((a, b) => a.startMs - b.startMs)) {
    const key = `${activity.day}:${activity.kind}`;
    const list = groups.get(key) || [];
    const last = list[list.length - 1];
    const lastEnd = last ? last.startMs + last.minutes * 60000 : 0;
    const gap = last ? (activity.startMs - lastEnd) / 60000 : Infinity;
    if (last && gap <= gapMinutes && gap >= -1) {
      const endMs = Math.max(lastEnd, activity.startMs + activity.minutes * 60000);
      last.minutes = Math.round((endMs - last.startMs) / 60000);
      last.endIso = activity.endIso;
    } else {
      list.push({ ...activity });
    }
    groups.set(key, list);
  }
  return [...groups.values()].flat();
}

export function ouraActivitiesFromRows(rows) {
  const list = [];
  for (const row of rows || []) {
    const payload = parsePayload(row?.payload);
    for (const workout of payload.workouts || []) pushActivity(list, workout, 'workout');
    for (const session of payload.sessions || []) pushActivity(list, session, 'session');
  }
  return mergeAdjacentActivities(dedupeActivities(list));
}

function withWindow(block, activity) {
  return createEmptyBlock({
    ...block,
    startTime: activity.startTime,
    duration: activity.minutes,
    workedMinutes: activity.minutes,
    ouraActivityId: activity.id,
    completedAt: activity.endIso,
    statusAt: block.status === 'Done' ? activity.endIso : block.statusAt,
  });
}

function applyActivity(block, activity) {
  const base = block.status === 'Done'
    ? applyBlockStatusMoment(block, activity.endIso)
    : applyBlockStatus(block, 'Done', activity.endIso);
  return withWindow(base, activity);
}

function windowMatches(block, activity) {
  return block.startTime === activity.startTime
    && Number(block.duration) === activity.minutes
    && Number(block.workedMinutes) === activity.minutes
    && sameMinute(block.completedAt, activity.endIso);
}

function pickClosest(candidates, activity) {
  const target = minutesFromClock(activity.startTime);
  return [...candidates].sort((a, b) => {
    const aMin = minutesFromClock(a.startTime);
    const bMin = minutesFromClock(b.startTime);
    if (target != null && aMin != null && bMin != null) {
      const diff = Math.abs(aMin - target) - Math.abs(bMin - target);
      if (diff) return diff;
    } else if (aMin == null && bMin != null) return 1;
    else if (aMin != null && bMin == null) return -1;
    return (Number(a.order) || 0) - (Number(b.order) || 0);
  })[0] || null;
}

/**
 * Mark the matching block Done and set its clock to the Oura window.
 * Already-done blocks get the real hours. Skipped and moved blocks stay as they are.
 * A block the user moved back to Planned keeps its oura id and is not completed again.
 */
export function applyOuraActivitiesToBundle(bundle, rows) {
  if (!bundle?.blocks?.length) return { bundle, changed: false };
  const activities = ouraActivitiesFromRows(rows)
    .sort((a, b) => a.startMs - b.startMs);
  if (!activities.length) return { bundle, changed: false };

  const blocks = bundle.blocks.map((block) => block);
  let changed = false;

  const replace = (next) => {
    const index = blocks.findIndex((block) => block.id === next.id);
    if (index < 0) return;
    blocks[index] = next;
    changed = true;
  };

  for (const activity of activities) {
    const linked = blocks.find((block) => block.ouraActivityId === activity.id);
    if (linked) {
      if (linked.status === 'Done' && !windowMatches(linked, activity)) {
        replace(withWindow(applyBlockStatusMoment(linked, activity.endIso), activity));
      }
      continue;
    }

    const candidates = blocks.filter((block) => (
      block.date === activity.day
      && !block.ouraActivityId
      && (block.status === 'Planned' || block.status === 'Done')
      && pathBlockActivityKind(block) === activity.kind
    ));
    const block = pickClosest(candidates, activity);
    if (!block) continue;
    replace(applyActivity(block, activity));
  }

  if (!changed) return { bundle, changed: false };
  return { bundle: { ...bundle, blocks }, changed: true };
}
