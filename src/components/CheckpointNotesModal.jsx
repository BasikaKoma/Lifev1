import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomCanvas } from './ZoomCanvas';
import { StickyNoteCard } from './StickyNoteCard';
import { InkLayer } from './InkLayer';
import { InkGestureHost } from './InkGestureHost';
import { InkSelectionHost } from './InkSelectionHost';
import { InkDragHost } from './InkDragHost';
import { DrawingToolbar } from './DrawingToolbar';
import { canvasViewportStyle } from '../utils/mapTheme';
import { getNextFreeCanvasPosition } from '../utils/stageLayout';
import { DEFAULT_INK_SIZE, getInkSurfaceSize } from '../utils/inkStrokes';
import { ensureInkGroups } from '../utils/inkGroups';
import { generateId } from '../data/templates';

const CHECKPOINT_LAYOUT = { centerX: 480, baseY: 400, direction: 'vertical' };
const DEFAULT_BOARD = { width: 1600, height: 1200 };

function createCheckpointSticky(overrides = {}) {
  return {
    id: `cp-sticky-${generateId()}`,
    text: '',
    canvasX: 400,
    canvasY: 300,
    width: 200,
    height: 120,
    canvasStyle: {
      color: '#fef08a',
      shape: 'rounded',
      fontSize: 'md',
      fontWeight: 'normal',
    },
    ...overrides,
  };
}

export function CheckpointNotesModal({
  open,
  stageId,
  checkpointId,
  stages = [],
  mapTheme,
  onUpdateCheckpoint,
  onClose,
  onUndo,
}) {
  const [tool, setTool] = useState('pan');
  const [color, setColor] = useState('#f5f5f5');
  const [size, setSize] = useState(DEFAULT_INK_SIZE);
  const [liveStroke, setLiveStroke] = useState(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState([]);
  const [selectedNodeRef, setSelectedNodeRef] = useState(null);
  const [autoEditStickyId, setAutoEditStickyId] = useState(null);
  const inkDownRef = useRef(null);
  const selectDownRef = useRef(null);
  const inkDragDownRef = useRef(null);

  const stage = stages.find((s) => s.id === stageId) || null;
  const checkpoint = stage?.checkpoints?.find((cp) => cp.id === checkpointId) || null;

  const stickies = checkpoint?.notesStickies || [];
  const inkStrokes = useMemo(
    () => ensureInkGroups(checkpoint?.inkStrokes || []),
    [checkpoint?.inkStrokes]
  );

  const inkSurfaceSize = useMemo(
    () => getInkSurfaceSize(DEFAULT_BOARD, inkStrokes),
    [inkStrokes]
  );

  const interactionMode =
    tool === 'eraser' ? 'erase' : tool === 'pen' ? 'draw' : tool === 'select' ? 'select' : 'pan';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const patchCheckpoint = useCallback(
    (updates) => {
      if (!stageId || !checkpointId) return;
      onUpdateCheckpoint?.(stageId, checkpointId, updates);
    },
    [stageId, checkpointId, onUpdateCheckpoint]
  );

  const patchInk = useCallback(
    (mutator) => {
      const next = mutator([...(checkpoint?.inkStrokes || [])]);
      patchCheckpoint({ inkStrokes: ensureInkGroups(next) });
    },
    [checkpoint?.inkStrokes, patchCheckpoint]
  );

  const handleAddInkStroke = useCallback(
    (stroke) => patchInk((strokes) => [...strokes, stroke]),
    [patchInk]
  );

  const handleRemoveInkStrokes = useCallback(
    (ids) => patchInk((strokes) => strokes.filter((s) => !ids.includes(s.id))),
    [patchInk]
  );

  const handleMoveInkStrokes = useCallback(
    (ids, dx, dy) =>
      patchInk((strokes) =>
        strokes.map((s) =>
          ids.includes(s.id)
            ? { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
            : s
        )
      ),
    [patchInk]
  );

  const handleClearInk = useCallback(() => patchInk(() => []), [patchInk]);

  const handleAddSticky = useCallback(() => {
    const pos = getNextFreeCanvasPosition([], [], stickies, CHECKPOINT_LAYOUT, { w: 200, h: 120 });
    const sticky = createCheckpointSticky({ canvasX: pos.x, canvasY: pos.y });
    patchCheckpoint({ notesStickies: [...stickies, sticky] });
    setAutoEditStickyId(sticky.id);
  }, [stickies, patchCheckpoint]);

  const handleUpdateSticky = useCallback(
    (stickyId, updates) => {
      patchCheckpoint({
        notesStickies: stickies.map((s) => (s.id === stickyId ? { ...s, ...updates } : s)),
      });
    },
    [stickies, patchCheckpoint]
  );

  const handleMoveSticky = useCallback(
    (stickyId, x, y) => handleUpdateSticky(stickyId, { canvasX: x, canvasY: y }),
    [handleUpdateSticky]
  );

  const handleRemoveSticky = useCallback(
    (stickyId) => {
      patchCheckpoint({ notesStickies: stickies.filter((s) => s.id !== stickyId) });
    },
    [stickies, patchCheckpoint]
  );

  if (!open || !checkpoint || !stage) return null;

  return (
    <div
      className="checkpoint-notes-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkpoint-notes-modal-title"
    >
      <button type="button" className="checkpoint-notes-modal__backdrop" onClick={onClose} aria-label="Κλείσιμο" />
      <div className="checkpoint-notes-modal__panel">
        <header className="checkpoint-notes-modal__header">
          <div className="checkpoint-notes-modal__meta">
            <span className="checkpoint-notes-modal__phase">{stage.title}</span>
            <h2 id="checkpoint-notes-modal-title" className="checkpoint-notes-modal__title">
              {checkpoint.title}
            </h2>
          </div>
          <div className="checkpoint-notes-modal__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={handleAddSticky}>
              + Sticky
            </button>
            <button
              type="button"
              className="checkpoint-notes-modal__close"
              onClick={onClose}
              aria-label="Κλείσιμο"
            >
              ×
            </button>
          </div>
        </header>

        <div className="checkpoint-notes-modal__toolbar">
          <DrawingToolbar
            tool={tool}
            color={color}
            size={size}
            onToolChange={setTool}
            onColorChange={setColor}
            onSizeChange={setSize}
            onClear={handleClearInk}
            onUndo={onUndo}
            selectedCount={selectedStrokeIds.length}
            showPan
          />
        </div>

        <div className="checkpoint-notes-modal__stage">
          <ZoomCanvas
            className="checkpoint-notes-modal__zoom zoom-canvas--no-toolbar"
            defaultScale={0.85}
            defaultPan={{ x: 40, y: 40 }}
            minScale={0.25}
            maxScale={2.5}
            showToolbar={false}
            interactionMode={interactionMode}
            onInkPointerDown={(e) => inkDownRef.current?.(e)}
            onSelectPointerDown={(e) => selectDownRef.current?.(e)}
            onInkDragPointerDown={(e) => inkDragDownRef.current?.(e)}
            viewportStyle={canvasViewportStyle(mapTheme)}
            panExcludeSelector=".drawing-toolbar"
          >
            <InkGestureHost
              tool={tool}
              color={color}
              size={size}
              strokes={inkStrokes}
              onAddStroke={handleAddInkStroke}
              onRemoveStrokes={handleRemoveInkStrokes}
              bindDownRef={inkDownRef}
              onLiveStroke={setLiveStroke}
            />
            <InkDragHost
              strokes={inkStrokes}
              selectedStrokeIds={selectedStrokeIds}
              onSelectionChange={setSelectedStrokeIds}
              onMoveStrokes={handleMoveInkStrokes}
              bindDownRef={inkDragDownRef}
            />
            <div
              className="checkpoint-notes-modal__board"
              style={{ width: inkSurfaceSize.width, height: inkSurfaceSize.height }}
            >
              <InkLayer
                strokes={inkStrokes}
                liveStroke={liveStroke}
                selectedStrokeIds={selectedStrokeIds}
                width={inkSurfaceSize.width}
                height={inkSurfaceSize.height}
              />
              <InkSelectionHost
                strokes={inkStrokes}
                onSelectionChange={setSelectedStrokeIds}
                bindDownRef={selectDownRef}
              />

              {stickies.map((sticky) => (
                <StickyNoteCard
                  key={sticky.id}
                  sticky={sticky}
                  nodeRef={{ type: 'sticky', id: sticky.id }}
                  mapTheme={mapTheme}
                  side="free"
                  autoEdit={autoEditStickyId === sticky.id}
                  onAutoEditConsumed={() => setAutoEditStickyId(null)}
                  onMove={handleMoveSticky}
                  onUpdate={handleUpdateSticky}
                  onRemove={handleRemoveSticky}
                  onNodeSelect={setSelectedNodeRef}
                  selectedNodeRef={selectedNodeRef}
                />
              ))}
            </div>
          </ZoomCanvas>
        </div>
      </div>
    </div>
  );
}
