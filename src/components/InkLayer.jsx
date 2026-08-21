import { memo, useMemo } from 'react';
import getStroke from 'perfect-freehand';
import { getChunkBounds } from '../utils/inkGroups';

function strokeToSvgPath(stroke) {
  const points = stroke?.points;
  if (!Array.isArray(points) || points.length === 0) return '';

  const outline = getStroke(points, {
    size: Math.max(1, stroke.size || 3),
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 12, cap: true },
  });

  if (!outline.length) return '';

  const [first, ...rest] = outline;
  let d = `M ${first[0]} ${first[1]}`;
  for (const point of rest) {
    d += ` L ${point[0]} ${point[1]}`;
  }
  d += ' Z';
  return d;
}

function pointsToPolyline(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  return d;
}

const InkStrokePath = memo(function InkStrokePath({ stroke }) {
  const d = useMemo(() => strokeToSvgPath(stroke), [stroke]);
  if (!d) return null;
  return (
    <path
      d={d}
      fill={stroke.color || '#f5f5f5'}
      opacity={stroke.opacity ?? 1}
      stroke="none"
    />
  );
});

function LiveStrokePath({ stroke }) {
  const d = pointsToPolyline(stroke?.points);
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke.color || '#f5f5f5'}
      strokeWidth={Math.max(1.5, (stroke.size || 3) * 0.85)}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.95}
      pointerEvents="none"
    />
  );
}

/** Render-only ink layer. Pointer capture lives on the zoom viewport via InkGestureHost. */
export function InkLayer({
  strokes = [],
  liveStroke = null,
  selectedStrokeIds = [],
  width,
  height,
  className = '',
}) {
  const selected = new Set(selectedStrokeIds);
  const selectionBounds = useMemo(
    () => (selected.size ? getChunkBounds(strokes, selectedStrokeIds) : null),
    [strokes, selectedStrokeIds, selected.size]
  );

  return (
    <svg
      className={`ink-layer ${className}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ pointerEvents: 'none', touchAction: 'none' }}
      aria-hidden="true"
    >
      {strokes.map((stroke) => (
        <g key={stroke.id}>
          <InkStrokePath stroke={stroke} />
        </g>
      ))}
      {selectionBounds && (
        <rect
          className="ink-layer__selection"
          x={selectionBounds.minX - 8}
          y={selectionBounds.minY - 8}
          width={selectionBounds.width + 16}
          height={selectionBounds.height + 16}
          fill="rgba(251, 191, 36, 0.08)"
          stroke="rgba(251, 191, 36, 0.75)"
          strokeWidth={2}
          strokeDasharray="7 5"
          rx={6}
        />
      )}
      {liveStroke && <LiveStrokePath stroke={liveStroke} />}
    </svg>
  );
}
