import { useCallback, useEffect, useRef, useState } from 'react';

export const DAY_VIEW_PHASE = {
  timeline: 'timeline',
  daySelected: 'day-selected',
  dayTransitioning: 'day-transitioning',
  dayExpanded: 'day-expanded',
  returningToTimeline: 'returning-to-timeline',
};

export const LIFELINE_VIEW_KIND = {
  day: 'day',
  week: 'week',
  month: 'month',
};

export const DAY_VIEW_DIVE_SCALE = 1;
export const DAY_VIEW_ENTER_MS = 920;
export const DAY_VIEW_BODY_MS = 1040;
export const DAY_VIEW_EXIT_MS = 720;

const SLIT_PCT = 0.42;

function defaultOrigin() {
  return {
    x: '50%',
    y: '50%',
    slitTop: '49.58%',
    slitBottom: '49.58%',
    slitLeft: '38%',
    slitRight: '38%',
  };
}

export function originPercentFromRects(tickRect, containerRect) {
  if (!tickRect || !containerRect || containerRect.width < 1 || containerRect.height < 1) {
    return defaultOrigin();
  }
  const cx = tickRect.left + (tickRect.width || 0) / 2;
  const cy = tickRect.top + (tickRect.height || 0) / 2;
  const x = Math.max(6, Math.min(94, ((cx - containerRect.left) / containerRect.width) * 100));
  const y = Math.max(8, Math.min(92, ((cy - containerRect.top) / containerRect.height) * 100));
  const tickW = Math.max(56, Number(tickRect.width) || 72);
  const side = Math.max(10, Math.min(44, (1 - tickW / containerRect.width) * 50));
  return {
    x: `${x.toFixed(2)}%`,
    y: `${y.toFixed(2)}%`,
    slitTop: `${Math.max(0, y - SLIT_PCT).toFixed(2)}%`,
    slitBottom: `${Math.max(0, 100 - y - SLIT_PCT).toFixed(2)}%`,
    slitLeft: `${side.toFixed(2)}%`,
    slitRight: `${side.toFixed(2)}%`,
  };
}

export function originToCssVars(origin) {
  const o = origin?.y ? { ...defaultOrigin(), ...origin } : defaultOrigin();
  return {
    '--ll-enter-x': o.x,
    '--ll-enter-y': o.y,
    '--ll-slit-top': o.slitTop,
    '--ll-slit-bottom': o.slitBottom,
    '--ll-slit-left': o.slitLeft,
    '--ll-slit-right': o.slitRight,
  };
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Day / period view — CSS overlay only. No canvas pan during open/close.
 */
export function useLifelineDayView() {
  const [phase, setPhase] = useState(DAY_VIEW_PHASE.timeline);
  const [date, setDate] = useState(null);
  const [kind, setKind] = useState(LIFELINE_VIEW_KIND.day);
  const [origin, setOrigin] = useState(defaultOrigin);
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
  const isPeriod = kind === LIFELINE_VIEW_KIND.week || kind === LIFELINE_VIEW_KIND.month;

  const open = useCallback(
    async ({
      date: nextDate,
      kind: nextKind = LIFELINE_VIEW_KIND.day,
      origin: nextOrigin,
      originRect,
      snapshot,
    }) => {
      if (!nextDate) return;
      const resolvedKind = nextKind || LIFELINE_VIEW_KIND.day;
      const alreadyOpen = phaseRef.current === DAY_VIEW_PHASE.dayExpanded;
      setDate(nextDate);
      setKind(resolvedKind);
      if (nextOrigin?.x && nextOrigin?.y) setOrigin(nextOrigin);
      else if (originRect) setOrigin(originPercentFromRects(originRect, null));

      if (alreadyOpen) return;

      clearTimers();
      snapshotRef.current = snapshot || null;
      if (nextOrigin?.x && nextOrigin?.y) setOrigin(nextOrigin);

      setPhase(DAY_VIEW_PHASE.dayExpanded);
    },
    [clearTimers]
  );

  const close = useCallback(() => {
    const current = phaseRef.current;
    if (
      current === DAY_VIEW_PHASE.timeline
      || current === DAY_VIEW_PHASE.returningToTimeline
    ) {
      return;
    }
    clearTimers();

    const finish = () => {
      setPhase(DAY_VIEW_PHASE.timeline);
      setDate(null);
      setKind(LIFELINE_VIEW_KIND.day);
      setOrigin(defaultOrigin());
      snapshotRef.current = null;
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    setPhase(DAY_VIEW_PHASE.returningToTimeline);
    const id = window.setTimeout(finish, DAY_VIEW_EXIT_MS);
    timersRef.current.push(id);
  }, [clearTimers]);

  return {
    phase,
    date,
    kind,
    origin,
    originRect: null,
    isOpen,
    isExpanded,
    isActive,
    isPeriod,
    snapshot: snapshotRef,
    open,
    close,
  };
}
