import { useEffect } from 'react';

const TILT_CARD_SELECTOR = '.canvas-node';
const MAX_TILT_X_DEG = 6;
const MAX_TILT_Y_DEG = 8;
/** Degrees of phone tilt that map to a full parallax swing. */
const GYRO_RANGE_DEG = 18;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Vision Pro style hover: the card under the mouse leans toward the pointer and its
 * specular highlight follows it. Writes CSS vars straight to the card so the board
 * never re-renders on mouse move.
 */
export function useHudPointerTilt(hostRef, enabled) {
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host || prefersReducedMotion()) return undefined;

    let active = null;
    let lastEvent = null;
    let raf = 0;

    const release = () => {
      if (!active) return;
      delete active.dataset.hudTilt;
      active.style.removeProperty('--hud-mx');
      active.style.removeProperty('--hud-my');
      active.style.removeProperty('--hud-rx');
      active.style.removeProperty('--hud-ry');
      active = null;
    };

    const apply = () => {
      raf = 0;
      const e = lastEvent;
      if (!e) return;
      // A held button means a card drag or pan — keep cards flat so they track the pointer.
      if (e.buttons !== 0) {
        release();
        return;
      }
      const card = e.target instanceof Element ? e.target.closest(TILT_CARD_SELECTOR) : null;
      if (card !== active) release();
      if (!card || !host.contains(card)) return;
      const rect = card.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      card.style.setProperty('--hud-mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--hud-my', `${(py * 100).toFixed(1)}%`);
      card.style.setProperty('--hud-rx', `${((0.5 - py) * 2 * MAX_TILT_X_DEG).toFixed(2)}deg`);
      card.style.setProperty('--hud-ry', `${((px - 0.5) * 2 * MAX_TILT_Y_DEG).toFixed(2)}deg`);
      card.dataset.hudTilt = '1';
      active = card;
    };

    const onPointerMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      lastEvent = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onPointerLeave = () => {
      lastEvent = null;
      release();
    };

    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave);
    host.addEventListener('pointerdown', release, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('pointerdown', release);
      release();
    };
  }, [hostRef, enabled]);
}

/**
 * Apple TV poster parallax on phones: tilting the device leans every card a little and
 * slides the glass highlight. The resting angle drifts toward however the phone is held,
 * so only deliberate tilts read as motion.
 */
export function useHudGyroParallax(hostRef, enabled) {
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host || typeof window === 'undefined') return undefined;
    if (prefersReducedMotion() || !('DeviceOrientationEvent' in window)) return undefined;
    // iOS only delivers orientation after a permission prompt; never prompt for decoration.
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') return undefined;

    let base = null;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    const paint = () => {
      raf = 0;
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      host.style.setProperty('--hud-gx', current.x.toFixed(3));
      host.style.setProperty('--hud-gy', current.y.toFixed(3));
      if (Math.abs(target.x - current.x) > 0.002 || Math.abs(target.y - current.y) > 0.002) {
        raf = requestAnimationFrame(paint);
      }
    };

    const onOrientation = (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) {
        base = { beta: e.beta, gamma: e.gamma };
        host.dataset.hudGyro = '1';
      }
      base.beta += (e.beta - base.beta) * 0.015;
      base.gamma += (e.gamma - base.gamma) * 0.015;
      target.x = clamp((e.gamma - base.gamma) / GYRO_RANGE_DEG, -1, 1);
      target.y = clamp((e.beta - base.beta) / GYRO_RANGE_DEG, -1, 1);
      if (!raf) raf = requestAnimationFrame(paint);
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      if (raf) cancelAnimationFrame(raf);
      delete host.dataset.hudGyro;
      host.style.removeProperty('--hud-gx');
      host.style.removeProperty('--hud-gy');
    };
  }, [hostRef, enabled]);
}
