import { useEffect, useRef } from 'react';
import { useWorkTimer } from '../hooks/useWorkTimer';
import { chimeWorkTimer, formatClock, isDeepWorkTimer, markWorkTimerChimed } from '../lib/workTimer';
import './WorkTimer.css';

export function WorkTimer() {
  const { session, elapsedMs, pause, resume, stop } = useWorkTimer();
  const baseTitle = useRef(null);
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
    if (!deep || !session?.running || !targetMs || session.targetChimed || !over) return;
    chimeWorkTimer();
    markWorkTimerChimed();
  }, [deep, over, session, targetMs]);

  if (!session) return null;

  const showTitle = session.label && session.label !== session.blockType;
  const meta = !targetMs
    ? null
    : over
      ? `${formatClock(elapsedMs - targetMs)} over`
      : `${formatClock(targetMs - elapsedMs)} left`;

  return (
    <section
      className={`work-timer${deep ? ' work-timer--deep' : ''}${over ? ' work-timer--over' : ''}${session.running ? '' : ' work-timer--paused'}`}
      style={{ '--timer-p': `${progress}%` }}
      aria-label={deep ? 'Deep Work timer' : 'Work timer'}
    >
      <div className="work-timer__copy">
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
