import { pathGoalsForDisplay } from '../lib/path/logic';
import { goalColorStyle } from '../lib/path/schema';

export function LifelineNorthStars({
  goals = [],
  pathBundle = null,
  onOpenPath,
  variant = 'overlay',
}) {
  const items = pathGoalsForDisplay(pathBundle || { goals });

  return (
    <section
      className={`lifeline-north-stars lifeline-north-stars--${variant}`}
      aria-label="Στόχοι Path"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="lifeline-north-stars__label">Στόχοι</p>
      <div className="lifeline-north-stars__row">
        {items.length === 0 ? (
          <button
            type="button"
            className="lifeline-north-stars__empty"
            onClick={() => onOpenPath?.('goals')}
          >
            {onOpenPath ? 'Πρόσθεσε στόχους στο Path' : 'Δεν υπάρχουν στόχοι στο Path'}
          </button>
        ) : (
          items.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={`lifeline-north-stars__chip${goal.color ? ' lifeline-north-stars__chip--goal' : ''}`}
              style={goalColorStyle(goal.color)}
              title={goal.role ? `${goal.title} · ${goal.role}` : goal.title}
              onClick={() => onOpenPath?.('goals')}
            >
              {goal.color ? <span className="lifeline-north-stars__dot" aria-hidden /> : null}
              {goal.title}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
