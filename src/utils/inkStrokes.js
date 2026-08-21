import { generateId } from '../data/templates';

export const INK_TOOLS = /** @type {const} */ (['pan', 'pen', 'eraser', 'select']);

export const DEFAULT_INK_COLORS = [
  '#f5f5f5',
  '#93c5fd',
  '#fbbf24',
  '#f87171',
  '#4ade80',
  '#c084fc',
];

export const DEFAULT_INK_SIZE = 3;
export const MIN_INK_SIZE = 1;
export const MAX_INK_SIZE = 24;

/** Pause autosave while the stylus/mouse is mid-stroke. */
let inkGestureActive = false;
const inkIdleListeners = new Set();
let inkCommitHandler = null;

export function markInkGestureStart() {
  inkGestureActive = true;
}

export function markInkGestureEnd() {
  inkGestureActive = false;
  inkIdleListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function isInkGestureActive() {
  return inkGestureActive;
}

export function onInkGestureIdle(listener) {
  inkIdleListeners.add(listener);
  return () => inkIdleListeners.delete(listener);
}

/** Commit an in-progress stroke into app state before save/navigation. */
export function registerInkCommit(handler) {
  inkCommitHandler = handler;
  return () => {
    if (inkCommitHandler === handler) inkCommitHandler = null;
  };
}

export function flushActiveInkStroke() {
  inkCommitHandler?.();
}

export function createInkStroke({ points = [], color = '#f5f5f5', size = DEFAULT_INK_SIZE, opacity = 1, groupId = null } = {}) {
  return {
    id: `ink-${generateId()}`,
    points,
    color,
    size,
    opacity,
    ...(groupId ? { groupId } : {}),
  };
}

/** Whether this pointer looks like a stylus (Huion often reports as mouse). */
export function isPenLikePointer(e) {
  if (!e) return false;
  if (e.pointerType === 'pen') return true;
  if (e.pointerType === 'touch') return false;
  // Tablet drivers sometimes expose tilt even when pointerType is "mouse"
  if (Math.abs(e.tiltX || 0) > 0.01 || Math.abs(e.tiltY || 0) > 0.01) return true;
  return false;
}

/** Whether this pointer should draw/erase (vs pan). Mouse only inks in pen/eraser tool modes. */
export function shouldHandleInkPointer(tool, e) {
  if (tool === 'eraser') return true;
  if (tool === 'pen' && e.pointerType === 'mouse') return true;
  if (tool === 'pen' && e.pointerType === 'touch') return true;
  if (isPenLikePointer(e)) return true;
  return false;
}

/** Whether ZoomCanvas should start a pan for this pointer. */
export function shouldStartPan(e, interactionMode, spaceHeld) {
  if (e.button === 1) return true;
  if (spaceHeld) return true;
  if (e.button !== 0) return false;
  if (isPenLikePointer(e)) return false;
  if (interactionMode === 'draw' || interactionMode === 'erase' || interactionMode === 'select') return false;
  return true;
}

export function viewportClientPoint(clientX, clientY, viewportEl) {
  if (!viewportEl) return { x: 0, y: 0 };
  const rect = viewportEl.getBoundingClientRect();
  return {
    x: clientX - rect.left - viewportEl.clientLeft,
    y: clientY - rect.top - viewportEl.clientTop,
  };
}

export function panForZoomAtPoint(pan, scale, newScale, pointX, pointY) {
  const ratio = newScale / scale;
  return {
    x: pointX - (pointX - pan.x) * ratio,
    y: pointY - (pointY - pan.y) * ratio,
  };
}

export function clientToBoardPoint(clientX, clientY, viewportEl, pan, scale) {
  if (!viewportEl) return { x: 0, y: 0 };
  const { x, y } = viewportClientPoint(clientX, clientY, viewportEl);
  return {
    x: (x - pan.x) / scale,
    y: (y - pan.y) / scale,
  };
}

/** Canvas coordinates at the center of the visible viewport. */
export function viewportCenterToBoardPoint(viewportEl, pan, scale) {
  if (!viewportEl) return { x: 0, y: 0 };
  const rect = viewportEl.getBoundingClientRect();
  return clientToBoardPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    viewportEl,
    pan,
    scale
  );
}

export function isClientPointInViewport(clientX, clientY, viewportEl) {
  if (!viewportEl) return false;
  const rect = viewportEl.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

/** Board top-left for a new item: under the pointer when it is on the canvas, else viewport center. */
export function boardPointForInsert(
  viewportEl,
  pan,
  scale,
  clientPoint,
  size = { w: 200, h: 140 },
  { pointerOnCanvas = false } = {}
) {
  const w = size.w || 200;
  const h = size.h || 140;
  const s = scale || 1;
  let pt;
  if (
    pointerOnCanvas &&
    clientPoint &&
    isClientPointInViewport(clientPoint.x, clientPoint.y, viewportEl)
  ) {
    pt = clientToBoardPoint(clientPoint.x, clientPoint.y, viewportEl, pan, s);
  } else {
    pt = viewportCenterToBoardPoint(viewportEl, pan, s);
  }
  return {
    x: Math.round(pt.x - w / 2),
    y: Math.round(pt.y - h / 2),
  };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** True if any sample of the stroke is within radius of (x, y). */
export function strokeHitsPoint(stroke, x, y, radius) {
  const points = stroke?.points;
  if (!Array.isArray(points) || points.length === 0) return false;
  const r2 = radius * radius;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p || p.length < 2) continue;
    if (dist2(p[0], p[1], x, y) <= r2) return true;
  }
  // Also check segments for sparse strokes
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    if (pointNearSegment(x, y, a[0], a[1], b[0], b[1], radius)) return true;
  }
  return false;
}

function pointNearSegment(px, py, x1, y1, x2, y2, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(px, py, x1, y1) <= radius * radius;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist2(px, py, x1 + t * dx, y1 + t * dy) <= radius * radius;
}

export function findStrokeIdsNearPoint(strokes, x, y, radius) {
  const hits = [];
  for (const stroke of strokes || []) {
    if (strokeHitsPoint(stroke, x, y, radius)) hits.push(stroke.id);
  }
  return hits;
}

/** Topmost stroke at board point (last drawn wins). */
export function findTopStrokeNearPoint(strokes, x, y, padding = 8) {
  const list = strokes || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const stroke = list[i];
    const radius = Math.max(16, (stroke.size || DEFAULT_INK_SIZE) * 2.5) + padding;
    if (strokeHitsPoint(stroke, x, y, radius)) return stroke.id;
  }
  return null;
}

export function translateStrokePoints(points, dx, dy) {
  if (!dx && !dy) return points;
  return (points || []).map((p) => {
    if (!p || p.length < 2) return p;
    return p.length >= 3 ? [p[0] + dx, p[1] + dy, p[2]] : [p[0] + dx, p[1] + dy];
  });
}

export function getInkBounds(strokes, padding = 80) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes || []) {
    for (const p of stroke.points || []) {
      if (!p || p.length < 2) continue;
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
  }

  if (!Number.isFinite(minX)) {
    return { width: 2400, height: 1600 };
  }

  return {
    width: Math.max(2400, Math.ceil(maxX + padding)),
    height: Math.max(1600, Math.ceil(maxY + padding)),
  };
}

/** Ink drawable/render area — larger than the node board so margins accept strokes. */
export const MIN_INK_SURFACE_WIDTH = 4800;
export const MIN_INK_SURFACE_HEIGHT = 3600;

export function getInkSurfaceSize(boardSize, strokes = []) {
  const fromStrokes = getInkBounds(strokes);
  return {
    width: Math.max(
      boardSize?.width || 960,
      fromStrokes.width,
      MIN_INK_SURFACE_WIDTH
    ),
    height: Math.max(
      boardSize?.height || 720,
      fromStrokes.height,
      MIN_INK_SURFACE_HEIGHT
    ),
  };
}

/**
 * Scale canvas ink when lifeline dayHeight zoom changes so handwriting stays
 * visually aligned with the day grid (CSS scale already handles zoom below 100%).
 */
export function scaleInkStrokesForLifelineZoom(
  strokes,
  { centerX, anchorY, ratio }
) {
  if (!Array.isArray(strokes) || !strokes.length) return strokes;
  if (!ratio || ratio === 1 || typeof anchorY !== 'number') return strokes;
  const cx = typeof centerX === 'number' ? centerX : 480;

  return strokes.map((stroke) => ({
    ...stroke,
    size: Math.min(
      MAX_INK_SIZE,
      Math.max(MIN_INK_SIZE, (stroke.size || DEFAULT_INK_SIZE) * ratio)
    ),
    points: (stroke.points || []).map((p) => {
      if (!p || p.length < 2) return p;
      const x = p[0];
      const y = p[1];
      const nx = cx + (x - cx) * ratio;
      const ny = anchorY + (y - anchorY) * ratio;
      return p.length >= 3 ? [nx, ny, p[2]] : [nx, ny];
    }),
  }));
}
