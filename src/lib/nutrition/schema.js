export const NUTRITION_TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'meals', label: 'Meals' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'profile', label: 'Profile' },
];

export const NUTRITION_DISCLAIMER =
  'Calorie and macro numbers are your own targets or editable suggestions — not medical advice.';

export const NUTRITION_GOALS = [
  { id: 'fat_loss', label: 'Fat loss', suggestedCalories: 1800, suggestedProtein: 140 },
  { id: 'maintenance', label: 'Maintenance', suggestedCalories: 2200, suggestedProtein: 130 },
  { id: 'muscle_gain', label: 'Muscle gain', suggestedCalories: 2600, suggestedProtein: 160 },
];

export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

export const GROCERY_CATEGORIES = [
  'Produce',
  'Meat',
  'Fish',
  'Dairy',
  'Grains',
  'Pantry',
  'Frozen',
  'Other',
];

export const DIETARY_PREFERENCES = [
  { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'high_protein', label: 'High protein' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'low_carb', label: 'Low carb' },
  { id: 'gluten_free', label: 'Gluten free' },
  { id: 'dairy_free', label: 'Dairy free' },
];

export const ALLERGENS = [
  { id: 'gluten', label: 'Gluten' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'nuts', label: 'Nuts' },
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'fish', label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
];

export const COOKING_EQUIPMENT = [
  { id: 'stovetop', label: 'Stovetop' },
  { id: 'oven', label: 'Oven' },
  { id: 'microwave', label: 'Microwave' },
  { id: 'blender', label: 'Blender' },
  { id: 'airfryer', label: 'Air fryer' },
  { id: 'grill', label: 'Grill' },
  { id: 'no_cook', label: 'No-cook' },
];

export const MEAL_SOURCES = ['catalog', 'saved', 'custom'];
export const PLAN_STATUSES = ['draft', 'active', 'archived'];
export const PLAN_DAY_COUNTS = [7, 14];

export function createNutritionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDaysIso(iso, amount) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function formatDayLabel(iso, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, options);
}

export function goalMeta(goalId) {
  return NUTRITION_GOALS.find((item) => item.id === goalId) || NUTRITION_GOALS[1];
}

function asString(value) {
  if (value == null) return '';
  return String(value);
}

function asNullableString(value) {
  const text = asString(value).trim();
  return text ? text : null;
}

function asNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

function asNullableNumber(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function asStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function pick(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}

export function emptyMacros() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function addMacros(left = emptyMacros(), right = emptyMacros()) {
  return {
    calories: Math.round((left.calories || 0) + (right.calories || 0)),
    protein: roundOne((left.protein || 0) + (right.protein || 0)),
    carbs: roundOne((left.carbs || 0) + (right.carbs || 0)),
    fat: roundOne((left.fat || 0) + (right.fat || 0)),
  };
}

export function scaleMacros(macros = emptyMacros(), multiplier = 1) {
  const factor = Number.isFinite(multiplier) ? multiplier : 1;
  return {
    calories: Math.round((macros.calories || 0) * factor),
    protein: roundOne((macros.protein || 0) * factor),
    carbs: roundOne((macros.carbs || 0) * factor),
    fat: roundOne((macros.fat || 0) * factor),
  };
}

export function roundOne(value) {
  return Math.round(value * 10) / 10;
}

export function roundQty(value) {
  if (!Number.isFinite(value)) return 0;
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function normalizeIngredient(raw = {}) {
  const category = GROCERY_CATEGORIES.includes(raw.category) ? raw.category : 'Other';
  return {
    id: raw.id || createNutritionId(),
    name: asString(raw.name).trim(),
    quantity: roundQty(asNumber(raw.quantity, 0)),
    unit: asString(raw.unit || 'g').trim() || 'g',
    category,
    estimatedCost: roundQty(asNumber(raw.estimatedCost ?? raw.estimated_cost, 0)),
    costPerUnit: asNullableNumber(raw.costPerUnit ?? raw.cost_per_unit),
    packageSize: asNullableNumber(raw.packageSize ?? raw.package_size),
    packageUnit: asNullableString(raw.packageUnit ?? raw.package_unit),
  };
}

export function normalizeMeal(raw = {}) {
  const slot = MEAL_SLOTS.some((item) => item.id === raw.mealType || item.id === raw.meal_type)
    ? (raw.mealType || raw.meal_type)
    : 'lunch';
  const source = MEAL_SOURCES.includes(raw.source) ? raw.source : 'custom';
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(normalizeIngredient)
    : Array.isArray(raw.meal_ingredients)
      ? raw.meal_ingredients.map(normalizeIngredient)
      : [];
  return {
    id: raw.id || createNutritionId(),
    catalogKey: asNullableString(raw.catalogKey || raw.catalog_key),
    name: asString(raw.name).trim() || 'Untitled meal',
    mealType: slot,
    calories: Math.round(asNumber(raw.calories, 0)),
    protein: roundOne(asNumber(raw.protein, 0)),
    carbs: roundOne(asNumber(raw.carbs, 0)),
    fat: roundOne(asNumber(raw.fat, 0)),
    prepTimeMin: Math.max(0, Math.round(asNumber(raw.prepTimeMin ?? raw.prep_time_min, 0))),
    servings: Math.max(1, asNumber(raw.servings, 1)),
    instructions: asString(raw.instructions),
    tags: asStringList(raw.tags),
    allergens: asStringList(raw.allergens),
    diets: asStringList(raw.diets),
    equipment: asStringList(raw.equipment),
    favorite: Boolean(raw.favorite),
    source,
    ingredients,
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    updatedAt: raw.updatedAt || raw.updated_at || nowIso(),
  };
}

export function applyPortion(meal, multiplier = 1) {
  const factor = Math.max(0.25, Math.min(3, asNumber(multiplier, 1)));
  const macros = scaleMacros(meal, factor);
  return {
    ...normalizeMeal(meal),
    ...macros,
    servings: roundOne((meal.servings || 1) * factor),
    ingredients: (meal.ingredients || []).map((item) => ({
      ...normalizeIngredient(item),
      quantity: roundQty(item.quantity * factor),
      estimatedCost: roundQty((item.estimatedCost || 0) * factor),
    })),
    portionMultiplier: roundOne(factor),
  };
}

export function mealMacros(meal) {
  return {
    calories: meal?.calories || 0,
    protein: meal?.protein || 0,
    carbs: meal?.carbs || 0,
    fat: meal?.fat || 0,
  };
}

export function createEmptyProfile(overrides = {}) {
  const goal = pick(NUTRITION_GOALS.map((item) => item.id), overrides.goal, 'maintenance');
  const suggested = goalMeta(goal);
  return {
    goal,
    dailyCalorieTarget: asNullableNumber(overrides.dailyCalorieTarget ?? overrides.daily_calorie_target),
    dailyProteinTarget: asNullableNumber(overrides.dailyProteinTarget ?? overrides.daily_protein_target),
    mealsPerDay: Math.min(6, Math.max(2, Math.round(asNumber(overrides.mealsPerDay ?? overrides.meals_per_day, 4)))),
    preferredMealTimes: normalizeMealTimes(overrides.preferredMealTimes || overrides.preferred_meal_times),
    dietaryPreferences: asStringList(overrides.dietaryPreferences || overrides.dietary_preferences),
    allergies: asStringList(overrides.allergies),
    excludedFoods: asStringList(overrides.excludedFoods || overrides.excluded_foods),
    preferredFoods: asStringList(overrides.preferredFoods || overrides.preferred_foods),
    maxCookingTimeMin: Math.max(5, Math.round(asNumber(overrides.maxCookingTimeMin ?? overrides.max_cooking_time_min, 40))),
    weeklyBudget: asNullableNumber(overrides.weeklyBudget ?? overrides.weekly_budget),
    peopleCount: Math.max(1, Math.round(asNumber(overrides.peopleCount ?? overrides.people_count, 1))),
    cookingEquipment: asStringList(overrides.cookingEquipment || overrides.cooking_equipment).length
      ? asStringList(overrides.cookingEquipment || overrides.cooking_equipment)
      : ['stovetop', 'oven', 'no_cook'],
    maxMealRepetitions: Math.max(1, Math.round(asNumber(overrides.maxMealRepetitions ?? overrides.max_meal_repetitions, 2))),
    permanentInstructions: asString(overrides.permanentInstructions || overrides.permanent_instructions),
    suggestedCalories: suggested.suggestedCalories,
    suggestedProtein: suggested.suggestedProtein,
    updatedAt: overrides.updatedAt || overrides.updated_at || nowIso(),
  };
}

function normalizeMealTimes(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const bySlot = new Map(source.map((item) => [item.slot || item.id, item]));
  return MEAL_SLOTS.map((slot) => {
    const existing = bySlot.get(slot.id) || {};
    const fallback = slot.id === 'breakfast' ? '08:00'
      : slot.id === 'lunch' ? '13:30'
        : slot.id === 'dinner' ? '20:00'
          : '17:00';
    return {
      slot: slot.id,
      time: asString(existing.time || fallback).slice(0, 5) || fallback,
    };
  });
}

export function profileTargets(profile) {
  const next = createEmptyProfile(profile);
  const suggested = goalMeta(next.goal);
  return {
    calories: next.dailyCalorieTarget ?? suggested.suggestedCalories,
    protein: next.dailyProteinTarget ?? suggested.suggestedProtein,
    caloriesAreSuggestion: next.dailyCalorieTarget == null,
    proteinAreSuggestion: next.dailyProteinTarget == null,
  };
}

export function slotsForMealsPerDay(mealsPerDay = 4) {
  const count = Math.min(6, Math.max(2, mealsPerDay));
  if (count <= 3) return ['breakfast', 'lunch', 'dinner'];
  if (count === 4) return ['breakfast', 'lunch', 'dinner', 'snack'];
  return ['breakfast', 'snack', 'lunch', 'dinner', 'snack'];
}

export function normalizePlannedMeal(raw = {}) {
  const snapshot = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : raw;
  const meal = normalizeMeal({
    ...snapshot,
    id: snapshot.id || raw.mealId || raw.meal_id || raw.id,
    ingredients: snapshot.ingredients || raw.ingredients,
  });
  const portion = asNumber(raw.portionMultiplier ?? raw.portion_multiplier ?? snapshot.portionMultiplier, 1);
  const scaled = applyPortion(meal, portion);
  return {
    id: raw.id || createNutritionId(),
    mealId: raw.mealId || raw.meal_id || meal.id,
    slot: MEAL_SLOTS.some((item) => item.id === raw.slot) ? raw.slot : meal.mealType,
    locked: Boolean(raw.locked),
    consumed: Boolean(raw.consumed),
    outside: Boolean(raw.outside),
    portionMultiplier: scaled.portionMultiplier,
    snapshot: {
      ...scaled,
      portionMultiplier: scaled.portionMultiplier,
    },
  };
}

export function plannedMealView(planned) {
  const next = normalizePlannedMeal(planned);
  return {
    ...next,
    ...next.snapshot,
    id: next.id,
    slot: next.slot,
    locked: next.locked,
    consumed: next.consumed,
    outside: next.outside,
    portionMultiplier: next.portionMultiplier,
  };
}

export function dayTotalsFromMeals(meals = []) {
  return meals.reduce((sum, meal) => {
    const view = plannedMealView(meal);
    return {
      ...addMacros(sum, view),
      prepTimeMin: (sum.prepTimeMin || 0) + (view.prepTimeMin || 0),
      estimatedCost: roundQty((sum.estimatedCost || 0) + mealCost(view)),
    };
  }, { ...emptyMacros(), prepTimeMin: 0, estimatedCost: 0 });
}

export function mealCost(meal) {
  return roundQty((meal.ingredients || []).reduce((sum, item) => sum + (item.estimatedCost || 0), 0));
}

export function normalizePlanDay(raw = {}, index = 0) {
  const meals = Array.isArray(raw.meals)
    ? raw.meals.map(normalizePlannedMeal)
    : Array.isArray(raw.planned_meals)
      ? raw.planned_meals.map(normalizePlannedMeal)
      : [];
  const totals = raw.totals && typeof raw.totals === 'object'
    ? {
      ...emptyMacros(),
      prepTimeMin: asNumber(raw.totals.prepTimeMin ?? raw.totals.prep_time_min, 0),
      estimatedCost: asNumber(raw.totals.estimatedCost ?? raw.totals.estimated_cost, 0),
      ...raw.totals,
      ...dayTotalsFromMeals(meals),
    }
    : dayTotalsFromMeals(meals);
  return {
    id: raw.id || createNutritionId(),
    date: asString(raw.date).slice(0, 10),
    dayIndex: asNumber(raw.dayIndex ?? raw.day_index, index),
    meals,
    totals,
    notes: asString(raw.notes),
  };
}

export function weeklyTotalsFromDays(days = []) {
  const totals = days.reduce((sum, day) => ({
    calories: sum.calories + (day.totals?.calories || 0),
    protein: roundOne(sum.protein + (day.totals?.protein || 0)),
    carbs: roundOne(sum.carbs + (day.totals?.carbs || 0)),
    fat: roundOne(sum.fat + (day.totals?.fat || 0)),
    prepTimeMin: sum.prepTimeMin + (day.totals?.prepTimeMin || 0),
    estimatedCost: roundQty(sum.estimatedCost + (day.totals?.estimatedCost || 0)),
  }), { ...emptyMacros(), prepTimeMin: 0, estimatedCost: 0 });
  const count = Math.max(1, days.length);
  return {
    ...totals,
    avgCalories: Math.round(totals.calories / count),
    avgProtein: roundOne(totals.protein / count),
    avgPrepTimeMin: Math.round(totals.prepTimeMin / count),
    days: days.length,
  };
}

export function normalizeMealPlan(raw = {}) {
  const daysCount = PLAN_DAY_COUNTS.includes(Number(raw.days)) ? Number(raw.days) : 7;
  const startDate = asString(raw.startDate || raw.start_date || todayIsoDate()).slice(0, 10);
  const days = Array.isArray(raw.daysList)
    ? raw.daysList.map(normalizePlanDay)
    : Array.isArray(raw.meal_plan_days)
      ? raw.meal_plan_days.map(normalizePlanDay)
      : Array.isArray(raw.planDays)
        ? raw.planDays.map(normalizePlanDay)
        : Array.isArray(raw.dayRows)
          ? raw.dayRows.map(normalizePlanDay)
          : [];
  const normalizedDays = (days.length ? days : []).map((day, index) => ({
    ...day,
    date: day.date || addDaysIso(startDate, index),
    dayIndex: index,
  }));
  const weeklyTotals = weeklyTotalsFromDays(normalizedDays);
  return {
    id: raw.id || createNutritionId(),
    startDate,
    days: daysCount,
    status: pick(PLAN_STATUSES, raw.status, 'active'),
    trainingDays: asStringList(raw.trainingDays || raw.training_days),
    mealsEatenOutside: normalizeOutsideMeals(raw.mealsEatenOutside || raw.meals_eaten_outside),
    availableIngredients: Array.isArray(raw.availableIngredients || raw.available_ingredients)
      ? (raw.availableIngredients || raw.available_ingredients).map(normalizeIngredient)
      : [],
    temporaryInstructions: asString(raw.temporaryInstructions || raw.temporary_instructions),
    dayRows: normalizedDays,
    weeklyTotals: raw.weeklyTotals || raw.weekly_totals
      ? { ...weeklyTotals, ...(raw.weeklyTotals || raw.weekly_totals), ...weeklyTotals }
      : weeklyTotals,
    createdAt: raw.createdAt || raw.created_at || nowIso(),
    updatedAt: raw.updatedAt || raw.updated_at || nowIso(),
  };
}

function normalizeOutsideMeals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    date: asString(item.date).slice(0, 10),
    slots: asStringList(item.slots).filter((slot) => MEAL_SLOTS.some((itemSlot) => itemSlot.id === slot)),
  })).filter((item) => item.date && item.slots.length);
}

export function createEmptyPlanDraft(profile = {}) {
  const startDate = todayIsoDate();
  return {
    startDate,
    days: 7,
    trainingDays: [],
    mealsEatenOutside: [],
    availableIngredients: [],
    temporaryInstructions: '',
    peopleCount: createEmptyProfile(profile).peopleCount,
  };
}

export function normalizePantryItem(raw = {}) {
  const quantity = roundQty(asNumber(raw.quantity, 0));
  return {
    id: raw.id || createNutritionId(),
    ingredient: asString(raw.ingredient || raw.name).trim(),
    quantity,
    unit: asString(raw.unit || 'g').trim() || 'g',
    expiresOn: asNullableString(raw.expiresOn || raw.expires_on),
    lowStock: Boolean(raw.lowStock ?? raw.low_stock) || quantity <= 0,
    updatedAt: raw.updatedAt || raw.updated_at || nowIso(),
  };
}

export function normalizeGroceryItem(raw = {}) {
  const category = GROCERY_CATEGORIES.includes(raw.category) ? raw.category : 'Other';
  return {
    id: raw.id || createNutritionId(),
    name: asString(raw.name || raw.ingredient).trim(),
    category,
    unit: asString(raw.unit || 'g').trim() || 'g',
    requiredQty: roundQty(asNumber(raw.requiredQty ?? raw.required_qty, 0)),
    availableQty: roundQty(asNumber(raw.availableQty ?? raw.available_qty, 0)),
    suggestedQty: roundQty(asNumber(raw.suggestedQty ?? raw.suggested_purchase_qty ?? raw.suggested_qty, 0)),
    packageLabel: asString(raw.packageLabel || raw.package_label),
    estimatedCost: roundQty(asNumber(raw.estimatedCost ?? raw.estimated_cost, 0)),
    purchased: Boolean(raw.purchased),
    manual: Boolean(raw.manual),
  };
}

export function normalizeGroceryList(raw = {}) {
  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeGroceryItem)
    : Array.isArray(raw.grocery_items)
      ? raw.grocery_items.map(normalizeGroceryItem)
      : [];
  const estimatedTotal = roundQty(items.reduce((sum, item) => sum + (item.purchased ? 0 : item.estimatedCost || 0), 0));
  return {
    id: raw.id || createNutritionId(),
    planId: raw.planId || raw.plan_id || null,
    items,
    estimatedTotal: asNumber(raw.estimatedTotal ?? raw.estimated_total, estimatedTotal) || estimatedTotal,
    updatedAt: raw.updatedAt || raw.updated_at || nowIso(),
  };
}

export function createEmptyBundle() {
  return {
    profile: createEmptyProfile(),
    meals: [],
    pantry: [],
    plans: [],
    groceryLists: [],
    activePlanId: null,
    recentMealIds: [],
    updatedAt: nowIso(),
  };
}

export function normalizeBundle(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const meals = (Array.isArray(source.meals) ? source.meals : []).map(normalizeMeal);
  const plans = (Array.isArray(source.plans) ? source.plans : []).map(normalizeMealPlan);
  const groceryLists = (Array.isArray(source.groceryLists) ? source.groceryLists : []).map(normalizeGroceryList);
  const activePlanId = source.activePlanId || source.active_plan_id || plans.find((plan) => plan.status === 'active')?.id || null;
  return {
    profile: createEmptyProfile(source.profile),
    meals,
    pantry: (Array.isArray(source.pantry) ? source.pantry : []).map(normalizePantryItem),
    plans,
    groceryLists,
    activePlanId,
    recentMealIds: asStringList(source.recentMealIds || source.recent_meal_ids),
    updatedAt: source.updatedAt || source.updated_at || nowIso(),
  };
}

export function activePlan(bundle) {
  if (!bundle) return null;
  return bundle.plans.find((plan) => plan.id === bundle.activePlanId)
    || bundle.plans.find((plan) => plan.status === 'active')
    || null;
}

export function ingredientKey(name = '', unit = '') {
  return `${String(name).trim().toLowerCase()}|${String(unit).trim().toLowerCase()}`;
}

export function slotLabel(slot) {
  return MEAL_SLOTS.find((item) => item.id === slot)?.label || slot;
}

export function goalLabel(goalId) {
  return goalMeta(goalId).label;
}
