import { useRef, useState } from 'react';
import {
  formatThoughtBlockLabel,
  formatThoughtCapacityLabel,
  formatThoughtClock,
} from '../utils/dayThoughts';

const SWIPE_TRIGGER = 72;

const PROMOTE_ACTIONS = [
  { id: 'task', label: 'Task' },
  { id: 'idea', label: 'Ιδέα' },
  { id: 'path-next', label: 'Path next' },
];

export function ThoughtItem({
  thought,
  onPromote,
  onKeep,
  onDismiss,
  evening = false,
  compact = false,
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const startX = useRef(0);
  const dragging = useRef(false);

  if (!thought?.id || !thought?.text) return null;

  const handlePromote = async (kind) => {
    if (!onPromote || busy) return;
    setBusy(kind);
    try {
      await onPromote(thought.id, kind);
      setOpen(false);
    } finally {
      setBusy('');
    }
  };

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    dragging.current = true;
    startX.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragging.current) return;
    setDx(Math.max(-120, Math.min(120, event.clientX - startX.current)));
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx > SWIPE_TRIGGER && onPromote) handlePromote('task');
    else if (dx < -SWIPE_TRIGGER) setOpen(true);
    setDx(0);
  };

  const clock = formatThoughtClock(thought.at);
  const blockLabel = formatThoughtBlockLabel(thought);
  const capacityLabel = formatThoughtCapacityLabel(thought);
  const promotedLabel = thought.promoted?.type === 'task'
    ? 'έγινε task'
    : thought.promoted?.type === 'idea'
      ? 'έγινε ιδέα'
      : thought.promoted?.type === 'path-next'
        ? 'πήγε στο Path'
        : '';

  return (
    <li
      className={`thought-item${compact ? ' thought-item--compact' : ''}${thought.kept === false ? ' thought-item--dismissed' : ''}`}
    >
      <div
        className="thought-item__swipe"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="thought-item__time">{clock}</span>
        <div className="thought-item__copy">
          <p className="thought-item__text">{thought.text}</p>
          <p className="thought-item__meta">
            {[blockLabel, capacityLabel, promotedLabel].filter(Boolean).join(' · ') || ' '}
          </p>
        </div>
      </div>

      {evening && thought.kept == null ? (
        <div className="thought-item__evening">
          <button type="button" className="btn btn--text btn--sm" onClick={() => onKeep?.(thought.id)}>
            Κράτα
          </button>
          <button type="button" className="btn btn--text btn--sm" onClick={() => onDismiss?.(thought.id)}>
            Άστο
          </button>
        </div>
      ) : null}

      <div className={`thought-item__actions${open ? ' is-open' : ''}`}>
        {PROMOTE_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="thought-item__promote"
            disabled={Boolean(busy) || Boolean(thought.promoted)}
            onClick={() => handlePromote(action.id)}
          >
            {busy === action.id ? '…' : action.label}
          </button>
        ))}
      </div>
    </li>
  );
}
