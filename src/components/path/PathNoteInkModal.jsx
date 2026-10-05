import { useEffect, useRef, useState } from 'react';
import getStroke from 'perfect-freehand';
import { InkLayer } from '../InkLayer';
import { createInkStroke, findStrokeIdsNearPoint } from '../../utils/inkStrokes';

const INK_COLOR = '#f4f4f5';
const INK_SIZE = 4;

function pointFromEvent(event, board) {
  const rect = board.getBoundingClientRect();
  const pressure = typeof event.pressure === 'number' && event.pressure > 0 ? event.pressure : 0.5;
  return [event.clientX - rect.left, event.clientY - rect.top, pressure];
}

function strokeBounds(strokes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points || []) {
      if (!point || point.length < 2) continue;
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function drawStroke(ctx, stroke, offsetX, offsetY) {
  const points = (stroke.points || [])
    .filter((point) => point && point.length >= 2)
    .map((point) => [point[0] - offsetX, point[1] - offsetY, point[2] ?? 0.5]);
  if (!points.length) return;
  const outline = getStroke(points, {
    size: Math.max(1, stroke.size || INK_SIZE),
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 12, cap: true },
  });
  if (!outline.length) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fillStyle = stroke.color || INK_COLOR;
  ctx.fill();
}

export function strokesToNotePng(strokes) {
  const bounds = strokeBounds(strokes);
  if (!bounds) return null;
  const pad = 24;
  const rawWidth = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + pad * 2));
  const rawHeight = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + pad * 2));
  const scale = Math.min(2, 1600 / Math.max(rawWidth, rawHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(rawWidth * scale);
  canvas.height = Math.ceil(rawHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const offsetX = bounds.minX - pad;
  const offsetY = bounds.minY - pad;
  for (const stroke of strokes) drawStroke(ctx, stroke, offsetX, offsetY);
  return canvas.toDataURL('image/png');
}

export function PathNoteInkModal({ open, onClose, onSave }) {
  const boardRef = useRef(null);
  const drawingRef = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [liveStroke, setLiveStroke] = useState(null);
  const [tool, setTool] = useState('pen');
  const [size, setSize] = useState({ width: 860, height: 480 });

  useEffect(() => {
    if (!open) return undefined;
    setStrokes([]);
    setLiveStroke(null);
    setTool('pen');
    const board = boardRef.current;
    if (!board) return undefined;
    const measure = () => {
      const rect = board.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const finishStroke = () => {
    const current = drawingRef.current;
    drawingRef.current = null;
    setLiveStroke(null);
    if (!current || current.tool !== 'pen' || current.points.length === 0) return;
    setStrokes((prev) => [...prev, createInkStroke({
      points: current.points,
      color: INK_COLOR,
      size: INK_SIZE,
    })]);
  };

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    const board = boardRef.current;
    if (!board) return;
    board.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event, board);
    if (tool === 'eraser') {
      const hits = findStrokeIdsNearPoint(strokes, point[0], point[1], 16);
      if (hits.length) {
        const drop = new Set(hits);
        setStrokes((prev) => prev.filter((stroke) => !drop.has(stroke.id)));
      }
      drawingRef.current = { tool: 'eraser', points: [point] };
      return;
    }
    const stroke = { tool: 'pen', points: [point], color: INK_COLOR, size: INK_SIZE };
    drawingRef.current = stroke;
    setLiveStroke(stroke);
  };

  const onPointerMove = (event) => {
    const current = drawingRef.current;
    const board = boardRef.current;
    if (!current || !board) return;
    event.preventDefault();
    const point = pointFromEvent(event, board);
    if (current.tool === 'eraser') {
      const hits = findStrokeIdsNearPoint(strokes, point[0], point[1], 16);
      if (hits.length) {
        const drop = new Set(hits);
        setStrokes((prev) => prev.filter((stroke) => !drop.has(stroke.id)));
      }
      return;
    }
    current.points.push(point);
    setLiveStroke({ ...current, points: current.points.slice() });
  };

  const save = () => {
    const image = strokesToNotePng(strokes);
    if (!image) return;
    onSave(image);
  };

  return (
    <div className="path-ink" role="dialog" aria-modal="true" aria-labelledby="path-ink-title">
      <button type="button" className="path-ink__backdrop" aria-label="Κλείσιμο" onClick={onClose} />
      <div className="path-ink__panel">
        <header className="path-ink__head">
          <div>
            <h2 id="path-ink-title">Γραφίτης</h2>
            <p>Γράψε εδώ. Η σημείωση μένει όπως τη γράφεις.</p>
          </div>
          <div className="path-ink__tools">
            <button type="button" className={tool === 'pen' ? 'is-on' : ''} onClick={() => setTool('pen')}>Μολύβι</button>
            <button type="button" className={tool === 'eraser' ? 'is-on' : ''} onClick={() => setTool('eraser')}>Σβήσιμο</button>
            <button type="button" onClick={() => setStrokes([])}>Καθαρισμός</button>
          </div>
        </header>
        <div
          ref={boardRef}
          className={`path-ink__board${tool === 'eraser' ? ' path-ink__board--erase' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          <InkLayer strokes={strokes} liveStroke={liveStroke} width={size.width} height={size.height} />
        </div>
        <div className="path-ink__actions">
          <button type="button" className="btn" onClick={onClose}>Άκυρο</button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!strokes.length}>Αποθήκευση στις σημειώσεις</button>
        </div>
      </div>
    </div>
  );
}
