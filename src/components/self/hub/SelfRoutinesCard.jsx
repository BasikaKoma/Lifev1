import { groupRoutinesByStack } from '../../../utils/lifelineRoutines';

function RoutineCheckRow({ routine, onToggle }) {
  return (
    <li className={`self-routines__item${routine.done ? ' self-routines__item--done' : ''}`}>
      <button
        type="button"
        className={`self-routines__check${routine.done ? ' self-routines__check--done' : ''}`}
        onClick={() => onToggle(routine)}
        aria-pressed={routine.done}
        aria-label={`${routine.done ? 'Αναίρεση' : 'Ολοκλήρωση'} · ${routine.label}`}
      >
        {routine.done ? '✓' : ''}
      </button>
      <span className="self-routines__label">{routine.label}</span>
      {routine.done && routine.time ? (
        <span className="self-routines__time">{routine.time}</span>
      ) : null}
    </li>
  );
}

export function SelfRoutinesCard({
  dayRoutines = [],
  onToggle,
  onOpenDayDetails,
  weekLabel = '',
}) {
  const total = dayRoutines.length;
  const done = dayRoutines.filter((routine) => routine.done).length;
  const scoreLabel = total > 0 ? `${done}/${total}` : '';
  const stacks = groupRoutinesByStack(dayRoutines);

  return (
    <section className="self-hub-card self-hub-card--routines" aria-label="Ρουτίνες ημέρας">
      <header className="self-routines__header">
        <div>
          <p className="self-hub-card__eyebrow">ΡΟΥΤΙΝΕΣ</p>
          <p className="self-routines__score">
            {scoreLabel ? (
              <>
                <strong>{scoreLabel}</strong>
                {weekLabel ? <span> · {weekLabel} ημέρες</span> : null}
              </>
            ) : (
              'Σταθερές πράξεις της ημέρας'
            )}
          </p>
        </div>
        {onOpenDayDetails ? (
          <button type="button" className="self-routines__edit" onClick={onOpenDayDetails}>
            {total > 0 ? 'Επεξεργασία' : 'Προσθήκη'}
          </button>
        ) : null}
      </header>

      {total === 0 ? (
        <p className="self-hub-card__empty">
          Όρισε 2–3 πρωινές και 2–3 βραδινές πράξεις. Μετά τις κλείνεις εδώ με ένα tap.
        </p>
      ) : (
        <div className="self-routines__stacks">
          {stacks.map((stack) => (
            <div key={stack.id} className="self-routines__stack">
              <p className="self-routines__stack-label">{stack.label}</p>
              <ul className="self-routines__list">
                {stack.items.map((routine) => (
                  <RoutineCheckRow key={routine.id} routine={routine} onToggle={onToggle} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
