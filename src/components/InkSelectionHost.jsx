import { useCallback, useEffect, useRef, useState } from 'react';
import { useZoomTransform } from './ZoomCanvas';
import { clientToBoardPoint } from '../utils/inkStrokes';
import { findStrokesInRect } from '../utils/inkSelection';
import { expandSelectionToChunks } from '../utils/inkGroups';

/**
 * Rectangle selection for ink strokes on the zoom viewport.
 */
export function useInkSelection({ strokes, onSelectionChange }) {
  const { scale, pan, viewportRef } = useZoomTransform();
  const [selectionRect, setSelectionRect] = useState(null);
  const dragRef = useRef(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const toBoard = useCallback(
    (clientX, clientY) =>
      clientToBoardPoint(clientX, clientY, viewportRef?.current, pan, scale || 1),
    [pan, scale, viewportRef]
  );

  const commitSelection = useCallback(
    (x1, y1, x2, y2) => {
      const ids = findStrokesInRect(strokesRef.current, x1, y1, x2, y2);
      onSelectionChange?.(expandSelectionToChunks(strokesRef.current, ids));
    },
    [onSelectionChange]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const { x, y } = toBoard(e.clientX, e.clientY);
      dragRef.current = { x1: x, y1: y, x2: x, y2: y };
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y });

      const onWinMove = (ev) => {
        if (!dragRef.current) return;
        ev.preventDefault();
        const pt = toBoard(ev.clientX, ev.clientY);
        dragRef.current.x2 = pt.x;
        dragRef.current.y2 = pt.y;
        setSelectionRect({ ...dragRef.current });
      };

      const onWinUp = () => {
        const d = dragRef.current;
        dragRef.current = null;
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
        if (d) {
          commitSelection(d.x1, d.y1, d.x2, d.y2);
          setSelectionRect({ ...d });
        }
      };

      window.addEventListener('pointermove', onWinMove, { passive: false });
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
    },
    [toBoard, commitSelection]
  );

  const clearSelection = useCallback(() => {
    dragRef.current = null;
    setSelectionRect(null);
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  return { selectionRect, onPointerDown, clearSelection };
}

export function InkSelectionHost({ strokes, onSelectionChange, bindDownRef }) {
  const { selectionRect, onPointerDown, clearSelection } = useInkSelection({
    strokes,
    onSelectionChange,
  });

  useEffect(() => {
    if (bindDownRef) {
      bindDownRef.current = onPointerDown;
    }
    return () => {
      if (bindDownRef) bindDownRef.current = null;
    };
  }, [bindDownRef, onPointerDown]);

  useEffect(() => {
    bindDownRef?.clearSelectionRef && (bindDownRef.clearSelectionRef.current = clearSelection);
  }, [bindDownRef, clearSelection]);

  if (!selectionRect) return null;

  const left = Math.min(selectionRect.x1, selectionRect.x2);
  const top = Math.min(selectionRect.y1, selectionRect.y2);
  const width = Math.abs(selectionRect.x2 - selectionRect.x1);
  const height = Math.abs(selectionRect.y2 - selectionRect.y1);

  return (
    <div
      className="ink-selection-rect"
      style={{ left, top, width, height }}
      aria-hidden="true"
    />
  );
}
