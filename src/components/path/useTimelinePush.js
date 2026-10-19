import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A timeline card that opens (hover or focus) grows to fit its details. The cards
 * below it in the same column slide down by that much, so none is hidden.
 */
export function useTimelinePush() {
  const [open, setOpen] = useState(null);

  const report = useCallback((id, column, end, extra) => {
    setOpen((prev) => {
      if (extra > 2) {
        return prev && prev.id === id && Math.abs(prev.extra - extra) < 1 ? prev : { id, column, end, extra };
      }
      return prev?.id === id ? null : prev;
    });
  }, []);

  /** Pixels to move a laid-out item (from layoutDayTimeline) down in `column`. */
  const shiftFor = (column, item) => (
    open && open.column === column && open.id !== item.block.id && item.start >= open.end ? open.extra : 0
  );

  return { report, shiftFor };
}

/** Tells `onGrow` how many pixels taller than `baseHeight` the card at `ref` is. */
export function useGrowthReport(ref, baseHeight, onGrow) {
  const callback = useRef(onGrow);
  callback.current = onGrow;

  useEffect(() => {
    const el = ref.current;
    if (!el || !callback.current || baseHeight == null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => callback.current?.(el.offsetHeight - baseHeight));
    observer.observe(el);
    return () => {
      observer.disconnect();
      callback.current?.(0);
    };
  }, [ref, baseHeight]);
}
