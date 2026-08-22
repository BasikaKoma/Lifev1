import { translateStrokePoints } from './inkStrokes';

/** Grow the board when content would go above this Y (canvas origin). */
export const CANVAS_TOP_PAD = 8;
const GROW_CHUNK = 200;

const originListeners = new Set();
const panListeners = new Set();

/** Drag origins subscribe so world-Y stays in sync when the canvas grows upward. */
export function onCanvasWorldShift(listener) {
  originListeners.add(listener);
  return () => originListeners.delete(listener);
}

/** Viewport pan subscribers — keep the view still while coordinates shift down. */
export function onCanvasWorldPanShift(listener) {
  panListeners.add(listener);
  return () => panListeners.delete(listener);
}

export function notifyCanvasWorldShift(dy) {
  if (!dy) return;
  originListeners.forEach((fn) => {
    try {
      fn(dy);
    } catch {
      /* ignore */
    }
  });
  panListeners.forEach((fn) => {
    try {
      fn(dy);
    } catch {
      /* ignore */
    }
  });
}

function shiftItem(item, dy) {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  if (typeof next.posY === 'number') next.posY += dy;
  if (typeof next.canvasY === 'number') next.canvasY += dy;
  if (typeof next.timelineY === 'number') next.timelineY += dy;
  return next;
}

function minFromItem(min, item) {
  if (!item) return min;
  if (typeof item.posY === 'number') min = Math.min(min, item.posY);
  if (typeof item.canvasY === 'number') min = Math.min(min, item.canvasY);
  return min;
}

export function contentMinY(state) {
  let min = Infinity;
  for (const stage of state.stages || []) {
    min = minFromItem(min, stage);
    for (const idea of stage.ideas || []) min = minFromItem(min, idea);
  }
  for (const idea of state.backlog || []) min = minFromItem(min, idea);
  for (const list of [state.canvasStickies, state.canvasObstacles, state.canvasResources, state.canvasTasks]) {
    for (const item of list || []) min = minFromItem(min, item);
  }
  for (const stroke of state.canvasInk || []) {
    for (const p of stroke.points || []) {
      if (p && p.length >= 2) min = Math.min(min, p[1]);
    }
  }
  const top = state.mapTheme?.roadmap?.top;
  if (typeof top === 'number') min = Math.min(min, top);
  return min;
}

export function shiftCanvasWorld(state, dy) {
  if (!dy || !state) return state;
  const roadmap = state.mapTheme?.roadmap || {};
  return {
    ...state,
    stages: (state.stages || []).map((stage) => ({
      ...shiftItem(stage, dy),
      ideas: (stage.ideas || []).map((idea) => shiftItem(idea, dy)),
    })),
    backlog: (state.backlog || []).map((idea) => shiftItem(idea, dy)),
    canvasStickies: (state.canvasStickies || []).map((item) => shiftItem(item, dy)),
    canvasObstacles: (state.canvasObstacles || []).map((item) => shiftItem(item, dy)),
    canvasResources: (state.canvasResources || []).map((item) => shiftItem(item, dy)),
    canvasTasks: (state.canvasTasks || []).map((item) => shiftItem(item, dy)),
    canvasInk: (state.canvasInk || []).map((stroke) => ({
      ...stroke,
      points: translateStrokePoints(stroke.points, 0, dy),
    })),
    mapTheme: {
      ...state.mapTheme,
      roadmap: {
        ...roadmap,
        top: (typeof roadmap.top === 'number' ? roadmap.top : 80) + dy,
        baseY: (typeof roadmap.baseY === 'number' ? roadmap.baseY : 880) + dy,
      },
    },
  };
}

/** Insert space at the top of a project roadmap so objects can keep moving upward. */
export function ensureCanvasHeadroom(state) {
  if (!state || state.isLifeline) return { state, dy: 0 };
  const minY = contentMinY(state);
  if (!Number.isFinite(minY) || minY >= CANVAS_TOP_PAD) return { state, dy: 0 };
  const needed = CANVAS_TOP_PAD - minY;
  const dy = Math.ceil(needed / GROW_CHUNK) * GROW_CHUNK;
  if (dy <= 0) return { state, dy: 0 };
  return { state: shiftCanvasWorld(state, dy), dy };
}
