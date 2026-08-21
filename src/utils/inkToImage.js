import getStroke from 'perfect-freehand';

const STROKE_OPTS = {
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.45,
  easing: (t) => t,
  start: { taper: 0, cap: true },
  end: { taper: 12, cap: true },
};

function drawStrokePath(ctx, outline, color) {
  if (!outline.length) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) {
    ctx.lineTo(outline[i][0], outline[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = color || '#f5f5f5';
  ctx.fill();
}

/**
 * Rasterize ink strokes to a PNG data URL (black background, white ink).
 * @param {Array} strokes
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 */
/** OCR export — keep both dimensions readable for multi-line sentences. */
const MIN_OCR_SHORT_EDGE = 280;
const MIN_OCR_LONG_EDGE = 768;
const MAX_OCR_SCALE = 6;

export function strokesToPngDataUrl(strokes, bounds) {
  if (!bounds || !strokes?.length) return null;

  const rawWidth = Math.max(1, Math.ceil(bounds.maxX - bounds.minX));
  const rawHeight = Math.max(1, Math.ceil(bounds.maxY - bounds.minY));
  const shortEdge = Math.min(rawWidth, rawHeight);
  const longEdge = Math.max(rawWidth, rawHeight);
  const scale = Math.min(
    MAX_OCR_SCALE,
    Math.max(2, MIN_OCR_SHORT_EDGE / shortEdge, MIN_OCR_LONG_EDGE / longEdge)
  );

  const width = Math.ceil(rawWidth * scale);
  const height = Math.ceil(rawHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.scale(scale, scale);

  const offsetX = bounds.minX;
  const offsetY = bounds.minY;

  for (const stroke of strokes) {
    const localPoints = (stroke.points || [])
      .filter((p) => p && p.length >= 2)
      .map((p) => [p[0] - offsetX, p[1] - offsetY, p[2] ?? 0.5]);

    if (localPoints.length === 0) continue;

    const outline = getStroke(localPoints, {
      ...STROKE_OPTS,
      size: Math.max(1, stroke.size || 3),
    });
    drawStrokePath(ctx, outline, stroke.color || '#f5f5f5');
  }

  return canvas.toDataURL('image/png');
}
