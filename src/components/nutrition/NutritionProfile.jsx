import {
  ALLERGENS,
  COOKING_EQUIPMENT,
  DIETARY_PREFERENCES,
  MEAL_SLOTS,
  NUTRITION_DISCLAIMER,
  NUTRITION_GOALS,
  createEmptyProfile,
  goalMeta,
  profileTargets,
} from '../../lib/nutrition/schema';
import { ChipToggle } from './NutritionBits';

export function NutritionProfile({ nutrition }) {
  const profile = nutrition.profile || createEmptyProfile();
  const suggested = goalMeta(profile.goal);
  const targets = profileTargets(profile);

  const set = (patch) => nutrition.saveProfile(patch);

  return (
    <div className="nutrition-profile">
      <article className="nutrition-card">
        <div className="nutrition-card__head">
          <h2 className="nutrition-card__title">Dietary profile</h2>
        </div>
        <p className="nutrition-disclaimer">{NUTRITION_DISCLAIMER}</p>
        <div className="nutrition-form" style={{ marginTop: 14 }}>
          <label className="nutrition-field">
            <span>Goal</span>
            <select className="input" value={profile.goal} onChange={(event) => set({ goal: event.target.value })}>
              {NUTRITION_GOALS.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.label}</option>
              ))}
            </select>
          </label>
          <label className="nutrition-field">
            <span>Daily calorie target</span>
            <input
              className="input"
              type="number"
              min="800"
              max="5000"
              value={profile.dailyCalorieTarget ?? ''}
              placeholder={`Suggestion ${suggested.suggestedCalories}`}
              onChange={(event) => set({ dailyCalorieTarget: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Daily protein target (g)</span>
            <input
              className="input"
              type="number"
              min="40"
              max="300"
              value={profile.dailyProteinTarget ?? ''}
              placeholder={`Suggestion ${suggested.suggestedProtein}`}
              onChange={(event) => set({ dailyProteinTarget: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Meals per day</span>
            <input
              className="input"
              type="number"
              min="2"
              max="6"
              value={profile.mealsPerDay}
              onChange={(event) => set({ mealsPerDay: Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Max cooking time (min)</span>
            <input
              className="input"
              type="number"
              min="5"
              max="180"
              value={profile.maxCookingTimeMin}
              onChange={(event) => set({ maxCookingTimeMin: Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Weekly budget (€)</span>
            <input
              className="input"
              type="number"
              min="0"
              value={profile.weeklyBudget ?? ''}
              onChange={(event) => set({ weeklyBudget: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Number of people</span>
            <input
              className="input"
              type="number"
              min="1"
              max="8"
              value={profile.peopleCount}
              onChange={(event) => set({ peopleCount: Number(event.target.value) })}
            />
          </label>
          <label className="nutrition-field">
            <span>Max meal repetitions / week</span>
            <input
              className="input"
              type="number"
              min="1"
              max="7"
              value={profile.maxMealRepetitions}
              onChange={(event) => set({ maxMealRepetitions: Number(event.target.value) })}
            />
          </label>
          {MEAL_SLOTS.map((slot) => {
            const time = profile.preferredMealTimes.find((item) => item.slot === slot.id)?.time || '';
            return (
              <label key={slot.id} className="nutrition-field">
                <span>{slot.label} time</span>
                <input
                  className="input"
                  type="time"
                  value={time}
                  onChange={(event) => set({
                    preferredMealTimes: profile.preferredMealTimes.map((item) => (
                      item.slot === slot.id ? { ...item, time: event.target.value } : item
                    )),
                  })}
                />
              </label>
            );
          })}
          <div className="nutrition-field nutrition-field--wide">
            <span>Dietary preferences</span>
            <ChipToggle
              options={DIETARY_PREFERENCES}
              value={profile.dietaryPreferences}
              onChange={(dietaryPreferences) => set({ dietaryPreferences })}
            />
          </div>
          <div className="nutrition-field nutrition-field--wide">
            <span>Allergies</span>
            <ChipToggle options={ALLERGENS} value={profile.allergies} onChange={(allergies) => set({ allergies })} />
          </div>
          <div className="nutrition-field nutrition-field--wide">
            <span>Cooking equipment</span>
            <ChipToggle
              options={COOKING_EQUIPMENT}
              value={profile.cookingEquipment}
              onChange={(cookingEquipment) => set({ cookingEquipment })}
            />
          </div>
          <label className="nutrition-field nutrition-field--wide">
            <span>Preferred foods</span>
            <input
              className="input"
              value={profile.preferredFoods.join(', ')}
              placeholder="chicken, yogurt, rice"
              onChange={(event) => set({ preferredFoods: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
            />
          </label>
          <label className="nutrition-field nutrition-field--wide">
            <span>Excluded foods</span>
            <input
              className="input"
              value={profile.excludedFoods.join(', ')}
              placeholder="liver, mushrooms"
              onChange={(event) => set({ excludedFoods: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
            />
          </label>
          <label className="nutrition-field nutrition-field--wide">
            <span>Permanent instructions</span>
            <textarea
              className="input textarea"
              rows={4}
              value={profile.permanentInstructions}
              placeholder="Keep lunches packable. Prefer leftovers for dinner."
              onChange={(event) => set({ permanentInstructions: event.target.value })}
            />
          </label>
        </div>
      </article>
      <p className="nutrition-note">
        Active targets used for plans: {targets.calories} kcal
        {targets.caloriesAreSuggestion ? ' (suggestion)' : ''} · {targets.protein} g protein
        {targets.proteinAreSuggestion ? ' (suggestion)' : ''}.
        Leave the target fields empty to keep using the editable suggestion for {suggested.label.toLowerCase()}.
      </p>
    </div>
  );
}
