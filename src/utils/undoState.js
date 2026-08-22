export const UNDO_FIELDS = [
  'projectTitle',
  'stages',
  'goals',
  'notes',
  'backlog',
  'canvasConnections',
  'canvasStickies',
  'canvasObstacles',
  'canvasResources',
  'canvasTasks',
  'canvasInk',
  'whiteboardStrokes',
  'mapTheme',
  'projectBrief',
  'lifelineDays',
];

export function snapshotUndoState(state) {
  if (!state) return null;
  const snap = {};
  for (const key of UNDO_FIELDS) {
    // Immutable patches replace whole fields, so references are enough.
    snap[key] = state[key];
  }
  return snap;
}

export function applyUndoSnapshot(state, snapshot) {
  if (!state || !snapshot) return state;
  return { ...state, ...snapshot };
}
