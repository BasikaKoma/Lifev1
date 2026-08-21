import { generateId } from '../data/templates';
import { DEFAULT_INK_SIZE } from './inkStrokes';

const GROUP_PAUSE_MS = 2200;
/** Max horizontal gap between letter strokes in one word. */
const LETTER_GAP_MAX = 68;
/** Max horizontal gap to chain words in one draggable phrase. */
const PHRASE_LINK_GAP = 105;
/** Max center-Y difference between linkable strokes (allows slight diagonal). */
const PHRASE_Y_DRIFT = 55;
/** Vertical bbox gap that blocks linking across separate text lines. */
const LINE_SEPARATION_GAP = 62;

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, centerY: number, centerX: number }} StrokeBounds */

let inkWriteSession = {
  groupId: null,
  lastEndTime: 0,
  lastBounds: null,
  groupBounds: null,
};

export function createInkGroupId() {
  return `ink-group-${generateId()}`;
}

/** Bounding box for a single stroke (board coordinates). */
export function getStrokeBounds(stroke, padding = 4) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of stroke?.points || []) {
    if (!p || p.length < 2) continue;
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }

  if (!Number.isFinite(minX)) return null;

  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width,
    height,
    centerY: (minY + maxY) / 2,
    centerX: (minX + maxX) / 2,
  };
}

function unionBounds(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxY = Math.max(a.maxY, b.maxY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerY: (minY + maxY) / 2,
    centerX: (minX + maxX) / 2,
  };
}

function horizontalGap(a, b) {
  if (a.maxX < b.minX) return b.minX - a.maxX;
  if (b.maxX < a.minX) return a.minX - b.maxX;
  return 0;
}

function verticalGap(a, b) {
  if (a.maxY < b.minY) return b.minY - a.maxY;
  if (b.maxY < a.minY) return a.minY - b.maxY;
  return 0;
}

function letterGapForBounds(bounds) {
  if (!bounds) return LETTER_GAP_MAX;
  const fromHeight = Math.max(34, bounds.height * 0.72);
  const fromWidth = bounds.width > 0 ? bounds.width * 1.2 : 0;
  return Math.min(LETTER_GAP_MAX, Math.max(fromHeight, fromWidth, 34));
}

/** Whether two stroke bboxes belong to the same draggable chunk. */
export function canLinkInkBounds(a, b) {
  if (!a || !b) return false;

  const hGap = horizontalGap(a, b);
  const vGap = verticalGap(a, b);
  const centerYDiff = Math.abs(a.centerY - b.centerY);

  // Separate horizontal lines (e.g. ΓΝΩΣΗ above ΚΟΜΜΑΤΙΑ)
  if (vGap > LINE_SEPARATION_GAP && centerYDiff > PHRASE_Y_DRIFT) return false;

  // Touching / overlapping strokes
  if (hGap === 0 && vGap === 0) return true;

  const letterGap = Math.max(letterGapForBounds(a), letterGapForBounds(b));

  // Same word — letters
  if (hGap <= letterGap && centerYDiff <= PHRASE_Y_DRIFT) return true;

  // Same phrase — adjacent words (incl. slight diagonal)
  if (hGap <= PHRASE_LINK_GAP && centerYDiff <= PHRASE_Y_DRIFT) return true;

  return false;
}

function boundsFromPoint(x, y, size = 8) {
  return {
    minX: x - size,
    minY: y - size,
    maxX: x + size,
    maxY: y + size,
    width: size * 2,
    height: size * 2,
    centerX: x,
    centerY: y,
  };
}

/**
 * Connected-component cluster: handles diagonal phrases, blocks separate lines.
 */
export function findConnectedInkCluster(strokes, seedId) {
  const list = strokes || [];
  const byId = new Map(list.map((s) => [s.id, s]));
  const boundsMap = new Map(list.map((s) => [s.id, getStrokeBounds(s)]));

  if (!byId.has(seedId)) return [seedId];

  const cluster = new Set([seedId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const stroke of list) {
      if (cluster.has(stroke.id)) continue;
      const bounds = boundsMap.get(stroke.id);
      if (!bounds) continue;

      for (const memberId of cluster) {
        const memberBounds = boundsMap.get(memberId);
        if (memberBounds && canLinkInkBounds(bounds, memberBounds)) {
          cluster.add(stroke.id);
          changed = true;
          break;
        }
      }
    }
  }

  return [...cluster];
}

/** Word-level cluster for legacy migration only. */
export function findSpatialWordCluster(strokes, seedId) {
  const cluster = findConnectedInkCluster(strokes, seedId);
  const list = strokes || [];
  const boundsMap = new Map(list.map((s) => [s.id, getStrokeBounds(s)]));
  const seedBounds = boundsMap.get(seedId);
  if (!seedBounds) return cluster;

  const letterGap = letterGapForBounds(seedBounds);
  const onLine = cluster
    .map((id) => ({ id, bounds: boundsMap.get(id) }))
    .filter((x) => x.bounds)
    .sort((a, b) => a.bounds.minX - b.bounds.minX);

  const words = [];
  let current = [onLine[0]];

  for (let i = 1; i < onLine.length; i += 1) {
    const gap = horizontalGap(current[current.length - 1].bounds, onLine[i].bounds);
    if (gap > letterGap) {
      words.push(current);
      current = [onLine[i]];
    } else {
      current.push(onLine[i]);
    }
  }
  words.push(current);

  const word = words.find((w) => w.some((x) => x.id === seedId));
  return word ? word.map((x) => x.id) : [seedId];
}

/** Strokes to select/drag together. */
export function getStrokesInChunk(strokes, strokeId) {
  return findConnectedInkCluster(strokes, strokeId);
}

/** Decide groupId when the user starts a new pen stroke. */
export function resolveGroupIdForNewStroke(firstPoint) {
  const [x, y] = firstPoint;
  const now = Date.now();

  if (
    inkWriteSession.groupId &&
    inkWriteSession.lastBounds &&
    shouldContinueGroup(x, y, now)
  ) {
    return inkWriteSession.groupId;
  }

  return createInkGroupId();
}

function shouldContinueGroup(x, y, now) {
  const { lastBounds, groupBounds, lastEndTime } = inkWriteSession;
  if (!lastBounds) return false;

  if (now - lastEndTime > GROUP_PAUSE_MS) return false;

  const pointBounds = boundsFromPoint(x, y);

  if (canLinkInkBounds(lastBounds, pointBounds)) return true;

  if (groupBounds && canLinkInkBounds(groupBounds, pointBounds)) {
    const gapAfter = x - lastBounds.maxX;
    return gapAfter <= PHRASE_LINK_GAP;
  }

  return false;
}

/** Call after each stroke is committed while drawing. */
export function recordInkStrokeEnd(stroke) {
  const bounds = getStrokeBounds(stroke);
  const groupBounds =
    stroke.groupId && stroke.groupId === inkWriteSession.groupId
      ? unionBounds(inkWriteSession.groupBounds, bounds)
      : bounds;

  inkWriteSession = {
    groupId: stroke.groupId || inkWriteSession.groupId,
    lastEndTime: Date.now(),
    lastBounds: bounds,
    groupBounds,
  };
}

export function resetInkWriteSession() {
  inkWriteSession = { groupId: null, lastEndTime: 0, lastBounds: null, groupBounds: null };
}

/** Assign groupIds only to strokes that have none — never rewrite existing groups. */
export function migrateStrokeGroups(strokes) {
  const list = (strokes || []).map((s) => ({ ...s }));
  const ungrouped = list.filter((s) => !s.groupId);
  if (ungrouped.length === 0) return list;

  const assigned = new Set();
  for (const stroke of ungrouped) {
    if (assigned.has(stroke.id)) continue;
    const cluster = findSpatialWordCluster(list, stroke.id);
    const groupId = createInkGroupId();
    for (const id of cluster) {
      assigned.add(id);
      const target = list.find((s) => s.id === id);
      if (target && !target.groupId) target.groupId = groupId;
    }
  }

  return list;
}

export function getDefaultWordGap(size = DEFAULT_INK_SIZE) {
  return LETTER_GAP_MAX;
}

/** Expand stroke ids to full connected chunks. */
export function expandSelectionToChunks(strokes, ids) {
  const expanded = new Set();
  for (const id of ids || []) {
    for (const chunkId of getStrokesInChunk(strokes, id)) {
      expanded.add(chunkId);
    }
  }
  return [...expanded];
}

/** Normalize ink on load — only fill missing groupIds, do not reshuffle. */
export function ensureInkGroups(strokes) {
  const list = strokes || [];
  if (!list.length) return list;
  if (list.every((s) => s.groupId)) return list;
  return migrateStrokeGroups(list);
}

/** Bounds of a set of strokes (for selection highlight). */
export function getChunkBounds(strokes, ids) {
  let merged = null;
  for (const stroke of strokes || []) {
    if (!ids?.includes(stroke.id)) continue;
    merged = unionBounds(merged, getStrokeBounds(stroke));
  }
  return merged;
}
