import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { weekGoalsFor } from '../../lib/path/schema';

const SAVE_MS = 600;
const FIELDS = ['text', 'notes'];

function firstLine(notes) {
  return String(notes || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
}

/** Notes of one goal; the box grows with what is written, up to its CSS max height. */
function GoalNotes({ id, value, label, focusOnOpen, onChange, onBlur }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  useEffect(() => {
    if (focusOnOpen) ref.current?.focus();
  }, []);

  return (
    <div className="path-wgoals__notes" id={id}>
      <textarea
        ref={ref}
        value={value}
        rows={3}
        maxLength={4000}
        placeholder="Σημειώσεις: γιατί μετράει, τι θα πει «έγινε», επόμενο βήμα…"
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

/**
 * The week's three goals, above its blocks, each with notes that open underneath. Mount with
 * `key={weekStart}`: typed text is held here and saved after a pause, on blur and when the week changes.
 */
export function PathWeekGoals({ path, weekStart }) {
  const stored = weekGoalsFor(path.plan, weekStart);
  const storedKey = stored.map((goal) => `${goal.text}\u0000${goal.notes}`).join('\u0001');
  const [drafts, setDrafts] = useState(() => stored.map(({ text, notes }) => ({ text, notes })));
  const [open, setOpen] = useState(() => stored.map(() => false));
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const saveRef = useRef(null);

  saveRef.current = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = {};
    for (const [index, patch] of Object.entries(pending)) {
      path.setWeekGoal(weekStart, Number(index), patch);
    }
  };

  useEffect(() => () => saveRef.current(), []);

  // Goals changed elsewhere (another device) show up here, except in a field being typed in.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = prev.map((draft, index) => {
        const merged = { ...draft };
        for (const field of FIELDS) {
          if (pendingRef.current[index]?.[field] !== undefined) continue;
          if (merged[field] !== stored[index][field]) {
            merged[field] = stored[index][field];
            changed = true;
          }
        }
        return merged;
      });
      return changed ? next : prev;
    });
  }, [storedKey]);

  const setField = (index, field, value) => {
    setDrafts((prev) => prev.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft)));
    pendingRef.current = {
      ...pendingRef.current,
      [index]: { ...pendingRef.current[index], [field]: value },
    };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveRef.current(), SAVE_MS);
  };

  /** Leaving a field tidies the spaces around what was typed and saves at once. */
  const leaveField = (index, field) => {
    const value = drafts[index][field];
    const tidy = field === 'text' ? value.trim() : value.replace(/\s+$/, '');
    if (tidy !== value) setField(index, field, tidy);
    saveRef.current();
  };

  const doneCount = stored.filter((goal) => goal.done).length;
  const writtenCount = drafts.filter((draft) => draft.text.trim()).length;
  const allDone = writtenCount > 0 && doneCount >= writtenCount;

  return (
    <section className="path-wgoals" aria-label="Στόχοι εβδομάδας">
      <header className="path-wgoals__head">
        <h3>Στόχοι εβδομάδας</h3>
        {writtenCount ? (
          <span className={`path-wgoals__count${allDone ? ' path-wgoals__count--all' : ''}`}>
            {doneCount}/{writtenCount}
          </span>
        ) : null}
      </header>
      <ol className="path-wgoals__list">
        {drafts.map((draft, index) => {
          const written = Boolean(draft.text.trim());
          const done = written && stored[index].done;
          const isOpen = open[index];
          const peek = isOpen ? '' : firstLine(draft.notes);
          const name = draft.text.trim() || `στόχος ${index + 1}`;
          const notesId = `path-wgoal-notes-${weekStart}-${index}`;
          const toggle = () => setOpen((prev) => prev.map((value, i) => (i === index ? !value : value)));
          return (
            <li
              key={index}
              className={[
                'path-wgoals__item',
                written ? '' : 'path-wgoals__item--empty',
                done ? 'path-wgoals__item--done' : '',
                isOpen ? 'path-wgoals__item--open' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="path-wgoals__row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`Ολοκλήρωση · ${name}`}
                  className="path-wgoals__box"
                  disabled={!written}
                  onClick={() => {
                    saveRef.current();
                    path.setWeekGoal(weekStart, index, { done: !done });
                  }}
                >
                  {written ? (
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </button>
                <input
                  className="path-wgoals__text"
                  value={draft.text}
                  maxLength={240}
                  placeholder={`Στόχος ${index + 1}`}
                  aria-label={`Στόχος εβδομάδας ${index + 1}`}
                  onChange={(event) => setField(index, 'text', event.target.value)}
                  onBlur={() => leaveField(index, 'text')}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === 'Enter') {
                      // Enter moves on to the next goal; on the last one it leaves the field.
                      event.preventDefault();
                      const next = event.currentTarget.closest('ol')?.querySelectorAll('.path-wgoals__text')[index + 1];
                      if (next) next.focus();
                      else event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  className="path-wgoals__toggle"
                  aria-expanded={isOpen}
                  aria-controls={notesId}
                  aria-label={`Σημειώσεις · ${name}`}
                  title="Σημειώσεις"
                  onClick={toggle}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                </button>
              </div>
              {peek ? (
                <button type="button" className="path-wgoals__peek" title="Άνοιγμα σημειώσεων" onClick={toggle}>
                  {peek}
                </button>
              ) : null}
              {isOpen ? (
                <GoalNotes
                  id={notesId}
                  value={draft.notes}
                  label={`Σημειώσεις · ${name}`}
                  focusOnOpen={!draft.notes.trim()}
                  onChange={(value) => setField(index, 'notes', value)}
                  onBlur={() => leaveField(index, 'notes')}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
