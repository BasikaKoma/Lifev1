import { useEffect, useRef, useState, useCallback } from 'react';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { useCanvasNodeResize, STICKY_RESIZE_HANDLES } from '../hooks/useCanvasNodeResize';
import { formatArchiveDate } from '../utils/archive';
import { getNotePreviewLine, STICKY_CHIP_W } from '../utils/noteSettle';
import { PrioritySelect } from './PrioritySelect';

export function StickyNoteCard({
  sticky,
  onMove,
  onUpdate,
  onRemove,
  onConnectClick,
  onNodeSelect,
  connectFrom,
  connectModeActive = false,
  selectedNodeRef,
  nodeRef,
  readOnly = false,
  mapTheme,
  nodeLevel,
  side = 'free',
  autoEdit = false,
  onAutoEditConsumed,
  settled = false,
  settledAt = null,
  settledByCheckpoints = false,
}) {
  const themeVars = resolveNodeThemeStyle(sticky, mapTheme, nodeLevel, 'sticky');
  const [editing, setEditing] = useState(Boolean(autoEdit));
  const [peeked, setPeeked] = useState(false);
  const inputRef = useRef(null);
  const cardRef = useRef(null);
  const hasImage = Boolean(sticky.imageSrc);
  const sizeLocked = sticky.sizeLocked === true;
  const isConnectSource =
    connectFrom?.type === nodeRef.type && connectFrom?.id === nodeRef.id;
  const isSelected =
    selectedNodeRef?.type === nodeRef.type && selectedNodeRef?.id === nodeRef.id;
  const chip = settled && !settledByCheckpoints && !peeked && !editing;
  const done = settled || sticky.done || sticky.archived;

  const width = chip ? STICKY_CHIP_W : sticky.width || 200;

  const handleResize = useCallback(
    (updates) => {
      onUpdate?.(sticky.id, { ...updates, sizeLocked: true });
    },
    [onUpdate, sticky.id]
  );

  const { resizing, handleResizePointerDown } = useCanvasNodeResize({
    readOnly: readOnly || editing || chip,
    onResize: onUpdate ? handleResize : null,
    getSize: () => {
      const el = cardRef.current;
      if (el) {
        return {
          width: el.offsetWidth || width,
          height: el.offsetHeight || sticky.height || 80,
        };
      }
      return {
        width,
        height: sticky.height || 80,
      };
    },
    getPosition: () => ({ x: sticky.canvasX, y: sticky.canvasY }),
  });

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly: readOnly || editing || resizing,
    onMove: onMove ? (x, y) => onMove(sticky.id, x, y) : null,
    getPosition: () => ({ x: sticky.canvasX, y: sticky.canvasY }),
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  useEffect(() => {
    if (!settled) {
      setPeeked(false);
      return;
    }
    setPeeked(isSelected);
  }, [isSelected, settled]);

  useEffect(() => {
    if (autoEdit) {
      setEditing(true);
      setPeeked(true);
    }
  }, [autoEdit]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    // Defer so selection/toolbar mount does not steal focus.
    const id = requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  useEffect(() => {
    if (!editing || sizeLocked) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, sizeLocked, sticky.text]);

  useEffect(() => {
    if (chip || sizeLocked || !onUpdate) return;
    const el = cardRef.current;
    if (!el) return;

    const syncHeight = () => {
      const nextH = Math.ceil(el.getBoundingClientRect().height);
      if (nextH > 0 && nextH !== sticky.height) {
        onUpdate(sticky.id, { height: nextH, sizeLocked: false });
      }
    };

    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chip, sizeLocked, sticky.id, sticky.text, sticky.width, sticky.imageSrc, editing, onUpdate, sticky.height]);

  const stopEditing = () => {
    setEditing(false);
    onAutoEditConsumed?.();
  };

  const startEditing = () => {
    if (readOnly) return;
    setEditing(true);
    setPeeked(true);
    onNodeSelect?.(nodeRef);
  };

  const placeholder = hasImage ? 'Add a caption…' : 'Double-click to edit…';
  const showText = editing || Boolean(sticky.text) || !hasImage;
  const chipDate = formatArchiveDate(settledAt);
  const chipTitle = peeked
    ? 'Κλικ αλλού για σύμπτυξη'
    : 'Κλικ για προεπισκόπηση';

  return (
    <article
      ref={cardRef}
      className={`sticky-note-card canvas-node canvas-node--typed ${canvasStyleClasses(sticky, mapTheme)} sticky-note-card--${side}${hasImage ? ' sticky-note-card--image' : ''}${sizeLocked && !chip ? ' sticky-note-card--size-locked' : ' sticky-note-card--auto-size'}${dragging ? ' sticky-note-card--dragging' : ''}${resizing ? ' sticky-note-card--resizing' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${done ? ' sticky-note-card--done' : ''}${chip ? ' sticky-note-card--chip' : ''}${settled && peeked ? ' sticky-note-card--peeked' : ''}`}
      style={{
        left: sticky.canvasX,
        top: sticky.canvasY,
        width,
        ...(sizeLocked && sticky.height && !chip
          ? { height: sticky.height, minHeight: sticky.height }
          : {}),
        ...themeVars,
      }}
      title={settled ? chipTitle : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={startEditing}
    >
      {chip ? (
        <>
          <span className="sticky-note-card__chip-check" aria-hidden="true">✓</span>
          <span className="sticky-note-card__chip-text">{getNotePreviewLine(sticky)}</span>
          {chipDate && <span className="sticky-note-card__chip-date">{chipDate}</span>}
        </>
      ) : (
        <>
          {hasImage && (
            <img
              className="sticky-note-card__image"
              src={sticky.imageSrc}
              alt=""
              draggable={false}
            />
          )}
          {editing ? (
            <textarea
              ref={inputRef}
              className="sticky-note-card__input"
              value={sticky.text}
              placeholder={hasImage ? 'Caption…' : 'New note…'}
              onChange={(e) => onUpdate?.(sticky.id, { text: e.target.value })}
              onBlur={stopEditing}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  stopEditing();
                }
              }}
            />
          ) : (
            showText && (
              <div className="sticky-note-card__text">
                {sticky.text || placeholder}
              </div>
            )
          )}
        </>
      )}
      {onRemove && (!chip || isSelected) && (
        <button
          type="button"
          className="canvas-node__delete canvas-node__delete--sticky"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(sticky.id);
          }}
          title="Remove note"
          aria-label="Remove note"
        >
          ×
        </button>
      )}
      {isSelected && !readOnly && !chip && onUpdate && (
        <div className="sticky-note-card__priority">
          <PrioritySelect
            compact
            value={sticky.priority}
            onChange={(priority) => onUpdate(sticky.id, { priority })}
          />
        </div>
      )}
      {isSelected && !readOnly && !chip && (
        <div className="sticky-note-card__resize-handles" aria-hidden="true">
          {STICKY_RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`sticky-note-card__resize-handle sticky-note-card__resize-handle--${handle}`}
              title="Resize"
              aria-label={`Resize ${handle}`}
              onPointerDown={(e) => handleResizePointerDown(handle, e)}
            />
          ))}
        </div>
      )}
    </article>
  );
}
