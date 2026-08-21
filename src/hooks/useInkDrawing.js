import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clientToBoardPoint,
  createInkStroke,
  findStrokeIdsNearPoint,
  markInkGestureEnd,
  markInkGestureStart,
  registerInkCommit,
  shouldHandleInkPointer,
} from '../utils/inkStrokes';
import { recordInkStrokeEnd, resolveGroupIdForNewStroke } from '../utils/inkGroups';

/**
 * Freehand ink + eraser for a zoomed board.
 * Uses window-level move/up listeners so strokes don't die if pointer capture drops
 * (common with Huion / Windows Ink).
 */
export function useInkDrawing({
  tool,
  color,
  size,
  strokes,
  pan,
  scale,
  viewportRef,
  onAddStroke,
  onRemoveStrokes,
}) {
  const [liveStroke, setLiveStroke] = useState(null);
  const drawingRef = useRef(null);
  const erasedIdsRef = useRef(new Set());
  const strokesRef = useRef(strokes);
  const spaceHeld = useRef(false);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);
  const onAddStrokeRef = useRef(onAddStroke);
  const onRemoveStrokesRef = useRef(onRemoveStrokes);
  const liveRafRef = useRef(0);
  const pendingLiveRef = useRef(null);

  const flushLiveStroke = useCallback(() => {
    liveRafRef.current = 0;
    if (pendingLiveRef.current) {
      setLiveStroke(pendingLiveRef.current);
      pendingLiveRef.current = null;
    }
  }, []);

  const queueLiveStroke = useCallback((stroke) => {
    pendingLiveRef.current = stroke;
    if (!liveRafRef.current) {
      liveRafRef.current = requestAnimationFrame(flushLiveStroke);
    }
  }, [flushLiveStroke]);

  strokesRef.current = strokes;
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;
  panRef.current = pan;
  scaleRef.current = scale;
  onAddStrokeRef.current = onAddStroke;
  onRemoveStrokesRef.current = onRemoveStrokes;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      spaceHeld.current = true;
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    const onBlur = () => {
      spaceHeld.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const toBoard = useCallback((clientX, clientY) => {
    return clientToBoardPoint(
      clientX,
      clientY,
      viewportRef?.current,
      panRef.current,
      scaleRef.current || 1
    );
  }, [viewportRef]);

  const eraseAt = useCallback((x, y, eraseSize) => {
    const radius = Math.max(8, eraseSize * 2.5);
    const hits = findStrokeIdsNearPoint(strokesRef.current, x, y, radius);
    if (hits.length === 0) return;
    const fresh = [];
    for (const id of hits) {
      if (!erasedIdsRef.current.has(id)) {
        erasedIdsRef.current.add(id);
        fresh.push(id);
      }
    }
    if (fresh.length > 0) {
      onRemoveStrokesRef.current?.(fresh);
    }
  }, []);

  const endStroke = useCallback(() => {
    const current = drawingRef.current;
    drawingRef.current = null;
    if (liveRafRef.current) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = 0;
    }
    pendingLiveRef.current = null;
    setLiveStroke(null);

    if (!current) {
      markInkGestureEnd();
      return;
    }

    if (current.mode === 'pen' && current.points.length > 0) {
      onAddStrokeRef.current?.({
        id: current.id,
        points: current.points,
        color: current.color,
        size: current.size,
        opacity: 1,
        groupId: current.groupId,
      });
      recordInkStrokeEnd({
        id: current.id,
        points: current.points,
        groupId: current.groupId,
      });
    }

    erasedIdsRef.current = new Set();
    markInkGestureEnd();
  }, []);

  useEffect(() => registerInkCommit(endStroke), [endStroke]);

  const detachWindowListenersRef = useRef(() => {});

  const onPointerDown = useCallback(
    (e) => {
      if (e.button === 1) return;
      if (spaceHeld.current) return;
      if (!shouldHandleInkPointer(toolRef.current, e)) return;

      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      try {
        target.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      markInkGestureStart();

      const activeTool = toolRef.current;
      const activeColor = colorRef.current;
      const activeSize = sizeRef.current;
      const { x, y } = toBoard(e.clientX, e.clientY);
      const pressure = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5;

      if (activeTool === 'eraser') {
        erasedIdsRef.current = new Set();
        drawingRef.current = { mode: 'eraser', size: activeSize, pointerId: e.pointerId };
        eraseAt(x, y, activeSize);
      } else {
        const points = [[x, y, pressure]];
        const groupId = resolveGroupIdForNewStroke([x, y]);
        const live = createInkStroke({ points, color: activeColor, size: activeSize, groupId });
        drawingRef.current = {
          mode: 'pen',
          id: live.id,
          points,
          color: activeColor,
          size: activeSize,
          groupId,
          pointerId: e.pointerId,
        };
        queueLiveStroke(live);
      }

      const onWinMove = (ev) => {
        const current = drawingRef.current;
        if (!current || current.pointerId !== ev.pointerId) return;
        ev.preventDefault();

        // Include coalesced pen samples for smoother Huion strokes
        const samples =
          typeof ev.getCoalescedEvents === 'function' && ev.getCoalescedEvents().length > 0
            ? ev.getCoalescedEvents()
            : [ev];

        for (const sample of samples) {
          const pt = toBoard(sample.clientX, sample.clientY);
          if (current.mode === 'eraser') {
            eraseAt(pt.x, pt.y, current.size);
            continue;
          }
          const p =
            typeof sample.pressure === 'number' && sample.pressure > 0 ? sample.pressure : 0.5;
          const last = current.points[current.points.length - 1];
          if (last && Math.hypot(last[0] - pt.x, last[1] - pt.y) < 1.2) continue;
          current.points.push([pt.x, pt.y, p]);
        }

        if (current.mode === 'pen') {
          queueLiveStroke({
            id: current.id,
            points: current.points.slice(),
            color: current.color,
            size: current.size,
            opacity: 1,
          });
        }
      };

      const onWinUp = (ev) => {
        const current = drawingRef.current;
        if (current && current.pointerId !== ev.pointerId) return;
        detachWindowListenersRef.current();
        try {
          target.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
        endStroke();
      };

      detachWindowListenersRef.current();
      window.addEventListener('pointermove', onWinMove, { passive: false });
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);
      detachWindowListenersRef.current = () => {
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinUp);
        detachWindowListenersRef.current = () => {};
      };
    },
    [toBoard, eraseAt, endStroke, queueLiveStroke]
  );

  useEffect(
    () => () => {
      detachWindowListenersRef.current();
      if (liveRafRef.current) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = 0;
      }
      if (drawingRef.current) {
        drawingRef.current = null;
        markInkGestureEnd();
      }
    },
    []
  );

  return {
    liveStroke,
    inkHandlers: {
      onPointerDown,
    },
  };
}
