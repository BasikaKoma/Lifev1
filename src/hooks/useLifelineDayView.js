import { useCallback, useEffect, useRef, useState } from 'react';

export const DAY_VIEW_PHASE = {
  timeline: 'timeline',
  daySelected: 'day-selected',
  dayTransitioning: 'day-transitioning',
  dayExpanded: 'day-expanded',
  returningToTimeline: 'returning-to-timeline',
};

/** Kept for callers; Premium Day Lab uses pan + fade (no exaggerated dive). */
export const DAY_VIEW_DIVE_SCALE = 1;
const OPEN_TRANSITION_MS = 420;
const CLOSE_TRANSITION_MS = 360;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Day view state machine — gentle pan to the day, then Premium surface fade-in.
 */
export function useLifelineDayView() {
  const [phase, setPhase] = useState(DAY_VIEW_PHASE.timeline);
  const [date, setDate] = useState(null);
  const [originRect, setOriginRect] = useState(null);
  const snapshotRef = useRef(null);
  const phaseRef = useRef(DAY_VIEW_PHASE.timeline);
  const timersRef = useRef([]);

  phaseRef.current = phase;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isOpen = phase !== DAY_VIEW_PHASE.timeline;
  const isExpanded = phase === DAY_VIEW_PHASE.dayExpanded;
  const isActive = isOpen;

  const open = useCallback(
    async ({ date: nextDate, originRect: rect, snapshot, zoomApi, targetPan, targetScale }) => {
      if (!nextDate) return;
      clearTimers();
      snapshotRef.current = snapshot || null;
      setDate(nextDate);
      setOriginRect(rect || null);

      const reduced = prefersReducedMotion();
      const scale = targetScale ?? zoomApi?.getScale?.() ?? 1;

      if (reduced) {
        if (zoomApi && targetPan) {
          zoomApi.animateTo?.(scale, targetPan, 0);
        }
        setPhase(DAY_VIEW_PHASE.dayExpanded);
        return;
      }

      setPhase(DAY_VIEW_PHASE.dayTransitioning);

      if (zoomApi?.animateTo && targetPan) {
        zoomApi.animateTo(scale, targetPan, OPEN_TRANSITION_MS);
      }

      const t = window.setTimeout(() => {
        setPhase(DAY_VIEW_PHASE.dayExpanded);
      }, OPEN_TRANSITION_MS);
      timersRef.current.push(t);
    },
    [clearTimers]
  );

  const close = useCallback(
    async (zoomApi) => {
      const current = phaseRef.current;
      if (
        current === DAY_VIEW_PHASE.timeline
        || current === DAY_VIEW_PHASE.returningToTimeline
      ) {
        return;
      }
      clearTimers();
      const snap = snapshotRef.current;
      const reduced = prefersReducedMotion();

      setPhase(DAY_VIEW_PHASE.returningToTimeline);

      const finish = () => {
        setPhase(DAY_VIEW_PHASE.timeline);
        setDate(null);
        setOriginRect(null);
        snapshotRef.current = null;
      };

      if (reduced) {
        if (snap && zoomApi) {
          zoomApi.animateTo?.(snap.scale, snap.pan, 0);
        }
        finish();
        return;
      }

      if (snap && zoomApi?.animateTo) {
        await zoomApi.animateTo(snap.scale, snap.pan, CLOSE_TRANSITION_MS);
      } else {
        await new Promise((r) => {
          const id = window.setTimeout(r, CLOSE_TRANSITION_MS);
          timersRef.current.push(id);
        });
      }
      finish();
    },
    [clearTimers]
  );

  return {
    phase,
    date,
    originRect,
    isOpen,
    isExpanded,
    isActive,
    snapshot: snapshotRef,
    open,
    close,
  };
}
