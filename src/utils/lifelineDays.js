import { generateId } from '../data/templates';
import { isItemDone } from './archive';
import { toDateString, parseDate } from './lifeline';

import { normalizeDayMetrics } from './lifelineSelfMetrics';
import { normalizeSelfHubDayEntry } from './selfHubDays';

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

export function createRoutineTemplate(label = '', defaultTime = '') {
  return {
    id: `routine-${generateId()}`,
    label: label.trim(),
    defaultTime: defaultTime.trim(),
  };
}

function normalizeRoutineLog(raw) {
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

export function normalizeRoutineTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      id: item?.id || `routine-${generateId()}`,
      label: typeof item?.label === 'string' ? item.label.trim() : '',
      defaultTime: typeof item?.defaultTime === 'string' ? item.defaultTime.trim() : '',
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
      archivedAt: typeof entry?.archivedAt === 'string' ? entry.archivedAt : null,
      archivedFrom: typeof entry?.archivedFrom === 'string' ? entry.archivedFrom : null,
    };
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
  return toDateString(iso) === toDateString(dateStr);
}

function pushCompletedItem(items, item) {
  if (item?.title) items.push(item);
}

/** Collect calendar dates with completed checkpoints, tasks, or notes across projects. */
export function collectLifelineActivityDates(projects) {
  const dates = new Set();
  if (!projects?.length) return dates;

  const addDate = (iso) => {
    const day = toDateString(iso);
    if (day) dates.add(day);
  };

  for (const project of projects) {
    for (const stage of project.stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        if (!checkpoint.done && !checkpoint.archived) continue;
        addDate(checkpoint.completedAt || checkpoint.archivedAt);
      }
    }

    for (const note of project.notes || []) {
      if (!isItemDone(note)) continue;
      addDate(note.completedAt || note.archivedAt || note.updatedAt);
    }

    for (const task of project.canvasTasks || []) {
      const done = task.status === 'Done' || task.done === true;
      if (!done) continue;
      addDate(task.completedAt || task.updatedAt);
    }
  }

  return dates;
}

/** Collect checkpoints, tasks, and notes completed on a given day across projects. */
export function collectCompletedItemsForDate(projects, dateStr) {
  const target = toDateString(dateStr);
  if (!target || !projects?.length) return [];

  const items = [];

  for (const project of projects) {
    const projectTitle = project.title || 'Project';

    for (const stage of project.stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        if (!checkpoint.done && !checkpoint.archived) continue;
        const at = checkpoint.completedAt || checkpoint.archivedAt;
        if (!isTimestampOnDate(at, target)) continue;
        pushCompletedItem(items, {
          kind: 'checkpoint',
          id: `${project.id}:${stage.id}:${checkpoint.id}`,
          title: checkpoint.title || checkpoint.metricName || 'Checkpoint',
          projectTitle,
          stageTitle: stage.title,
          completedAt: at,
        });
      }
    }

    for (const note of project.notes || []) {
      if (!isItemDone(note)) continue;
      const at = note.completedAt || note.archivedAt || note.updatedAt;
      if (!isTimestampOnDate(at, target)) continue;
      pushCompletedItem(items, {
        kind: 'note',
        id: `${project.id}:note:${note.id}`,
        title: note.title || note.body?.slice(0, 80) || 'Σημείωση',
        projectTitle,
        stageTitle: null,
        completedAt: at,
      });
    }

    for (const task of project.canvasTasks || []) {
      const done = task.status === 'Done' || task.done === true;
      if (!done) continue;
      const at = task.completedAt || task.updatedAt;
      if (!isTimestampOnDate(at, target)) continue;
      pushCompletedItem(items, {
        kind: 'task',
        id: `${project.id}:task:${task.id}`,
        title: task.title || 'Task',
        projectTitle,
        stageTitle: null,
        completedAt: at,
      });
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

  for (const project of projects) {
    const projectTitle = project.title || 'Project';

    for (const note of project.notes || []) {
      if (note.archived) continue;
      if (!isTimestampOnDate(note.createdAt, target)) continue;
      pushCompletedItem(items, {
        kind: 'note',
        id: `${project.id}:note:${note.id}`,
        title: note.title || note.body?.slice(0, 80) || 'Σημείωση',
        projectTitle,
        stageTitle: null,
        timestamp: note.createdAt,
      });
    }
  }

  return items.sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
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
  if (kind === 'checkpoint') return 'Checkpoint';
  if (kind === 'task') return 'Task';
  if (kind === 'note') return 'Σημείωση';
  return 'Item';
}
