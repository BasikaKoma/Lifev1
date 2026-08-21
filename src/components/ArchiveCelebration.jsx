import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatArchiveDate } from '../utils/archive';

const PARTICLE_COUNT = 36;
const HOLD_MS = 120;
const EXIT_MS = 2200;
const DONE_MS = 2800;
const EXIT_FADE_MS = 400;

function buildParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const dist = 80 + (i % 5) * 28;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 20,
      delay: (i % 8) * 0.04,
      hue: (i * 17) % 360,
      size: 6 + (i % 4) * 2,
    };
  });
}

/**
 * Premium completion celebration overlay.
 * Call onDone after the animation so the parent can clear state.
 */
export function ArchiveCelebration({ title, subtitle, archivedAt, completedAt, onDone }) {
  const [phase, setPhase] = useState('enter');
  const particles = useMemo(() => buildParticles(), []);
  const onDoneRef = useRef(onDone);
  const dismissedRef = useRef(false);

  onDoneRef.current = onDone;

  const dateLabel =
    formatArchiveDate(completedAt || archivedAt) || formatArchiveDate(new Date().toISOString());

  const finish = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDoneRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    setPhase('exit');
    window.setTimeout(finish, EXIT_FADE_MS);
  }, [finish]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('hold'), HOLD_MS);
    const t2 = window.setTimeout(() => setPhase('exit'), EXIT_MS);
    const t3 = window.setTimeout(finish, DONE_MS);

    const onKey = (event) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener('keydown', onKey);
    };
  }, [dismiss, finish]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`archive-celebration archive-celebration--${phase}`}
      role="status"
      aria-live="polite"
      onClick={dismiss}
    >
      <div className="archive-celebration__veil" />
      <div className="archive-celebration__burst" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="archive-celebration__particle"
            style={{
              '--dx': `${p.x}px`,
              '--dy': `${p.y}px`,
              '--delay': `${p.delay}s`,
              '--hue': p.hue,
              '--size': `${p.size}px`,
            }}
          />
        ))}
      </div>
      <div className="archive-celebration__card">
        <div className="archive-celebration__ring" aria-hidden="true" />
        <p className="archive-celebration__eyebrow">Ολοκληρώθηκε</p>
        <h3 className="archive-celebration__title">{title || 'Εκτελεσμένο'}</h3>
        {subtitle && <p className="archive-celebration__subtitle">{subtitle}</p>}
        <p className="archive-celebration__date">{dateLabel}</p>
      </div>
    </div>,
    document.body
  );
}
