import { useCallback, useRef } from 'react';
import { useZoomTransform } from '../components/ZoomCanvas';
import { clientToBoardPoint, findTopStrokeNearPoint, isPenLikePointer } from '../utils/inkStrokes';
import { getStrokesInChunk } from '../utils/inkGroups';

/**
 * Click-to-select and drag ink strokes in pan mode (same feel as moving canvas cards).
 * Returns true from onPointerDown when the event was consumed (hit ink or cleared selection on empty click).
 */
export function useInkDrag({
  strokes,
  selectedStrokeIds = [],
  onSelectionChange,
  onMoveStrokes,
  onClearNodeSelection,
}) {
  const { scale, pan, viewportRef } = useZoomTransform();
  const dragRef = useRef(null);
  const strokesRef = useRef(strokes);
  const selectedRef = useRef(selectedStrokeIds);
  strokesRef.current = strokes;
  selectedRef.current = selectedStrokeIds;

  const toBoard = useCallback(
    (clientX, clientY) =>
      clientToBoardPoint(clientX, clientY, viewportRef?.current, pan, scale || 1),
    [pan, scale, viewportRef]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return false;
      if (isPenLikePointer(e)) return false;

      const { x, y } = toBoard(e.clientX, e.clientY);
      const hitId = findTopStrokeNearPoint(strokesRef.current, x, y);

      if (!hitId) {
        if (selectedRef.current.length) onSelectionChange?.([]);
        onClearNodeSelection?.();
        return false;
      }

      e.preventDefault();
      e.stopPropagation();

      const chunkIds = getStrokesInChunk(strokesRef.current, hitId);

      onSelectionChange?.(chunkIds);
      onClearNodeSelection?.();

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        appliedDx: 0,
        appliedDy: 0,
        ids: chunkIds,
      };

      const onWinMove = (ev) => {
        const session = dragRef.current;
        if (!session) return;
        ev.preventDefault();

        const totalDx = (ev.clientX - session.startX) / scale;
        const totalDy = (ev.clientY - session.startY) / scale;
        const deltaDx = totalDx - session.appliedDx;
        const deltaDy = totalDy - session.appliedDy;

        if (deltaDx !== 0 || deltaDy !== 0) {
          onMoveStrokes?.(session.ids, deltaDx, deltaDy);
          session.appliedDx = totalDx;
          session.appliedDy = totalDy;
        }
      };

      const onWinUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
      };

      window.addEventListener('pointermove', onWinMove, { passive: false });
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
      return true;
    },
    [toBoard, scale, onSelectionChange, onMoveStrokes, onClearNodeSelection]
  );

  return { onPointerDown };
}
