import { useEffect, useRef, useState } from 'react';
import { createNorthStar, MAX_NORTH_STARS, normalizeNorthStars } from '../utils/lifelineNorthStars';

function StarChip({ star, editing, onStartEdit, onCommit, onCancel, onRemove }) {
  const [draft, setDraft] = useState(star.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(star.title);
      return undefined;
    }
    setDraft(star.title);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [editing, star.title]);

  if (editing) {
    return (
      <form
        className="lifeline-north-stars__edit"
        onSubmit={(event) => {
          event.preventDefault();
          onCommit(draft);
        }}
      >
        <input
          ref={inputRef}
          className="lifeline-north-stars__input"
          value={draft}
          maxLength={48}
          placeholder="π.χ. Υγεία"
          aria-label="Τίτλος στόχου"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onCommit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <button
          type="button"
          className="lifeline-north-stars__remove"
          aria-label="Διαγραφή στόχου"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
        >
          ×
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      className="lifeline-north-stars__chip"
      onClick={onStartEdit}
    >
      {star.title || 'Χωρίς τίτλο'}
    </button>
  );
}

export function LifelineNorthStars({ stars = [], onChange, variant = 'overlay' }) {
  const items = normalizeNorthStars(stars);
  const [editingId, setEditingId] = useState(null);
  const canAdd = items.length < MAX_NORTH_STARS && !editingId;

  const commitStar = (id, title) => {
    const nextTitle = String(title || '').trim();
    const next = nextTitle
      ? items.map((star) => (star.id === id ? { ...star, title: nextTitle } : star))
      : items.filter((star) => star.id !== id);
    onChange?.(next);
    setEditingId(null);
  };

  const addStar = () => {
    if (!canAdd) return;
    const star = createNorthStar();
    onChange?.([...items, star]);
    setEditingId(star.id);
  };

  return (
    <section
      className={`lifeline-north-stars lifeline-north-stars--${variant}`}
      aria-label="Κύριοι στόχοι"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="lifeline-north-stars__label">Στόχοι</p>
      <div className="lifeline-north-stars__row">
        {items.length === 0 && !editingId ? (
          <button
            type="button"
            className="lifeline-north-stars__empty"
            onClick={addStar}
          >
            Πρόσθεσε 1–3 κύριους στόχους
          </button>
        ) : (
          items.map((star) => (
            <StarChip
              key={star.id}
              star={star}
              editing={editingId === star.id}
              onStartEdit={() => setEditingId(star.id)}
              onCommit={(title) => commitStar(star.id, title)}
              onCancel={() => {
                if (!star.title.trim()) {
                  onChange?.(items.filter((item) => item.id !== star.id));
                }
                setEditingId(null);
              }}
              onRemove={() => {
                onChange?.(items.filter((item) => item.id !== star.id));
                setEditingId(null);
              }}
            />
          ))
        )}
        {canAdd && items.length > 0 ? (
          <button
            type="button"
            className="lifeline-north-stars__add"
            onClick={addStar}
            aria-label="Προσθήκη στόχου"
          >
            +
          </button>
        ) : null}
      </div>
    </section>
  );
}
