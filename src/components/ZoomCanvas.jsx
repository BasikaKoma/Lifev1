import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { panForZoomAtPoint, shouldHandleInkPointer, shouldStartPan, viewportClientPoint } from '../utils/inkStrokes';

const ZoomTransformContext = createContext({ scale: 1, pan: { x: 0, y: 0 }, viewportRef: null });

export function useZoomTransform() {
  return useContext(ZoomTransformContext);
}

const DEFAULT_MIN_SCALE = 0.35;
const DEFAULT_MAX_SCALE = 1.25;

function clampScale(value, minScale, maxScale) {
  return Math.min(maxScale, Math.max(minScale, value));
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function inkToolFromMode(interactionMode) {
  if (interactionMode === 'erase') return 'eraser';
  if (interactionMode === 'draw') return 'pen';
  return 'pan';
}

export const ZoomCanvas = forwardRef(function ZoomCanvas({
  children,
  className = '',
  defaultScale = 0.85,
  defaultPan = { x: 32, y: 24 },
  panExcludeSelector = '.milestone-canvas-card, .idea-canvas-card, .roadmap-row, .roadmap__header, .roadmap-card, .roadmap-node, .quick-note-orb, .idea-backlog-item, .roadmap-canvas__header, .drawing-toolbar',
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
  onTransformChange,
  viewportStyle,
  showToolbar = true,
  /** @type {'pan'|'draw'|'erase'|'select'} */
  interactionMode = 'pan',
  onInkPointerDown,
  onSelectPointerDown,
  onInkDragPointerDown,
  /** Pan viewport so this canvas point sits near center. Pass `trigger` to re-run (once per trigger). */
  scrollToCanvasPoint = null,
  /** Return true to skip default wheel handling (pan / ctrl zoom). */
  interceptWheel = null,
}, ref) {
  const [scale, setScale] = useState(defaultScale);
  const [pan, setPan] = useState(defaultPan);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const spaceHeld = useRef(false);
  const transformRef = useRef({ scale: defaultScale, pan: defaultPan });
  const appliedScrollTrigger = useRef(null);
  const animatingRef = useRef(false);
  const animCancelRef = useRef(null);
  // Keep in sync during render so layout scroll math never reads a stale pan.
  // Skip while a DOM-driven animation owns the transform (avoids fighting rAF).
  if (!animatingRef.current) {
    transformRef.current = { scale, pan };
  }

  const applyScaleAtViewportPoint = useCallback((newScale, pointX, pointY) => {
    const currentScale = transformRef.current.scale;
    const currentPan = transformRef.current.pan;
    const nextScale = clampScale(newScale, minScale, maxScale);
    if (nextScale === currentScale) return currentScale;
    const nextPan = panForZoomAtPoint(currentPan, currentScale, nextScale, pointX, pointY);
    transformRef.current = { scale: nextScale, pan: nextPan };
    setScale(nextScale);
    setPan(nextPan);
    return nextScale;
  }, [minScale, maxScale]);

  const zoomBy = useCallback((delta) => {
    const viewport = viewportRef.current;
    const currentScale = transformRef.current.scale;
    const nextScale = clampScale(currentScale + delta, minScale, maxScale);
    if (!viewport) {
      setScale(nextScale);
      return;
    }
    applyScaleAtViewportPoint(nextScale, viewport.clientWidth / 2, viewport.clientHeight / 2);
  }, [minScale, maxScale, applyScaleAtViewportPoint]);

  const resetView = useCallback(() => {
    setScale(defaultScale);
    setPan(defaultPan);
  }, [defaultScale, defaultPan.x, defaultPan.y]);

  const resetZoomTo100 = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setScale(1);
      return;
    }
    applyScaleAtViewportPoint(1, viewport.clientWidth / 2, viewport.clientHeight / 2);
  }, [applyScaleAtViewportPoint]);

  const setPanValue = useCallback((nextPan) => {
    if (!nextPan || typeof nextPan.x !== 'number' || typeof nextPan.y !== 'number') return;
    transformRef.current = { ...transformRef.current, pan: nextPan };
    setPan(nextPan);
  }, []);

  const paintContentTransform = useCallback((nextScale, nextPan) => {
    const el = contentRef.current;
    if (el) {
      el.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextScale})`;
    }
    transformRef.current = { scale: nextScale, pan: nextPan };
  }, []);

  const setTransformValue = useCallback((next) => {
    if (!next) return;
    const nextScale =
      typeof next.scale === 'number'
        ? clampScale(next.scale, minScale, maxScale)
        : transformRef.current.scale;
    const nextPan =
      next.pan && typeof next.pan.x === 'number' && typeof next.pan.y === 'number'
        ? next.pan
        : transformRef.current.pan;
    paintContentTransform(nextScale, nextPan);
    setScale(nextScale);
    setPan(nextPan);
  }, [minScale, maxScale, paintContentTransform]);

  const animateTo = useCallback((toScale, toPan, durationMs = 400, options = {}) => {
    if (animCancelRef.current) {
      animCancelRef.current();
      animCancelRef.current = null;
    }

    const clamp = options.clamp !== false;
    const rawScale = typeof toScale === 'number' ? toScale : transformRef.current.scale;
    const targetScale = clamp
      ? clampScale(rawScale, minScale, maxScale)
      : Math.max(0.05, rawScale);
    const targetPan = toPan && typeof toPan.x === 'number'
      ? toPan
      : transformRef.current.pan;

    if (!durationMs || prefersReducedMotion()) {
      paintContentTransform(targetScale, targetPan);
      setScale(targetScale);
      setPan(targetPan);
      return Promise.resolve();
    }

    const fromScale = transformRef.current.scale;
    const fromPan = { ...transformRef.current.pan };
    const start = performance.now();
    animatingRef.current = true;
    if (contentRef.current) contentRef.current.style.willChange = 'transform';

    return new Promise((resolve) => {
      let raf = 0;
      // Smooth dive — ease-in then settle (Maps-like camera).
      const ease = (t) => 1 - ((1 - t) ** 3);

      const finish = () => {
        animatingRef.current = false;
        animCancelRef.current = null;
        if (contentRef.current) contentRef.current.style.willChange = '';
        paintContentTransform(targetScale, targetPan);
        setScale(targetScale);
        setPan(targetPan);
        resolve();
      };

      const tick = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        const e = ease(t);
        paintContentTransform(
          fromScale + (targetScale - fromScale) * e,
          {
            x: fromPan.x + (targetPan.x - fromPan.x) * e,
            y: fromPan.y + (targetPan.y - fromPan.y) * e,
          }
        );
        if (t < 1) raf = requestAnimationFrame(tick);
        else finish();
      };

      animCancelRef.current = () => {
        cancelAnimationFrame(raf);
        finish();
      };
      raf = requestAnimationFrame(tick);
    });
  }, [minScale, maxScale, paintContentTransform]);

  useImperativeHandle(ref, () => ({
    zoomBy,
    resetView,
    resetZoomTo100,
    setPan: setPanValue,
    setTransform: setTransformValue,
    animateTo,
    getScale: () => transformRef.current.scale,
    getPan: () => ({ ...transformRef.current.pan }),
    getTransform: () => ({
      scale: transformRef.current.scale,
      pan: { ...transformRef.current.pan },
    }),
  }), [zoomBy, resetView, resetZoomTo100, setPanValue, setTransformValue, animateTo]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
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

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('button, a, input, textarea, select, .drawing-toolbar')) return;

    const onExcluded = panExcludeSelector && e.target.closest(panExcludeSelector);
    const inkTool = inkToolFromMode(interactionMode);
    const wantsPan = shouldStartPan(e, interactionMode, spaceHeld.current);

    if (interactionMode === 'select' && onSelectPointerDown && !onExcluded) {
      onSelectPointerDown(e);
      return;
    }

    if (interactionMode === 'pan' && onInkDragPointerDown && !onExcluded && wantsPan) {
      const handled = onInkDragPointerDown(e);
      if (handled) return;
    }

    if (onInkPointerDown && !wantsPan && shouldHandleInkPointer(inkTool, e) && !onExcluded) {
      onInkPointerDown(e);
      return;
    }

    if (onExcluded) return;
    if (!wantsPan) return;

    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pan.x, pan.y, panExcludeSelector, interactionMode, onInkPointerDown, onSelectPointerDown, onInkDragPointerDown]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const stopDrag = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e) => {
      e.preventDefault();

      if (interceptWheel?.(e, {
        scale: transformRef.current.scale,
        pan: transformRef.current.pan,
        viewportRef,
        setScale,
        setPan,
        minScale,
        maxScale,
      })) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const { scale: currentScale, pan: currentPan } = transformRef.current;
        const { x: pointX, y: pointY } = viewportClientPoint(e.clientX, e.clientY, viewport);
        const zoomFactor = Math.exp(-e.deltaY * 0.002);
        const newScale = clampScale(currentScale * zoomFactor, minScale, maxScale);
        if (newScale === currentScale) return;

        const newPan = panForZoomAtPoint(currentPan, currentScale, newScale, pointX, pointY);
        transformRef.current = { scale: newScale, pan: newPan };
        setScale(newScale);
        setPan(newPan);
        return;
      }
      setPan((current) => ({
        x: current.x - e.deltaX,
        y: current.y - e.deltaY,
      }));
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [minScale, maxScale, interceptWheel]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const pinchState = { startDistance: 0, startScale: 1 };

    const getTouchDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const getTouchMidpoint = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const onTouchStart = (event) => {
      if (event.touches.length !== 2) return;
      pinchState.startDistance = getTouchDistance(event.touches);
      pinchState.startScale = transformRef.current.scale;
      setDragging(false);
      dragStart.current = null;
    };

    const onTouchMove = (event) => {
      if (event.touches.length !== 2 || !pinchState.startDistance) return;
      event.preventDefault();

      const distance = getTouchDistance(event.touches);
      const ratio = distance / pinchState.startDistance;
      const targetScale = clampScale(pinchState.startScale * ratio, minScale, maxScale);
      const { x: midX, y: midY } = getTouchMidpoint(event.touches);
      const { x: pointX, y: pointY } = viewportClientPoint(midX, midY, viewport);

      applyScaleAtViewportPoint(targetScale, pointX, pointY);
    };

    const onTouchEnd = (event) => {
      if (event.touches.length < 2) {
        pinchState.startDistance = 0;
      }
    };

    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);
    viewport.addEventListener('touchcancel', onTouchEnd);

    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [minScale, maxScale, applyScaleAtViewportPoint]);

  // Drive transform on the DOM node so parent re-renders cannot reset mid-animation.
  useLayoutEffect(() => {
    if (animatingRef.current) return;
    paintContentTransform(scale, pan);
  }, [scale, pan, paintContentTransform]);

  useEffect(() => {
    // Skip parent notifications mid DOM-animation (prevents RoadmapCanvas thrash).
    if (animatingRef.current) return;
    onTransformChange?.({ scale, pan, viewportRef });
  }, [scale, pan, onTransformChange]);

  useLayoutEffect(() => {
    if (!scrollToCanvasPoint || typeof scrollToCanvasPoint.y !== 'number') {
      // Keep last applied trigger — clearing here re-centers on "today" after
      // transient nulls (lifeline dayHeight zoom / spine sync).
      return undefined;
    }
    const trigger = scrollToCanvasPoint.trigger;
    if (trigger == null) return undefined;
    if (appliedScrollTrigger.current === trigger) return undefined;

    const centerOnPoint = () => {
      const viewport = viewportRef.current;
      if (!viewport) return false;
      // Use the client box (excludes border) — this matches where canvas content is laid out.
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (w < 1 || h < 1) return false;
      const s = transformRef.current.scale;
      setPan({
        x: w / 2 - scrollToCanvasPoint.x * s,
        y: h / 2 - scrollToCanvasPoint.y * s,
      });
      appliedScrollTrigger.current = trigger;
      return true;
    };

    if (centerOnPoint()) return undefined;

    let retryTimer;
    const raf = requestAnimationFrame(() => {
      if (centerOnPoint()) return;
      retryTimer = window.setTimeout(centerOnPoint, 100);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    scrollToCanvasPoint?.trigger,
    scrollToCanvasPoint?.x,
    scrollToCanvasPoint?.y,
  ]);

  const percent = Math.round(scale * 100);
  const transformCtx = useMemo(
    () => ({ scale, pan, viewportRef }),
    [scale, pan]
  );

  return (
    <ZoomTransformContext.Provider value={transformCtx}>
      <div className={`zoom-canvas ${className}`.trim()}>
        {showToolbar && (
          <div className="zoom-canvas__toolbar">
            <button type="button" className="zoom-canvas__btn" onClick={() => zoomBy(-0.1)} aria-label="Zoom out">
              −
            </button>
            <span className="zoom-canvas__level">{percent}%</span>
            <button type="button" className="zoom-canvas__btn" onClick={() => zoomBy(0.1)} aria-label="Zoom in">
              +
            </button>
            <button type="button" className="zoom-canvas__btn zoom-canvas__btn--text" onClick={resetZoomTo100}>
              100%
            </button>
            <button type="button" className="zoom-canvas__btn zoom-canvas__btn--text" onClick={resetView}>
              Reset
            </button>
            <span className="zoom-canvas__hint">Drag cards or writing to move · Scroll to pan · Ctrl+scroll to zoom</span>
          </div>
        )}

        <div
          ref={viewportRef}
          className={`zoom-canvas__viewport ${dragging ? 'zoom-canvas__viewport--dragging' : ''}`}
          style={viewportStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div ref={contentRef} className="zoom-canvas__content">
            {children}
          </div>
        </div>
      </div>
    </ZoomTransformContext.Provider>
  );
});
