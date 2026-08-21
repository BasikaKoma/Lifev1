import { useEffect } from 'react';
import { useZoomTransform } from './ZoomCanvas';
import { useInkDrawing } from '../hooks/useInkDrawing';

/**
 * Registers ink pointer handlers on the zoom viewport (full visible area).
 * InkLayer only renders strokes; this handles starting draws on empty margins.
 */
export function InkGestureHost({
  tool,
  color,
  size,
  strokes,
  onAddStroke,
  onRemoveStrokes,
  bindDownRef,
  onLiveStroke,
}) {
  const { scale, pan, viewportRef } = useZoomTransform();
  const { liveStroke, inkHandlers } = useInkDrawing({
    tool,
    color,
    size,
    strokes,
    pan,
    scale,
    viewportRef,
    onAddStroke,
    onRemoveStrokes,
  });

  useEffect(() => {
    if (bindDownRef) {
      bindDownRef.current = inkHandlers.onPointerDown;
    }
    return () => {
      if (bindDownRef) bindDownRef.current = null;
    };
  }, [bindDownRef, inkHandlers.onPointerDown]);

  useEffect(() => {
    onLiveStroke?.(liveStroke);
  }, [liveStroke, onLiveStroke]);

  return null;
}
