import { useMemo, useState } from 'react';
import {
  createRoutineTemplate,
  groupRoutinesByStack,
  normalizeRoutineTemplates,
  ROUTINE_STACK_ORDER,
  ROUTINE_STACKS,
} from '../../utils/lifelineRoutines';

export function PathRoutines({
  routineTemplates = [],
  onUpdateRoutineTemplates,
}) {
  const templates = useMemo(
    () => normalizeRoutineTemplates(routineTemplates),
    [routineTemplates]
  );
  const stacks = useMemo(
    () => groupRoutinesByStack(templates, { includeEmpty: true }),
    [templates]
  );
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [stack, setStack] = useState('morning');

  const persist = (next) => {
    onUpdateRoutineTemplates?.(normalizeRoutineTemplates(next));
  };

  const handleAdd = (event) => {
    event.preventDefault();
    const text = label.trim();
    if (!text) return;
    persist([
      ...templates,
      createRoutineTemplate(text, { defaultTime: time, stack }),
    ]);
    setLabel('');
    setTime('');
  };

  const handlePatch = (routine, patch) => {
    persist(templates.map((item) => {
      if (item.id !== routine.id) return item;
      const nextLabel = patch.label !== undefined ? patch.label : item.label;
      if (!String(nextLabel).trim()) return item;
      return createRoutineTemplate(nextLabel, {
        id: item.id,
        defaultTime: patch.defaultTime ?? item.defaultTime,
        stack: patch.stack ?? item.stack,
      });
    }));
  };

  const handleRemove = (routineId) => {
    persist(templates.filter((item) => item.id !== routineId));
  };

  return (
    <div className="path-routines">
      <div className="path-toolbar">
        <p className="path-empty">
          Όρισε εδώ τις σταθερές πράξεις (πρωί / μέρα / βράδυ). Στο Self και στο Day Lab εμφανίζονται μόνο για check.
        </p>
      </div>

      <form className="path-routines__form" onSubmit={handleAdd}>
        <select
          className="input"
          value={stack}
          onChange={(event) => setStack(event.target.value)}
          aria-label="Στοίβα ρουτίνας"
        >
          {ROUTINE_STACK_ORDER.map((id) => (
            <option key={id} value={id}>{ROUTINE_STACKS[id].label}</option>
          ))}
        </select>
        <input
          type="text"
          className="input"
          placeholder="π.χ. Ξύπνημα, Φως, Χωρίς οθόνη…"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <input
          type="time"
          className="input"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Προεπιλεγμένη ώρα (προαιρετικά)"
        />
        <button type="submit" className="btn btn--primary">+ Ρουτίνα</button>
      </form>

      <div className="path-routines__grid">
        {stacks.map((group) => (
          <section key={group.id} className="path-panel path-routines__stack">
            <h3 className="path-routines__stack-title">
              {group.label}
              <span>{group.items.length}</span>
            </h3>
            {group.items.length === 0 ? (
              <p className="path-empty">Καμία ρουτίνα ακόμα σε αυτό το μπλοκ.</p>
            ) : (
              <ul className="path-routines__list">
                {group.items.map((routine) => (
                  <li key={routine.id} className="path-routines__item">
                    <input
                      type="text"
                      className="input"
                      value={routine.label}
                      onChange={(event) => handlePatch(routine, { label: event.target.value })}
                      aria-label={`Όνομα ρουτίνας ${routine.label}`}
                    />
                    <input
                      type="time"
                      className="input"
                      value={routine.defaultTime || ''}
                      onChange={(event) => handlePatch(routine, { defaultTime: event.target.value })}
                      aria-label={`Ώρα για ${routine.label}`}
                    />
                    <button
                      type="button"
                      className="path-routines__remove"
                      onClick={() => handleRemove(routine.id)}
                      aria-label={`Αφαίρεση ${routine.label}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
