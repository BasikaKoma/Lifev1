/** App-state keys that persist to cloud columns. */
export const STATE_TO_COLUMN = {
  projectTitle: 'title',
  stages: 'stages',
  goals: 'goals',
  notes: 'notes',
  backlog: 'backlog',
  canvasConnections: 'canvas_connections',
  canvasStickies: 'canvas_stickies',
  canvasObstacles: 'canvas_obstacles',
  canvasResources: 'canvas_resources',
  canvasTasks: 'canvas_tasks',
  canvasInk: 'canvas_ink',
  whiteboardStrokes: 'whiteboard_strokes',
  mapTheme: 'map_theme',
  projectBrief: 'brief',
  lifelineDays: 'lifeline_days',
  lifelineAnchorDate: 'lifeline_anchor_date',
};

export const COLUMN_TO_STATE = Object.fromEntries(
  Object.entries(STATE_TO_COLUMN).map(([stateKey, column]) => [column, stateKey])
);

export const PERSISTABLE_COLUMNS = Object.values(STATE_TO_COLUMN);

export const INK_COLUMNS = new Set(['canvas_ink', 'whiteboard_strokes']);

export const LIFELINE_PROTECTION_COLUMNS = new Set([
  'stages',
  'lifeline_days',
]);

export function capturePersistable(state) {
  if (!state) return null;
  const snap = { projectId: state.projectId };
  for (const key of Object.keys(STATE_TO_COLUMN)) {
    snap[key] = state[key];
  }
  return snap;
}

function stripViewportMapTheme(theme) {
  if (!theme || typeof theme !== 'object') return theme;
  const lifeline = theme.lifeline
    ? { ...theme.lifeline, viewCenterDate: undefined, viewStartDate: undefined, viewEndDate: undefined }
    : theme.lifeline;
  const roadmap = theme.roadmap
    ? {
        ...theme.roadmap,
        height: undefined,
        top: undefined,
        baseY: undefined,
      }
    : theme.roadmap;
  return {
    ...theme,
    panelTab: undefined,
    lifeline,
    roadmap,
  };
}

export function persistableValuesEqual(column, a, b) {
  if (a === b) return true;
  if (column === 'map_theme') {
    try {
      return JSON.stringify(stripViewportMapTheme(a)) === JSON.stringify(stripViewportMapTheme(b));
    } catch {
      return false;
    }
  }
  return false;
}

export function diffDirtyColumns(synced, state) {
  if (!state) return [];
  const dirty = [];
  for (const [stateKey, column] of Object.entries(STATE_TO_COLUMN)) {
    if (!persistableValuesEqual(column, synced?.[stateKey], state[stateKey])) {
      dirty.push(column);
    }
  }
  return dirty;
}

export function getStateValueForColumn(state, column) {
  const key = COLUMN_TO_STATE[column];
  if (!key) return undefined;
  const value = state[key];
  if (column === 'title') return value || 'My Business';
  if (column === 'stages') return value || [];
  if (column === 'goals') return value || [];
  if (column === 'notes') return value || [];
  if (column === 'backlog') return value || [];
  if (column === 'canvas_connections') return value || [];
  if (column === 'canvas_stickies') return value || [];
  if (column === 'canvas_obstacles') return value || [];
  if (column === 'canvas_resources') return value || [];
  if (column === 'canvas_tasks') return value || [];
  if (column === 'canvas_ink') return value || [];
  if (column === 'whiteboard_strokes') return value || [];
  if (column === 'map_theme') return value || {};
  if (column === 'brief') return value || {};
  if (column === 'lifeline_days') return value || {};
  if (column === 'lifeline_anchor_date') return value || null;
  return value;
}

export function applyColumnValuesToState(state, columnValues) {
  if (!state || !columnValues) return state;
  const next = { ...state };
  for (const [column, value] of Object.entries(columnValues)) {
    const key = COLUMN_TO_STATE[column];
    if (!key) continue;
    next[key] = value;
  }
  return next;
}

export function splitInkColumns(columns) {
  const ink = [];
  const rest = [];
  for (const column of columns || []) {
    if (INK_COLUMNS.has(column)) ink.push(column);
    else rest.push(column);
  }
  return { ink, rest };
}
