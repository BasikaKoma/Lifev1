import { useEffect, useRef } from 'react';
import { platform } from '../platform';

/**
 * Pinch-to-zoom on mobile for non-canvas views (Self, Settings, modals content).
 */
export function useMobilePinchZoom(enabled = true) {
  const ref = useRef(null);
  const stateRef = useRef({
    scale: 1,
    startDistance: 0,
    startScale: 1,
  });

  useEffect(() => {
    if (!enabled || !platform.isMobile) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const getDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const applyScale = (scale) => {
      const clamped = Math.min(2.5, Math.max(0.85, scale));
      stateRef.current.scale = clamped;
      el.style.transform = `scale(${clamped})`;
      el.style.transformOrigin = 'top center';
    };

    const onTouchStart = (event) => {
      if (event.touches.length === 2) {
        stateRef.current.startDistance = getDistance(event.touches);
        stateRef.current.startScale = stateRef.current.scale;
      }
    };

    const onTouchMove = (event) => {
      if (event.touches.length !== 2 || !stateRef.current.startDistance) return;
      event.preventDefault();
      const distance = getDistance(event.touches);
      const next = stateRef.current.startScale * (distance / stateRef.current.startDistance);
      applyScale(next);
    };

    const onTouchEnd = (event) => {
      if (event.touches.length < 2) {
        stateRef.current.startDistance = 0;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.style.transform = '';
    };
  }, [enabled]);

  return ref;
}
