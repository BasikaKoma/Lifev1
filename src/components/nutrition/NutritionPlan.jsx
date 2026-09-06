import { useState } from 'react';
import {
  MEAL_SLOTS,
  NUTRITION_DISCLAIMER,
  addDaysIso,
  createEmptyPlanDraft,
  formatDayLabel,
  plannedMealView,
  profileTargets,
  todayIsoDate,
} from '../../lib/nutrition/schema';
import { MacroPills, MealBody, NutritionModal, PlannedMealCard } from './NutritionBits';

function datesInPlan(draft) {
  return Array.from({ length: Number(draft.days) || 7 }, (_, index) => addDaysIso(draft.startDate, index));
}

export function NutritionPlan({ nutrition, onOpenGroceries }) {
  const plan = nutrition.plan;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState(() => createEmptyPlanDraft(nutrition.profile));
  const [mobileDate, setMobileDate] = useState(plan?.startDate || todayIsoDate());
  const [recipeMeal, setRecipeMeal] = useState(null);
  const [replaceFor, setReplaceFor] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [portionFor, setPortionFor] = useState(null);
  const [availableText, setAvailableText] = useState('');

  const targets = profileTargets(nutrition.profile);
  const days = plan?.dayRows || [];
  const visibleDays = days.length ? days : [];

  const summary = plan?.weeklyTotals;

  const openWizard = () => {
    setDraft({
      ...createEmptyPlanDraft(nutrition.profile),
      startDate: plan?.startDate || todayIsoDate(),
      days: plan?.days || 7,
    });
    setAvailableText('');
    setWizardOpen(true);
  };

  const toggleTraining = (date) => {
    setDraft((prev) => ({
      ...prev,
      trainingDays: prev.trainingDays.includes(date)
        ? prev.trainingDays.filter((item) => item !== date)
        : [...prev.trainingDays, date],
    }));
  };

  const toggleOutside = (date, slot) => {
    setDraft((prev) => {
      const current = prev.mealsEatenOutside.find((item) => item.date === date);
      const slots = new Set(current?.slots || []);
      if (slots.has(slot)) slots.delete(slot);
      else slots.add(slot);
      const rest = prev.mealsEatenOutside.filter((item) => item.date !== date);
      return {
        ...prev,
        mealsEatenOutside: slots.size
          ? [...rest, { date, slots: [...slots] }]
          : rest,
      };
    });
  };

  const handleGenerate = async () => {
    const availableIngredients = availableText
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => ({ name, quantity: 0, unit: 'g', category: 'Pantry', estimatedCost: 0 }));
    const created = await nutrition.generatePlan({ ...draft, availableIngredients });
    if (created) {
      setWizardOpen(false);
      setMobileDate(created.startDate);
    }
  };

  const handleReplace = async (dayDate, meal) => {
    setReplaceFor({ dayDate, meal });
    const list = await nutrition.suggestReplacements(meal);
    setAlternatives(list);
  };

  const budgetNote = nutrition.profile.weeklyBudget != null && summary
    ? `Estimated food cost €${summary.estimatedCost.toFixed(1)} vs weekly budget €${nutrition.profile.weeklyBudget}.`
    : null;

  return (
    <div className="nutrition-plan-wrap">
      {!plan ? (
        <article className="nutrition-card">
          <h2 className="nutrition-card__title">No active plan</h2>
          <p className="nutrition-empty">Create a 7 or 14 day meal plan from your nutrition profile. Targets stay editable and are not medical advice.</p>
          <div className="nutrition-view__actions" style={{ marginTop: 16 }}>
            <button type="button" className="nutrition-btn nutrition-btn--green" onClick={openWizard}>New plan</button>
          </div>
        </article>
      ) : (
        <div className="nutrition-plan">
          <div>
            <nav className="nutrition-dates" aria-label="Plan days">
              {visibleDays.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  aria-current={mobileDate === day.date ? 'date' : undefined}
                  onClick={() => setMobileDate(day.date)}
                >
                  {formatDayLabel(day.date, { weekday: 'short', day: 'numeric' })}
                </button>
              ))}
            </nav>
            <div className={`nutrition-plan__grid${plan.days === 14 ? ' nutrition-plan__grid--14' : ''}`}>
              {visibleDays.map((day) => (
                <article
                  key={day.id}
                  className={`nutrition-card nutrition-day${mobileDate !== day.date ? ' nutrition-day--hidden-mobile' : ''}`}
                >
                  <div className="nutrition-day__head">
                    <div>
                      <h3 className="nutrition-day__date">{formatDayLabel(day.date)}</h3>
                      <p className="nutrition-day__meta">
                        {Math.round(day.totals.calories)} kcal · {Math.round(day.totals.protein)} g P · {day.totals.prepTimeMin} min
                        {day.notes ? ` · ${day.notes}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="nutrition-btn nutrition-btn--ghost"
                      disabled={nutrition.busy === `day:${day.date}`}
                      onClick={() => nutrition.regenerateDay(day.date)}
                    >
                      {nutrition.busy === `day:${day.date}` ? '…' : 'Regenerate day'}
                    </button>
                  </div>
                  {(day.meals || []).map((planned) => {
                    const meal = plannedMealView(planned);
                    return (
                      <PlannedMealCard
                        key={planned.id}
                        meal={meal}
                        onReplace={() => handleReplace(day.date, meal)}
                        onLock={() => nutrition.patchPlannedMeal(day.date, planned.id, { locked: !planned.locked })}
                        onConsumed={() => nutrition.patchPlannedMeal(day.date, planned.id, { consumed: !planned.consumed })}
                        onPortions={() => setPortionFor({ dayDate: day.date, meal })}
                        onRecipe={() => setRecipeMeal(meal)}
                      />
                    );
                  })}
                </article>
              ))}
            </div>
            <div className="nutrition-sticky-groceries">
              <button type="button" className="nutrition-btn nutrition-btn--green" onClick={onOpenGroceries}>
                Groceries
              </button>
            </div>
          </div>
          <aside className="nutrition-summary">
            <article className="nutrition-card">
              <div className="nutrition-card__head">
                <h2 className="nutrition-card__title">Summary</h2>
              </div>
              <div className="nutrition-stat"><span>Avg calories</span><strong>{summary?.avgCalories || 0}</strong></div>
              <div className="nutrition-stat"><span>Avg protein</span><strong>{summary?.avgProtein || 0} g</strong></div>
              <div className="nutrition-stat"><span>Est. cost</span><strong>€{(summary?.estimatedCost || 0).toFixed(1)}</strong></div>
              <div className="nutrition-stat"><span>Avg prep</span><strong>{summary?.avgPrepTimeMin || 0} min</strong></div>
              <div className="nutrition-stat">
                <span>Your target</span>
                <strong>{targets.calories} / {targets.protein}g{targets.caloriesAreSuggestion || targets.proteinAreSuggestion ? '*' : ''}</strong>
              </div>
              <p className="nutrition-disclaimer" style={{ marginTop: 12 }}>{NUTRITION_DISCLAIMER}</p>
              {budgetNote ? <p className="nutrition-note">{budgetNote}</p> : null}
              <div className="nutrition-view__actions" style={{ marginTop: 14 }}>
                <button type="button" className="nutrition-btn nutrition-btn--outline" onClick={openWizard}>New plan</button>
                <button type="button" className="nutrition-btn nutrition-btn--ghost" onClick={onOpenGroceries}>Groceries</button>
              </div>
            </article>
          </aside>
        </div>
      )}

      {wizardOpen ? (
        <NutritionModal title="Create meal plan" onClose={() => setWizardOpen(false)}>
          <div className="nutrition-form">
            <label className="nutrition-field">
              <span>Start date</span>
              <input className="input" type="date" value={draft.startDate} onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))} />
            </label>
            <label className="nutrition-field">
              <span>Number of days</span>
              <select className="input" value={draft.days} onChange={(event) => setDraft((prev) => ({ ...prev, days: Number(event.target.value) }))}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
            </label>
            <div className="nutrition-field nutrition-field--wide">
              <span>Training days</span>
              <div className="nutrition-chips">
                {datesInPlan(draft).map((date) => (
                  <button
                    key={date}
                    type="button"
                    className={`nutrition-chip${draft.trainingDays.includes(date) ? ' nutrition-chip--on' : ''}`}
                    onClick={() => toggleTraining(date)}
                  >
                    {formatDayLabel(date, { weekday: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            </div>
            <div className="nutrition-field nutrition-field--wide">
              <span>Meals eaten outside</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {datesInPlan(draft).map((date) => {
                  const selected = new Set(draft.mealsEatenOutside.find((item) => item.date === date)?.slots || []);
                  return (
                    <div key={date} className="nutrition-chips">
                      <span className="nutrition-day__meta" style={{ minWidth: 72 }}>{formatDayLabel(date, { weekday: 'short' })}</span>
                      {MEAL_SLOTS.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          className={`nutrition-chip${selected.has(slot.id) ? ' nutrition-chip--on' : ''}`}
                          onClick={() => toggleOutside(date, slot.id)}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="nutrition-field nutrition-field--wide">
              <span>Ingredients already available</span>
              <textarea
                className="input textarea"
                rows={2}
                value={availableText}
                placeholder="rice, olive oil, eggs"
                onChange={(event) => setAvailableText(event.target.value)}
              />
            </label>
            <label className="nutrition-field nutrition-field--wide">
              <span>Temporary instructions for this plan</span>
              <textarea
                className="input textarea"
                rows={3}
                value={draft.temporaryInstructions}
                onChange={(event) => setDraft((prev) => ({ ...prev, temporaryInstructions: event.target.value }))}
              />
            </label>
          </div>
          <p className="nutrition-note" style={{ marginTop: 12 }}>
            Using {targets.calories} kcal and {targets.protein} g protein
            {targets.caloriesAreSuggestion || targets.proteinAreSuggestion ? ' as editable suggestions' : ''}.
          </p>
          <div className="nutrition-view__actions" style={{ marginTop: 16 }}>
            <button type="button" className="nutrition-btn nutrition-btn--green" disabled={Boolean(nutrition.busy)} onClick={handleGenerate}>
              {nutrition.busy === 'plan' ? 'Generating…' : 'Generate plan'}
            </button>
          </div>
        </NutritionModal>
      ) : null}

      {recipeMeal ? (
        <NutritionModal title={recipeMeal.name} onClose={() => setRecipeMeal(null)}>
          <MealBody meal={recipeMeal} />
        </NutritionModal>
      ) : null}

      {replaceFor ? (
        <NutritionModal title="Replace meal" onClose={() => setReplaceFor(null)}>
          <p className="nutrition-note">Alternatives near {Math.round(replaceFor.meal.calories)} kcal and {Math.round(replaceFor.meal.protein)} g protein.</p>
          {alternatives.length ? alternatives.map((meal) => (
            <button
              key={meal.id}
              type="button"
              className="nutrition-alt"
              onClick={() => {
                nutrition.replaceMeal(replaceFor.dayDate, replaceFor.meal.id, meal, replaceFor.meal.portionMultiplier);
                setReplaceFor(null);
              }}
            >
              <strong>{meal.name}</strong>
              <MacroPills calories={meal.calories} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} prepTimeMin={meal.prepTimeMin} />
            </button>
          )) : <p className="nutrition-empty">No close alternatives in your library. Add a custom meal or loosen filters.</p>}
        </NutritionModal>
      ) : null}

      {portionFor ? (
        <NutritionModal title="Edit portions" onClose={() => setPortionFor(null)}>
          <label className="nutrition-field">
            <span>Portion multiplier ({portionFor.meal.portionMultiplier}×)</span>
            <input
              className="input"
              type="range"
              min="0.5"
              max="2"
              step="0.25"
              value={portionFor.meal.portionMultiplier}
              onChange={(event) => {
                const value = Number(event.target.value);
                nutrition.setPortion(portionFor.dayDate, portionFor.meal.id, value);
                setPortionFor((prev) => ({ ...prev, meal: { ...prev.meal, portionMultiplier: value } }));
              }}
            />
          </label>
        </NutritionModal>
      ) : null}
    </div>
  );
}
