/** Bounding box for a set of strokes (board coordinates). */
export function getStrokesRectBounds(strokes, padding = 20) {
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

  if (!Number.isFinite(minX)) return null;

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function strokeIntersectsRect(stroke, left, top, right, bottom) {
  for (const p of stroke.points || []) {
    if (!p || p.length < 2) continue;
    const [x, y] = p;
    if (x >= left && x <= right && y >= top && y <= bottom) return true;
  }
  return false;
}

/** Return stroke ids whose points fall inside the rectangle. */
export function findStrokesInRect(strokes, x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  if (right - left < 4 && bottom - top < 4) return [];

  const hits = [];
  for (const stroke of strokes || []) {
    if (strokeIntersectsRect(stroke, left, top, right, bottom)) {
      hits.push(stroke.id);
    }
  }
  return hits;
}

export const INK_CONVERT_TYPES = [
  { id: 'milestone', label: 'Milestone' },
  { id: 'major', label: 'Major Milestone' },
  { id: 'sticky', label: 'Sticky Note (canvas)' },
  { id: 'note', label: 'Project Note' },
  { id: 'goal', label: 'Goal' },
];
