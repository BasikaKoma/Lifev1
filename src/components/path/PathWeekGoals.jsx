import { useEffect, useRef, useState } from 'react';
import { weekGoalsFor } from '../../lib/path/schema';

const SAVE_MS = 600;

/**
 * The week's three goals, above its blocks. Mount with `key={weekStart}`: typed text is
 * held here and saved after a pause, on blur and when the week changes.
 */
export function PathWeekGoals({ path, weekStart }) {
  const stored = weekGoalsFor(path.plan, weekStart);
  const storedTexts = stored.map((goal) => goal.text);
  const storedKey = storedTexts.join('\u0000');
  const [drafts, setDrafts] = useState(storedTexts);
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
    for (const [index, text] of Object.entries(pending)) {
      path.setWeekGoal(weekStart, Number(index), { text });
    }
  };

  useEffect(() => () => saveRef.current(), []);

  // Goals changed elsewhere (another device) show up here, except in a slot being typed in.
  useEffect(() => {
    setDrafts((prev) => {
      const next = prev.map((text, index) => (index in pendingRef.current ? text : storedTexts[index]));
      return next.every((text, index) => text === prev[index]) ? prev : next;
    });
  }, [storedKey]);

  const setText = (index, text) => {
    setDrafts((prev) => prev.map((item, i) => (i === index ? text : item)));
    pendingRef.current = { ...pendingRef.current, [index]: text };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveRef.current(), SAVE_MS);
  };

  const doneCount = stored.filter((goal) => goal.done).length;
  const writtenCount = drafts.filter((text) => text.trim()).length;

  return (
    <section className="path-wgoals" aria-label="Στόχοι εβδομάδας">
      <header className="path-wgoals__head">
        <h3>Στόχοι εβδομάδας</h3>
        {writtenCount ? <span>{doneCount}/{writtenCount}</span> : null}
      </header>
      <ol className="path-wgoals__list">
        {drafts.map((text, index) => {
          const written = Boolean(text.trim());
          const done = written && stored[index].done;
          return (
            <li key={index} className={`path-wgoals__item${done ? ' path-wgoals__item--done' : ''}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={`Ολοκλήρωση · ${text.trim() || `στόχος ${index + 1}`}`}
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
                value={text}
                maxLength={240}
                placeholder={`Στόχος ${index + 1}`}
                aria-label={`Στόχος εβδομάδας ${index + 1}`}
                onChange={(event) => setText(index, event.target.value)}
                onBlur={() => {
                  const trimmed = text.trim();
                  if (trimmed !== text) setText(index, trimmed);
                  saveRef.current();
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter') {
                    // Enter moves on to the next goal; on the last one it leaves the field.
                    event.preventDefault();
                    const next = event.currentTarget.closest('ol')?.querySelectorAll('input')[index + 1];
                    if (next) next.focus();
                    else event.currentTarget.blur();
                  }
                }}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
