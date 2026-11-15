import { useState } from 'react';
import { formatDuration } from '../../lib/path/logic';

const OPEN_KEY = 'lifev1-path-hours-open';

function time(minutes) {
  return minutes > 0 ? formatDuration(Math.round(minutes)) : '0';
}

function readOpen(fallback) {
  try {
    const stored = window.localStorage.getItem(OPEN_KEY);
    return stored == null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

function Chevron() {
  return (
    <svg className="path-hours__chev" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** "2h / 4h": done out of planned. The template week has nothing done, so it shows its hours alone. */
function Amount({ item, planOnly }) {
  if (planOnly) return <span className="path-hours__nums">{time(item.planned)}</span>;
  return (
    <span className="path-hours__nums">
      <b>{time(item.logged)}</b>
      <span aria-hidden="true"> / </span>
      <span className="path-hours__planned">{time(item.planned)}</span>
    </span>
  );
}

function CategoryCard({ row, planOnly }) {
  const [open, setOpen] = useState(false);
  const done = row.planned ? Math.min(100, (row.logged / row.planned) * 100) : (row.logged ? 100 : 0);
  return (
    <li
      className={`path-hours__item${open ? ' path-hours__item--open' : ''}`}
      style={row.color ? { '--path-hours-color': row.color } : undefined}
    >
      <button
        type="button"
        className="path-hours__row"
        aria-expanded={open}
        aria-label={`${row.name}: ${planOnly ? time(row.planned) : `έγιναν ${time(row.logged)} από ${time(row.planned)}`}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="path-hours__dot" aria-hidden="true" />
        <span className="path-hours__name">{row.name}</span>
        <Amount item={row} planOnly={planOnly} />
        <Chevron />
        {planOnly ? null : (
          <span className="path-hours__bar" aria-hidden="true"><i style={{ width: `${done}%` }} /></span>
        )}
      </button>
      {open ? (
        <ul className="path-hours__parts">
          {row.parts.map((part) => (
            <li key={part.key}>
              <span className="path-hours__part-name" title={part.name}>{part.name}</span>
              <Amount item={part} planOnly={planOnly} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Where the hours go, above the week it describes: one card per category, each opening to
 * what it is made of. `planOnly` (the template week) leaves out what was done.
 */
export function PathHoursPanel({ data, planOnly = false, defaultOpen = true }) {
  const [open, setOpen] = useState(() => readOpen(defaultOpen));
  if (!data.rows.length) return null;

  const toggle = () => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(OPEN_KEY, value ? '0' : '1');
      } catch {
        // The panel still opens and closes; it just is not remembered.
      }
      return !value;
    });
  };

  return (
    <section className={`path-hours${open ? '' : ' path-hours--closed'}`} aria-label="Κατανομή ωρών">
      <button type="button" className="path-hours__head" aria-expanded={open} onClick={toggle}>
        <h3>Κατανομή ωρών</h3>
        <span className="path-hours__total">
          {planOnly
            ? `${time(data.planned)} την εβδομάδα`
            : `έγιναν ${time(data.logged)} από ${time(data.planned)}`}
        </span>
        <Chevron />
      </button>
      {open ? (
        <ul className="path-hours__list">
          {data.rows.map((row) => <CategoryCard key={row.key} row={row} planOnly={planOnly} />)}
        </ul>
      ) : null}
    </section>
  );
}
