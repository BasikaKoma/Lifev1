import { generateId } from '../data/templates';
import { isItemDone } from './archive';
import { toDateString, parseDate } from './lifeline';

import { normalizeDayMetrics } from './lifelineSelfMetrics';
import { normalizeSelfHubDayEntry } from './selfHubDays';
import { normalizeRoutineLog } from './lifelineRoutines';
import { normalizeTimelineSnapshot } from './selfHubTimelineEvents';

export {
  createRoutineTemplate,
  normalizeRoutineTemplates,
  routineTemplatesEqual,
  mergeDayRoutines,
  groupRoutinesByStack,
  toggleRoutineDone,
  getRoutineDayScore,
  getRoutineWeekScore,
  localTimeHm,
  ROUTINE_STACKS,
  ROUTINE_STACK_ORDER,
} from './lifelineRoutines';

function normalizeProjectSnapshotArchive(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mapItems = (items) =>
    Array.isArray(items)
      ? items.filter((item) => item && typeof item === 'object' && item.id && item.title)
      : [];
  return {
    completed: mapItems(raw.completed),
    notes: mapItems(raw.notes),
    scheduled: mapItems(raw.scheduled),
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : null,
  };
}

function normalizeHubSnapshotArchive(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    deepWork: raw.deepWork,
    todayThree: raw.todayThree,
    nextAction: raw.nextAction,
    capacity: raw.capacity,
    summaryStrip: Array.isArray(raw.summaryStrip) ? raw.summaryStrip : undefined,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
  };
}

export function createEmptyDayEntry() {
  return {
    notes: '',
    todos: [],
    routines: {},
    metrics: null,
    projectSnapshot: null,
    hubSnapshot: null,
    timelineSnapshot: null,
    archivedAt: null,
    archivedFrom: null,
  };
}

export function createDayTodo(text = '') {
  return {
    id: `day-todo-${generateId()}`,
    text: text.trim(),
    done: false,
  };
}

export function getDayEntry(lifelineDays, dateStr) {
  const key = toDateString(dateStr);
  if (!key) return createEmptyDayEntry();
  const entry = lifelineDays?.[key];
  if (!entry || typeof entry !== 'object') return createEmptyDayEntry();
  return {
    notes: typeof entry.notes === 'string' ? entry.notes : '',
    todos: Array.isArray(entry.todos) ? entry.todos : [],
    routines: normalizeRoutineLog(entry.routines),
    metrics: normalizeDayMetrics(entry.metrics),
    projectSnapshot: normalizeProjectSnapshotArchive(entry.projectSnapshot),
    hubSnapshot: normalizeHubSnapshotArchive(entry.hubSnapshot),
    timelineSnapshot: normalizeTimelineSnapshot(entry.timelineSnapshot),
    archivedAt: typeof entry.archivedAt === 'string' ? entry.archivedAt : null,
    archivedFrom: typeof entry.archivedFrom === 'string' ? entry.archivedFrom : null,
  };
}

export function normalizeLifelineDays(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [date, entry] of Object.entries(raw)) {
    const key = toDateString(date);
    if (!key) continue;
    out[key] = {
      notes: typeof entry?.notes === 'string' ? entry.notes : '',
      todos: Array.isArray(entry?.todos)
        ? entry.todos.map((todo) => ({
            id: todo.id || `day-todo-${generateId()}`,
            text: todo.text || '',
            done: todo.done === true,
          }))
        : [],
      routines: normalizeRoutineLog(entry?.routines),
      metrics: normalizeDayMetrics(entry?.metrics),
      projectSnapshot: normalizeProjectSnapshotArchive(entry?.projectSnapshot),
      hubSnapshot: normalizeHubSnapshotArchive(entry?.hubSnapshot),
      timelineSnapshot: normalizeTimelineSnapshot(entry?.timelineSnapshot),
      archivedAt: typeof entry?.archivedAt === 'string' ? entry.archivedAt : null,
      archivedFrom: typeof entry?.archivedFrom === 'string' ? entry.archivedFrom : null,
    };
  }
  return out;
}

function pickRicherText(local, cloud) {
  const localText = typeof local === 'string' ? local.trim() : '';
  if (localText) return local;
  return typeof cloud === 'string' ? cloud : '';
}

function pickRicherList(local, cloud) {
  if (Array.isArray(local) && local.length) return local;
  return Array.isArray(cloud) ? cloud : [];
}

function pickRicherObject(local, cloud) {
  if (local && typeof local === 'object' && !Array.isArray(local) && Object.keys(local).length) {
    return local;
  }
  return cloud && typeof cloud === 'object' && !Array.isArray(cloud) ? cloud : null;
}

/** Merge one day so metrics-only local patches cannot wipe cloud notes/todos. */
export function mergeLifelineDayEntry(cloud, local) {
  if (!cloud) return local || createEmptyDayEntry();
  if (!local) return cloud;
  return {
    ...cloud,
    ...local,
    notes: pickRicherText(local.notes, cloud.notes),
    todos: pickRicherList(local.todos, cloud.todos),
    routines: pickRicherObject(local.routines, cloud.routines) || {},
    metrics: local.metrics || cloud.metrics || null,
    projectSnapshot: local.projectSnapshot || cloud.projectSnapshot || null,
    hubSnapshot: local.hubSnapshot || cloud.hubSnapshot || null,
    timelineSnapshot: pickRicherObject(local.timelineSnapshot, cloud.timelineSnapshot),
    archivedAt: local.archivedAt || cloud.archivedAt || null,
    archivedFrom: local.archivedFrom || cloud.archivedFrom || null,
  };
}

/** Union of day maps. Local wins on populated fields; empty local keeps cloud history. */
export function mergeLifelineDaysMaps(cloud = {}, local = {}) {
  const cloudDays = normalizeLifelineDays(cloud);
  const localDays = normalizeLifelineDays(local);
  const out = { ...cloudDays };
  for (const [date, entry] of Object.entries(localDays)) {
    out[date] = mergeLifelineDayEntry(cloudDays[date], entry);
  }
  return out;
}

export function patchDayEntry(lifelineDays, dateStr, patch) {
  const key = toDateString(dateStr);
  if (!key) return lifelineDays || {};
  const current = getDayEntry(lifelineDays, key);
  return {
    ...(lifelineDays || {}),
    [key]: { ...current, ...patch },
  };
}

export function patchMultipleDayEntries(lifelineDays, patchesByDate) {
  if (!patchesByDate || typeof patchesByDate !== 'object') return lifelineDays || {};
  let next = lifelineDays || {};
  for (const [dateStr, patch] of Object.entries(patchesByDate)) {
    next = patchDayEntry(next, dateStr, patch);
  }
  return next;
}

export function isTimestampOnDate(iso, dateStr) {
  if (!iso || !dateStr) return false;
  const target = toDateString(dateStr);
  if (!target) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return toDateString(iso) === target;
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return local === target;
}

export function mergeCompletedItems(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item?.id) continue;
      const key = item.kind
        ? `${item.kind}:${String(item.id).split(':').pop()}`
        : item.id;
      const prev = byKey.get(key);
      if (!prev || (item.completedAt && !prev.completedAt)) byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

export function collectCompletedCheckpointsFromStages(stages, dateStr, projectTitle = 'Project') {
  if (!Array.isArray(stages) || !stages.length) return [];
  return collectCompletedItemsForDate(
    [{ id: 'current', title: projectTitle, stages }],
    dateStr,
  );
}

function pushCompletedItem(items, item) {
  if (item?.title) items.push(item);
}

function itemActivityAt(item) {
  return item?.completedAt || item?.archivedAt || item?.updatedAt || null;
}

const TASK_DONE = new Set(['Done']);
const OBSTACLE_DONE = new Set(['Mitigated', 'Resolved']);
const RESOURCE_DONE = new Set(['Secured']);
const IDEA_DONE = new Set(['Executed']);

function isCanvasComplete(item, completeStatuses) {
  if (!item) return false;
  if (item.done || item.archived) return true;
  return completeStatuses.has(String(item.status || ''));
}

function timedCompletedItem(item) {
  const at = item.completedAt || item.timestamp;
  return {
    ...item,
    timeLabel: item.timeLabel || (at ? formatNoteClock(at) : ''),
  };
}

function collectCanvasCompleted(items, {
  kind,
  projectId,
  projectTitle,
  dateStr,
  completeStatuses,
  titleOf,
}) {
  const out = [];
  for (const item of items || []) {
    if (!isCanvasComplete(item, completeStatuses)) continue;
    const at = itemActivityAt(item);
    if (!isTimestampOnDate(at, dateStr)) continue;
    pushCompletedItem(out, timedCompletedItem({
      kind,
      id: `${projectId}:${kind}:${item.id}`,
      title: titleOf(item),
      projectTitle,
      stageTitle: null,
      completedAt: at,
    }));
  }
  return out;
}

function isStageComplete(stage) {
  return stage?.status === 'Done' || Boolean(stage?.done);
}

/** Prefer the stage stamp; otherwise the last finished checkpoint. */
function stageCompletedAt(stage) {
  if (stage?.completedAt) return stage.completedAt;
  if (stage?.archivedAt) return stage.archivedAt;
  let latest = 0;
  let latestIso = null;
  for (const checkpoint of stage?.checkpoints || []) {
    const iso = checkpoint?.completedAt || checkpoint?.archivedAt;
    if (!iso) continue;
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time) || time <= latest) continue;
    latest = time;
    latestIso = iso;
  }
  return latestIso;
}

/** Collect calendar dates with completed milestones, checkpoints, tasks, or notes across projects. */
export function collectLifelineActivityDates(projects) {
  const dates = new Set();
  if (!projects?.length) return dates;

  const addDate = (iso) => {
    const day = toDateString(iso);
    if (day) dates.add(day);
  };

  for (const project of projects) {
    for (const stage of project.stages || []) {
      if (isStageComplete(stage)) {
        addDate(stageCompletedAt(stage));
      }
      for (const checkpoint of stage.checkpoints || []) {
        if (!checkpoint.done && !checkpoint.archived) continue;
        addDate(checkpoint.completedAt || checkpoint.archivedAt);
      }
      for (const idea of stage.ideas || []) {
        if (!isCanvasComplete(idea, IDEA_DONE)) continue;
        addDate(itemActivityAt(idea));
      }
    }

    for (const note of project.notes || []) {
      if (!isItemDone(note)) continue;
      addDate(note.completedAt || note.archivedAt || note.updatedAt);
    }

    for (const task of project.canvasTasks || []) {
      if (!isCanvasComplete(task, TASK_DONE)) continue;
      addDate(itemActivityAt(task));
    }

    for (const obstacle of project.canvasObstacles || []) {
      if (!isCanvasComplete(obstacle, OBSTACLE_DONE)) continue;
      addDate(itemActivityAt(obstacle));
    }

    for (const resource of project.canvasResources || []) {
      if (!isCanvasComplete(resource, RESOURCE_DONE)) continue;
      addDate(itemActivityAt(resource));
    }

    for (const sticky of project.canvasStickies || []) {
      if (!isItemDone(sticky)) continue;
      addDate(itemActivityAt(sticky));
    }
  }

  return dates;
}

/**
 * Overlay the currently loaded project onto activity snapshots.
 * Lifeline stages stay out of "today in projects" work items, but its notes
 * (Inbox captures) must still appear in Self / day views.
 */
export function mergeLiveProjectActivity(projectActivity, liveProject) {
  if (!liveProject?.id) return projectActivity || [];

  const list = [...(projectActivity || [])];
  const idx = list.findIndex((project) => project.id === liveProject.id);
  const isLifeline = liveProject.isLifeline === true;
  const overlay = {
    id: liveProject.id,
    title: liveProject.title || (isLifeline ? 'Lifeline' : 'Project'),
    notes: liveProject.notes || [],
    canvasTasks: liveProject.canvasTasks || [],
    canvasObstacles: liveProject.canvasObstacles || [],
    canvasResources: liveProject.canvasResources || [],
    canvasStickies: liveProject.canvasStickies || [],
    stages: isLifeline ? [] : liveProject.stages || [],
  };

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...overlay,
      stages: isLifeline ? list[idx].stages || [] : overlay.stages,
    };
    return list;
  }

  list.push(overlay);
  return list;
}

/** Collect milestones, checkpoints, tasks, and notes completed on a given day across projects. */
export function collectCompletedItemsForDate(projects, dateStr) {
  const target = toDateString(dateStr);
  if (!target || !projects?.length) return [];

  const items = [];

  for (const project of projects) {
    const projectTitle = project.title || 'Project';

    for (const stage of project.stages || []) {
      if (isStageComplete(stage)) {
        const at = stageCompletedAt(stage);
        if (isTimestampOnDate(at, target)) {
          pushCompletedItem(items, timedCompletedItem({
            kind: 'milestone',
            id: `${project.id}:${stage.id}`,
            title: stage.title || 'Milestone',
            projectTitle,
            stageTitle: null,
            completedAt: at,
          }));
        }
      }
      for (const checkpoint of stage.checkpoints || []) {
        if (!checkpoint.done && !checkpoint.archived) continue;
        const at = checkpoint.completedAt || checkpoint.archivedAt;
        if (!isTimestampOnDate(at, target)) continue;
        pushCompletedItem(items, timedCompletedItem({
          kind: 'checkpoint',
          id: `${project.id}:${stage.id}:${checkpoint.id}`,
          title: checkpoint.title || checkpoint.metricName || 'Checkpoint',
          projectTitle,
          stageTitle: stage.title,
          completedAt: at,
        }));
      }
      items.push(...collectCanvasCompleted(stage.ideas, {
        kind: 'idea',
        projectId: project.id,
        projectTitle,
        dateStr: target,
        completeStatuses: IDEA_DONE,
        titleOf: (idea) => idea.title || 'Ιδέα',
      }).map((item) => ({ ...item, stageTitle: stage.title })));
    }

    for (const note of project.notes || []) {
      if (!isItemDone(note)) continue;
      const at = note.completedAt || note.archivedAt || note.updatedAt;
      if (!isTimestampOnDate(at, target)) continue;
      pushCompletedItem(items, timedCompletedItem({
        kind: 'note',
        id: `${project.id}:note:${note.id}`,
        title: note.title || note.body?.slice(0, 80) || 'Σημείωση',
        projectTitle,
        stageTitle: null,
        completedAt: at,
      }));
    }

    items.push(
      ...collectCanvasCompleted(project.canvasTasks, {
        kind: 'task',
        projectId: project.id,
        projectTitle,
        dateStr: target,
        completeStatuses: TASK_DONE,
        titleOf: (task) => task.title || 'Task',
      }),
      ...collectCanvasCompleted(project.canvasObstacles, {
        kind: 'obstacle',
        projectId: project.id,
        projectTitle,
        dateStr: target,
        completeStatuses: OBSTACLE_DONE,
        titleOf: (obstacle) => obstacle.title || 'Obstacle',
      }),
      ...collectCanvasCompleted(project.canvasResources, {
        kind: 'resource',
        projectId: project.id,
        projectTitle,
        dateStr: target,
        completeStatuses: RESOURCE_DONE,
        titleOf: (resource) => resource.title || 'Resource',
      }),
    );

    for (const sticky of project.canvasStickies || []) {
      if (!isItemDone(sticky)) continue;
      const at = itemActivityAt(sticky);
      if (!isTimestampOnDate(at, target)) continue;
      const isImage = Boolean(sticky.imageSrc);
      pushCompletedItem(items, timedCompletedItem({
        kind: isImage ? 'image' : 'sticky',
        id: `${project.id}:${isImage ? 'image' : 'sticky'}:${sticky.id}`,
        title: sticky.text?.trim()?.slice(0, 80) || (isImage ? 'Εικόνα' : 'Σημείωση'),
        projectTitle,
        stageTitle: null,
        completedAt: at,
      }));
    }
  }

  return items.sort(
    (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
  );
}

/** Collect project notes created on a given day across projects. */
export function collectNotesCreatedForDate(projects, dateStr) {
  const target = toDateString(dateStr);
  if (!target || !projects?.length) return [];

  const items = [];
  const today = toDateString(new Date());

  for (const project of projects) {
    const projectTitle = project.title || 'Project';

    for (const note of project.notes || []) {
      if (!note || typeof note !== 'object' || note.archived) continue;
      const created = note.createdAt || note.updatedAt;
      if (created) {
        if (!isTimestampOnDate(created, target)) continue;
      } else if (target !== today) {
        continue;
      }
      pushCompletedItem(items, {
        kind: 'note',
        id: `${project.id}:note:${note.id}`,
        title: note.title || note.body?.slice(0, 80) || 'Σημείωση',
        projectTitle,
        stageTitle: null,
        timeLabel: created ? formatNoteClock(created) : '',
        timestamp: created || null,
      });
    }
  }

  return items.sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
}

export function formatNoteClock(isoOrDate = new Date()) {
  if (typeof isoOrDate === 'string' && /^\d{1,2}:\d{2}$/.test(isoOrDate.trim())) {
    const [hours, minutes] = isoOrDate.trim().split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const NOTE_TIME_PREFIX = /^(\d{1,2}:\d{2})\s*[—–-]\s*/;
const NOTE_TIME_LINE = /^(\d{1,2}:\d{2})\s*\n/;

function hasNoteTimePrefix(text) {
  const value = String(text || '').trim();
  return NOTE_TIME_PREFIX.test(value) || NOTE_TIME_LINE.test(value);
}

export function stampNoteText(text, at = new Date()) {
  const body = String(text || '').trim();
  if (!body) return '';
  if (hasNoteTimePrefix(body)) return body;
  const clock = formatNoteClock(at);
  if (!clock) return body;
  return body.includes('\n') ? `${clock}\n${body}` : `${clock} — ${body}`;
}

function timestampFromDateAndClock(dateStr, clock) {
  const target = toDateString(dateStr);
  const match = String(clock || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!target || !match) return null;
  const [year, month, day] = target.split('-').map(Number);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const date = new Date(year, month - 1, day, hours, minutes, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseStampedNote(chunk, dateStr) {
  const text = String(chunk || '').trim();
  const prefixed = text.match(NOTE_TIME_PREFIX);
  const lined = !prefixed ? text.match(NOTE_TIME_LINE) : null;
  const clock = prefixed?.[1] || lined?.[1] || '';
  const body = prefixed
    ? text.slice(prefixed[0].length).trim()
    : lined
      ? text.slice(lined[0].length).trim()
      : text;
  return {
    timeLabel: clock ? formatNoteClock(clock) : '',
    title: (body.split('\n')[0] || clock || 'Σημείωση').slice(0, 120),
    timestamp: clock ? timestampFromDateAndClock(dateStr, clock) : null,
  };
}

export function stampNewJournalBlocks(previous, next, at = new Date()) {
  const prevBlocks = String(previous || '')
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const nextBlocks = String(next || '')
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!nextBlocks.length) return '';
  return nextBlocks
    .map((block) => (prevBlocks.includes(block) || hasNoteTimePrefix(block) ? block : stampNoteText(block, at)))
    .join('\n\n');
}

export function appendDayJournalNote(existing, text, at = new Date()) {
  const prev = String(existing || '').trim();
  const raw = String(text || '').trim();
  const next = stampNoteText(raw, at);
  if (!next) return prev;
  if (!prev) return next;
  if (raw && prev.includes(raw)) return prev;
  if (prev.includes(next)) return prev;
  return `${prev}\n\n${next}`;
}

export function collectJournalNotesForDate(journalText, dateStr) {
  const target = toDateString(dateStr);
  const text = String(journalText || '').trim();
  if (!target || !text) return [];
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const parsed = parseStampedNote(chunk, target);
      return {
        kind: 'note',
        id: `journal:${target}:${index}`,
        title: parsed.title,
        projectTitle: 'Lifeline',
        stageTitle: null,
        timeLabel: parsed.timeLabel,
        timestamp: parsed.timestamp,
      };
    });
}

/** Collect checkpoints and canvas tasks scheduled for a given day across projects. */
export function collectScheduledItemsForDate(projects, dateStr) {
  const target = toDateString(dateStr);
  if (!target || !projects?.length) return [];

  const items = [];

  for (const project of projects) {
    const projectTitle = project.title || 'Project';

    for (const stage of project.stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        if (checkpoint.archived) continue;
        if (toDateString(checkpoint.planDate) !== target) continue;
        const done = checkpoint.done === true;
        pushCompletedItem(items, {
          kind: 'checkpoint',
          id: `${project.id}:${stage.id}:${checkpoint.id}`,
          title: checkpoint.title || checkpoint.metricName || 'Checkpoint',
          projectTitle,
          stageTitle: stage.title,
          done,
        });
      }
    }

    for (const task of project.canvasTasks || []) {
      if (task.archived) continue;
      const planDate = toDateString(task.planDate || task.dueDate);
      if (planDate !== target) continue;
      const done = task.status === 'Done' || task.done === true;
      pushCompletedItem(items, {
        kind: 'task',
        id: `${project.id}:task:${task.id}`,
        title: task.title || 'Task',
        projectTitle,
        stageTitle: null,
        done,
      });
    }
  }

  return items.sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    return (a.title || '').localeCompare(b.title || '', 'el');
  });
}

export function formatFullDayLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return dateStr || '';
  return d.toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function kindLabel(kind) {
  if (kind === 'milestone') return 'Milestone';
  if (kind === 'checkpoint') return 'Checkpoint';
  if (kind === 'task') return 'Task';
  if (kind === 'obstacle') return 'Obstacle';
  if (kind === 'resource') return 'Resource';
  if (kind === 'idea') return 'Ιδέα';
  if (kind === 'image') return 'Εικόνα';
  if (kind === 'sticky') return 'Σημείωση';
  if (kind === 'note') return 'Σημείωση';
  return 'Item';
}
