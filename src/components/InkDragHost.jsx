import { useEffect } from 'react';
import { useInkDrag } from '../hooks/useInkDrag';

/** Click / drag ink strokes on the zoom viewport (pan tool). */
export function InkDragHost({
  strokes,
  selectedStrokeIds,
  onSelectionChange,
  onMoveStrokes,
  onClearNodeSelection,
  bindDownRef,
}) {
  const { onPointerDown } = useInkDrag({
    strokes,
    selectedStrokeIds,
    onSelectionChange,
    onMoveStrokes,
    onClearNodeSelection,
  });

  useEffect(() => {
    if (bindDownRef) {
      bindDownRef.current = onPointerDown;
    }
    return () => {
      if (bindDownRef) bindDownRef.current = null;
    };
  }, [bindDownRef, onPointerDown]);

  return null;
}
