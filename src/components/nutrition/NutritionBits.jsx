import { MEAL_SLOTS, slotLabel } from '../../lib/nutrition/schema';

export function MacroPills({ calories, protein, carbs, fat, prepTimeMin }) {
  return (
    <div className="nutrition-macros">
      {calories != null ? <span className="nutrition-macro"><strong>{Math.round(calories)}</strong> kcal</span> : null}
      {protein != null ? <span className="nutrition-macro"><strong>{Math.round(protein)}</strong> g P</span> : null}
      {carbs != null ? <span className="nutrition-macro"><strong>{Math.round(carbs)}</strong> g C</span> : null}
      {fat != null ? <span className="nutrition-macro"><strong>{Math.round(fat)}</strong> g F</span> : null}
      {prepTimeMin != null ? <span className="nutrition-macro">{prepTimeMin} min</span> : null}
    </div>
  );
}

export function ChipToggle({ options, value = [], onChange }) {
  const selected = new Set(value);
  return (
    <div className="nutrition-chips">
      {options.map((option) => {
        const id = option.id || option;
        const label = option.label || option;
        const on = selected.has(id);
        return (
          <button
            key={id}
            type="button"
            className={`nutrition-chip${on ? ' nutrition-chip--on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((item) => item !== id) : [...value, id];
              onChange(next);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function NutritionModal({ title, onClose, children }) {
  return (
    <div className="nutrition-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="nutrition-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="nutrition-modal__panel">
        <div className="nutrition-card__head">
          <h2>{title}</h2>
          <button type="button" className="nutrition-btn nutrition-btn--ghost" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MealBody({ meal }) {
  return (
    <>
      <MacroPills
        calories={meal.calories}
        protein={meal.protein}
        carbs={meal.carbs}
        fat={meal.fat}
        prepTimeMin={meal.prepTimeMin}
      />
      {(meal.ingredients || []).length ? (
        <ul className="nutrition-ing-list">
          {(meal.ingredients || []).map((item) => (
            <li key={item.id || item.name}>{item.quantity} {item.unit} {item.name}</li>
          ))}
        </ul>
      ) : null}
      {meal.instructions ? <p className="nutrition-note">{meal.instructions}</p> : null}
    </>
  );
}

export function PlannedMealCard({ meal, onReplace, onLock, onConsumed, onPortions, onRecipe }) {
  const slot = slotLabel(meal.slot || meal.mealType);
  return (
    <article className={`nutrition-meal${meal.consumed ? ' nutrition-meal--consumed' : ''}${meal.locked ? ' nutrition-meal--locked' : ''}`}>
      <span className="nutrition-meal__slot">{slot}{meal.outside ? ' · out' : ''}{meal.locked ? ' · locked' : ''}</span>
      <h4 className="nutrition-meal__name">{meal.name}</h4>
      <MacroPills
        calories={meal.calories}
        protein={meal.protein}
        carbs={meal.carbs}
        fat={meal.fat}
        prepTimeMin={meal.prepTimeMin}
      />
      <div className="nutrition-meal__actions">
        <button type="button" onClick={onReplace} disabled={meal.locked || meal.outside}>Replace</button>
        <button type="button" aria-pressed={meal.locked} onClick={onLock}>Lock</button>
        <button type="button" aria-pressed={meal.consumed} onClick={onConsumed}>Consumed</button>
        <button type="button" onClick={onPortions} disabled={meal.outside}>Portions</button>
        <button type="button" onClick={onRecipe}>Recipe</button>
      </div>
    </article>
  );
}

export function slotOptions() {
  return MEAL_SLOTS;
}
