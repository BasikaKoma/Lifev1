import {
  mealCost,
  plannedMealView,
  profileTargets,
  slotsForMealsPerDay,
  weeklyTotalsFromDays,
} from './schema';

const CALORIE_TOLERANCE = 0.18;
const PROTEIN_MIN_RATIO = 0.82;

function textHaystack(meal) {
  const names = (meal.ingredients || []).map((item) => item.name);
  return `${meal.name} ${names.join(' ')} ${(meal.tags || []).join(' ')}`.toLowerCase();
}

export function mealViolatesRestrictions(meal, profile = {}) {
  const allergies = (profile.allergies || []).map((item) => item.toLowerCase());
  const excluded = (profile.excludedFoods || []).map((item) => item.toLowerCase());
  const hay = textHaystack(meal);
  const mealAllergens = (meal.allergens || []).map((item) => item.toLowerCase());
  for (const allergen of allergies) {
    if (mealAllergens.includes(allergen) || hay.includes(allergen)) {
      return `Contains allergen: ${allergen}`;
    }
  }
  for (const food of excluded) {
    if (food && hay.includes(food)) return `Contains excluded food: ${food}`;
  }
  if ((profile.dietaryPreferences || []).includes('vegan')) {
    if ((meal.diets || []).length && !(meal.diets || []).includes('vegan')) return 'Not vegan';
  }
  if ((profile.dietaryPreferences || []).includes('vegetarian')) {
    const diets = meal.diets || [];
    if (diets.length && !diets.includes('vegetarian') && !diets.includes('vegan')) return 'Not vegetarian';
  }
  if ((profile.maxCookingTimeMin || 0) > 0 && (meal.prepTimeMin || 0) > profile.maxCookingTimeMin) {
    return 'Exceeds max cooking time';
  }
  const equipment = profile.cookingEquipment || [];
  if (equipment.length && (meal.equipment || []).length) {
    const ok = (meal.equipment || []).every((item) => equipment.includes(item) || item === 'no_cook');
    if (!ok) return 'Needs unavailable equipment';
  }
  return null;
}

export function filterEligibleMeals(meals, profile) {
  return (meals || []).filter((meal) => !mealViolatesRestrictions(meal, profile));
}

export function countRepetitions(days, mealName) {
  const name = String(mealName || '').toLowerCase();
  let count = 0;
  for (const day of days || []) {
    for (const planned of day.meals || []) {
      const view = plannedMealView(planned);
      if (String(view.name || '').toLowerCase() === name) count += 1;
    }
  }
  return count;
}

export function validateGeneratedPlan(plan, { profile, draft } = {}) {
  const warnings = [];
  const errors = [];
  const days = plan?.dayRows || [];
  const expectedDays = Number(draft?.days || plan?.days || days.length);
  if (days.length !== expectedDays) {
    errors.push(`Plan must have ${expectedDays} days (got ${days.length}).`);
  }

  const targets = profileTargets(profile);
  const slots = slotsForMealsPerDay(profile?.mealsPerDay);
  const maxReps = profile?.maxMealRepetitions || 2;
  const counts = new Map();

  days.forEach((day, index) => {
    if (!day.date) errors.push(`Day ${index + 1} is missing a date.`);
    const meals = (day.meals || []).map(plannedMealView);
    meals.forEach((meal) => {
      const reason = meal.outside ? null : mealViolatesRestrictions(meal, profile);
      if (reason) errors.push(`${day.date} · ${meal.name}: ${reason}`);
      (meal.ingredients || []).forEach((ingredient) => {
        if (!ingredient.name) errors.push(`${meal.name} has an unnamed ingredient.`);
        if (ingredient.quantity < 0) errors.push(`${meal.name} has a negative quantity.`);
      });
      const key = String(meal.name || '').toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const present = new Set(meals.map((meal) => meal.slot));
    const outside = new Set((draft?.mealsEatenOutside || plan?.mealsEatenOutside || [])
      .filter((item) => item.date === day.date)
      .flatMap((item) => item.slots));
    for (const slot of slots) {
      if (!present.has(slot) && !outside.has(slot)) {
        warnings.push(`${day.date} is missing ${slot}.`);
      }
    }

    const calories = day.totals?.calories || 0;
    const protein = day.totals?.protein || 0;
    if (!outside.size) {
      if (Math.abs(calories - targets.calories) / targets.calories > CALORIE_TOLERANCE) {
        warnings.push(`${day.date} calories ${calories} vs target ${targets.calories}.`);
      }
      if (protein < targets.protein * PROTEIN_MIN_RATIO) {
        warnings.push(`${day.date} protein ${protein}g vs target ${targets.protein}g.`);
      }
    }
  });

  for (const [name, count] of counts.entries()) {
    if (name && count > maxReps) {
      warnings.push(`"${name}" repeats ${count} times (max ${maxReps}).`);
    }
  }

  const weekly = weeklyTotalsFromDays(days);
  const uniqueNames = counts.size;
  if (days.length >= 7 && uniqueNames < Math.min(8, days.length)) {
    warnings.push('Variety is low — consider more distinct meals.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    weeklyTotals: weekly,
    plan: {
      ...plan,
      weeklyTotals: weekly,
    },
  };
}

export function similarMealScore(base, candidate) {
  if (!base || !candidate) return 0;
  const cal = 1 - Math.min(1, Math.abs((candidate.calories || 0) - (base.calories || 0)) / Math.max(180, base.calories || 1));
  const pro = 1 - Math.min(1, Math.abs((candidate.protein || 0) - (base.protein || 0)) / Math.max(12, base.protein || 1));
  const cost = 1 - Math.min(1, Math.abs(mealCost(candidate) - mealCost(base)) / 4);
  return cal * 0.45 + pro * 0.45 + cost * 0.1;
}
