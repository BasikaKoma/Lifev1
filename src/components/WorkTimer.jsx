import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkTimer } from '../hooks/useWorkTimer';
import {
  HALF_HOUR_MS,
  chimeHalfHour,
  chimeWorkTimer,
  formatClock,
  isDeepWorkTimer,
  markWorkTimerChimed,
} from '../lib/workTimer';
import './WorkTimer.css';

const OFFSET_KEY = 'lifev1-work-timer-offset';
const DRAG_THRESHOLD = 6;
const EDGE = 8;

function readOffset() {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFSET_KEY) || 'null');
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

function writeOffset(offset) {
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(offset));
  } catch {
    /* the position is only a convenience */
  }
}

// The offset moves the timer away from its CSS spot; keep the result on screen.
function clampOffset(node, applied, next) {
  if (!node || !window.innerWidth || !window.innerHeight) return next;
  const rect = node.getBoundingClientRect();
  const baseX = rect.left - applied.x;
  const baseY = rect.top - applied.y;
  const maxX = Math.max(EDGE, window.innerWidth - rect.width - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - rect.height - EDGE);
  return {
    x: Math.round(Math.min(maxX, Math.max(EDGE, baseX + next.x)) - baseX),
    y: Math.round(Math.min(maxY, Math.max(EDGE, baseY + next.y)) - baseY),
  };
}

export function WorkTimer({ onOpenBlock }) {
  const { session, elapsedMs, pause, resume, stop } = useWorkTimer();
  const baseTitle = useRef(null);
  const nodeRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const [offset, setOffset] = useState(readOffset);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  // Where the user left it; a smaller window only clamps the shown offset.
  const preferredRef = useRef(offset);
  const hasSession = Boolean(session);
  const deep = isDeepWorkTimer(session);
  const targetMs = (session?.targetMinutes || 0) * 60000;
  const over = targetMs > 0 && elapsedMs >= targetMs;
  const progress = targetMs ? Math.min(100, Math.round((elapsedMs / targetMs) * 100)) : 0;

  useEffect(() => {
    if (session && baseTitle.current == null) baseTitle.current = document.title;
    if (!session) {
      if (baseTitle.current != null) document.title = baseTitle.current;
      baseTitle.current = null;
      return;
    }
    const name = deep ? 'Deep Work' : session.label;
    document.title = `${formatClock(elapsedMs)} · ${name}`;
  }, [session, elapsedMs, deep]);

  useEffect(() => {
    if (!session?.running) return;
    const halfHours = Math.floor(elapsedMs / HALF_HOUR_MS);
    const targetDue = deep && over && !session.targetChimed;
    const halfHourDue = halfHours > (session.halfHoursChimed || 0);
    if (!targetDue && !halfHourDue) return;
    if (targetDue) chimeWorkTimer();
    else chimeHalfHour();
    markWorkTimerChimed({ target: targetDue, halfHours });
  }, [deep, over, session, elapsedMs]);

  useLayoutEffect(() => {
    if (!hasSession) return undefined;
    const fit = () => {
      if (dragRef.current?.active) return;
      const current = offsetRef.current;
      const next = clampOffset(nodeRef.current, current, preferredRef.current);
      if (next.x !== current.x || next.y !== current.y) setOffset(next);
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (observer && nodeRef.current) observer.observe(nodeRef.current);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [hasSession]);

  if (!session) return null;

  const showTitle = session.label && session.label !== session.blockType;
  const meta = !targetMs
    ? null
    : over
      ? `${formatClock(elapsedMs - targetMs)} over`
      : `${formatClock(targetMs - elapsedMs)} left`;

  const onPointerDown = (event) => {
    movedRef.current = false;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest('button')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offsetRef.current,
      active: false,
    };
    // Capture at once so a quick flick that leaves the card still drags it.
    try {
      nodeRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture is best effort */
    }
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      movedRef.current = true;
      setDragging(true);
    }
    setOffset(clampOffset(nodeRef.current, offsetRef.current, {
      x: drag.origin.x + dx,
      y: drag.origin.y + dy,
    }));
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    setDragging(false);
    preferredRef.current = offsetRef.current;
    writeOffset(offsetRef.current);
  };

  const openBlock = (event) => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    if (event.target.closest('button')) return;
    onOpenBlock?.(session.blockId);
  };

  return (
    <section
      ref={nodeRef}
      className={`work-timer${deep ? ' work-timer--deep' : ''}${over ? ' work-timer--over' : ''}${session.running ? '' : ' work-timer--paused'}${dragging ? ' work-timer--dragging' : ''}`}
      style={{
        '--timer-p': `${progress}%`,
        ...(offset.x || offset.y ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : null),
      }}
      aria-label={deep ? 'Deep Work timer' : 'Work timer'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={openBlock}
    >
      <div
        className="work-timer__copy"
        role="button"
        tabIndex={0}
        aria-label={`Open ${session.label}`}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onOpenBlock?.(session.blockId);
        }}
      >
        <p className="work-timer__kicker">
          {deep ? 'Deep Work' : session.blockType}
          {session.running ? '' : ' · Paused'}
        </p>
        {showTitle ? <strong className="work-timer__title">{session.label}</strong> : null}
        <p className="work-timer__clock">{formatClock(elapsedMs)}</p>
        {meta ? <p className="work-timer__meta">{meta}</p> : null}
        {targetMs ? (
          <div className="work-timer__bar" aria-hidden="true">
            <span />
          </div>
        ) : null}
      </div>
      <div className="work-timer__actions">
        {session.running ? (
          <button type="button" onClick={pause}>Pause</button>
        ) : (
          <button type="button" className="work-timer__resume" onClick={resume}>Resume</button>
        )}
        <button type="button" className="work-timer__stop" onClick={stop}>Stop</button>
      </div>
    </section>
  );
}
