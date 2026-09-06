import { memo, useEffect } from 'react';
import { InkLayer } from './InkLayer';
import { useInkDrawing } from '../hooks/useInkDrawing';
import { useZoomTransform } from './ZoomCanvas';

/**
 * Owns live-stroke state so pointer-move updates do NOT re-render the whole
 * projects board (milestones, lifeline ticks, etc.).
 */
function CanvasInkSurfaceInner({
  tool,
  color,
  size,
  strokes,
  onAddStroke,
  onRemoveStrokes,
  bindDownRef,
  selectedStrokeIds = [],
  width,
  height,
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

  return (
    <InkLayer
      strokes={strokes}
      liveStroke={liveStroke}
      selectedStrokeIds={selectedStrokeIds}
      width={width}
      height={height}
    />
  );
}

export const CanvasInkSurface = memo(CanvasInkSurfaceInner);
