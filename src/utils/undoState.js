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
    snap[key] = structuredClone(state[key]);
  }
  return snap;
}

export function applyUndoSnapshot(state, snapshot) {
  if (!state || !snapshot) return state;
  return { ...state, ...snapshot };
}
