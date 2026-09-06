import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { waitForAuthSession } from '../auth';
import { seedLibraryMeals } from './catalog';
import {
  createEmptyBundle,
  createEmptyProfile,
  normalizeBundle,
  normalizeGroceryList,
  normalizeMeal,
  normalizeMealPlan,
  normalizePantryItem,
  nowIso,
} from './schema';

const STORAGE_KEY = 'lifev1-nutrition';

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return withSeededMeals(normalizeBundle(raw ? JSON.parse(raw) : null));
  } catch {
    return withSeededMeals(createEmptyBundle());
  }
}

function writeLocal(bundle) {
  const next = withSeededMeals(normalizeBundle(bundle));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function withSeededMeals(bundle) {
  const meals = seedLibraryMeals(bundle.meals || []);
  return { ...bundle, meals };
}

async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const session = await waitForAuthSession();
  return session?.user || null;
}

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');
  return supabase;
}

function profileToRow(profile, userId) {
  return {
    user_id: userId,
    goal: profile.goal,
    daily_calorie_target: profile.dailyCalorieTarget,
    daily_protein_target: profile.dailyProteinTarget,
    meals_per_day: profile.mealsPerDay,
    preferred_meal_times: profile.preferredMealTimes,
    dietary_preferences: profile.dietaryPreferences,
    allergies: profile.allergies,
    excluded_foods: profile.excludedFoods,
    preferred_foods: profile.preferredFoods,
    max_cooking_time_min: profile.maxCookingTimeMin,
    weekly_budget: profile.weeklyBudget,
    people_count: profile.peopleCount,
    cooking_equipment: profile.cookingEquipment,
    max_meal_repetitions: profile.maxMealRepetitions,
    permanent_instructions: profile.permanentInstructions,
    updated_at: profile.updatedAt || nowIso(),
  };
}

function rowToProfile(row) {
  if (!row) return createEmptyProfile();
  return createEmptyProfile({
    goal: row.goal,
    dailyCalorieTarget: row.daily_calorie_target,
    dailyProteinTarget: row.daily_protein_target,
    mealsPerDay: row.meals_per_day,
    preferredMealTimes: row.preferred_meal_times,
    dietaryPreferences: row.dietary_preferences,
    allergies: row.allergies,
    excludedFoods: row.excluded_foods,
    preferredFoods: row.preferred_foods,
    maxCookingTimeMin: row.max_cooking_time_min,
    weeklyBudget: row.weekly_budget,
    peopleCount: row.people_count,
    cookingEquipment: row.cooking_equipment,
    maxMealRepetitions: row.max_meal_repetitions,
    permanentInstructions: row.permanent_instructions,
    updatedAt: row.updated_at,
  });
}

function mealToRow(meal, userId) {
  return {
    id: meal.id,
    user_id: userId,
    catalog_key: meal.catalogKey,
    name: meal.name,
    meal_type: meal.mealType,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    prep_time_min: meal.prepTimeMin,
    servings: meal.servings,
    instructions: meal.instructions,
    tags: meal.tags,
    allergens: meal.allergens,
    diets: meal.diets,
    equipment: meal.equipment,
    favorite: meal.favorite,
    source: meal.source,
    created_at: meal.createdAt,
    updated_at: meal.updatedAt,
  };
}

function ingredientToRow(ingredient, mealId) {
  return {
    id: ingredient.id,
    meal_id: mealId,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    category: ingredient.category,
    estimated_cost: ingredient.estimatedCost,
    cost_per_unit: ingredient.costPerUnit,
    package_size: ingredient.packageSize,
    package_unit: ingredient.packageUnit,
  };
}

function rowToMeal(row) {
  return normalizeMeal({
    id: row.id,
    catalogKey: row.catalog_key,
    name: row.name,
    mealType: row.meal_type,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    prepTimeMin: row.prep_time_min,
    servings: row.servings,
    instructions: row.instructions,
    tags: row.tags,
    allergens: row.allergens,
    diets: row.diets,
    equipment: row.equipment,
    favorite: row.favorite,
    source: row.source,
    ingredients: row.meal_ingredients || row.ingredients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function planToRow(plan, userId) {
  return {
    id: plan.id,
    user_id: userId,
    start_date: plan.startDate,
    days: plan.days,
    status: plan.status,
    training_days: plan.trainingDays,
    meals_eaten_outside: plan.mealsEatenOutside,
    available_ingredients: plan.availableIngredients,
    temporary_instructions: plan.temporaryInstructions,
    weekly_totals: plan.weeklyTotals,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };
}

function rowToPlan(row) {
  const dayRows = (row.meal_plan_days || []).map((day) => ({
    id: day.id,
    date: day.date,
    dayIndex: day.day_index,
    totals: day.totals,
    notes: day.notes,
    meals: (day.planned_meals || []).map((planned) => ({
      id: planned.id,
      mealId: planned.meal_id,
      slot: planned.slot,
      locked: planned.locked,
      consumed: planned.consumed,
      outside: planned.outside,
      portionMultiplier: planned.portion_multiplier,
      snapshot: planned.snapshot,
    })),
  })).sort((a, b) => a.dayIndex - b.dayIndex);
  return normalizeMealPlan({
    id: row.id,
    startDate: row.start_date,
    days: row.days,
    status: row.status,
    trainingDays: row.training_days,
    mealsEatenOutside: row.meals_eaten_outside,
    availableIngredients: row.available_ingredients,
    temporaryInstructions: row.temporary_instructions,
    weeklyTotals: row.weekly_totals,
    dayRows,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function pantryToRow(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    ingredient: item.ingredient,
    quantity: item.quantity,
    unit: item.unit,
    expires_on: item.expiresOn,
    low_stock: item.lowStock,
    updated_at: item.updatedAt,
  };
}

function groceryListToRow(list, userId) {
  return {
    id: list.id,
    user_id: userId,
    plan_id: list.planId,
    estimated_total: list.estimatedTotal,
    updated_at: list.updatedAt,
  };
}

function groceryItemToRow(item, listId) {
  return {
    id: item.id,
    list_id: listId,
    name: item.name,
    category: item.category,
    unit: item.unit,
    required_qty: item.requiredQty,
    available_qty: item.availableQty,
    suggested_purchase_qty: item.suggestedQty,
    package_label: item.packageLabel,
    estimated_cost: item.estimatedCost,
    purchased: item.purchased,
    manual: item.manual,
  };
}

function mergeBundles(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;
  return String(local.updatedAt || '') >= String(cloud.updatedAt || '') ? local : cloud;
}

export async function pullNutritionBundle() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = requireClient();
  const [profileRes, mealsRes, pantryRes, plansRes, listsRes] = await Promise.all([
    supabase.from('nutrition_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('meals').select('*, meal_ingredients(*)').eq('user_id', user.id),
    supabase.from('pantry_items').select('*').eq('user_id', user.id).order('ingredient'),
    supabase.from('meal_plans').select('*, meal_plan_days(*, planned_meals(*))').eq('user_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('grocery_lists').select('*, grocery_items(*)').eq('user_id', user.id),
  ]);

  const firstError = profileRes.error || mealsRes.error || pantryRes.error || plansRes.error || listsRes.error;
  if (firstError) {
    if (isMissingTable(firstError)) return null;
    throw firstError;
  }

  const meals = (mealsRes.data || []).map(rowToMeal);
  const plans = (plansRes.data || []).map(rowToPlan);
  const groceryLists = (listsRes.data || []).map((row) => normalizeGroceryList({
    id: row.id,
    planId: row.plan_id,
    estimatedTotal: row.estimated_total,
    updatedAt: row.updated_at,
    items: row.grocery_items,
  }));
  const activePlanId = plans.find((plan) => plan.status === 'active')?.id || plans[0]?.id || null;

  return normalizeBundle({
    profile: rowToProfile(profileRes.data),
    meals,
    pantry: (pantryRes.data || []).map((row) => normalizePantryItem({
      id: row.id,
      ingredient: row.ingredient,
      quantity: row.quantity,
      unit: row.unit,
      expiresOn: row.expires_on,
      lowStock: row.low_stock,
      updatedAt: row.updated_at,
    })),
    plans,
    groceryLists,
    activePlanId,
    updatedAt: profileRes.data?.updated_at || plans[0]?.updatedAt || nowIso(),
  });
}

async function replaceChildren(supabase, table, parentColumn, parentId, rows) {
  const { error: deleteError } = await supabase.from(table).delete().eq(parentColumn, parentId);
  if (deleteError) throw deleteError;
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

export async function pushNutritionBundle(bundle) {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: 'offline-or-signed-out' };
  const supabase = requireClient();
  const next = normalizeBundle(bundle);

  const { error: profileError } = await supabase.from('nutrition_profiles').upsert(profileToRow(next.profile, user.id));
  if (profileError) {
    if (isMissingTable(profileError)) return { ok: false, reason: 'missing-table' };
    throw profileError;
  }

  const { data: existingMeals, error: mealListError } = await supabase.from('meals').select('id').eq('user_id', user.id);
  if (mealListError) throw mealListError;
  const keepMeals = new Set(next.meals.map((meal) => meal.id));
  const staleMeals = (existingMeals || []).map((row) => row.id).filter((id) => !keepMeals.has(id));
  if (staleMeals.length) {
    const { error } = await supabase.from('meals').delete().in('id', staleMeals);
    if (error) throw error;
  }
  if (next.meals.length) {
    const { error } = await supabase.from('meals').upsert(next.meals.map((meal) => mealToRow(meal, user.id)));
    if (error) throw error;
    for (const meal of next.meals) {
      await replaceChildren(
        supabase,
        'meal_ingredients',
        'meal_id',
        meal.id,
        (meal.ingredients || []).filter((item) => item.name).map((item) => ingredientToRow(item, meal.id)),
      );
    }
  }

  const { data: existingPantry, error: pantryListError } = await supabase.from('pantry_items').select('id').eq('user_id', user.id);
  if (pantryListError) throw pantryListError;
  const keepPantry = new Set(next.pantry.map((item) => item.id));
  const stalePantry = (existingPantry || []).map((row) => row.id).filter((id) => !keepPantry.has(id));
  if (stalePantry.length) {
    const { error } = await supabase.from('pantry_items').delete().in('id', stalePantry);
    if (error) throw error;
  }
  if (next.pantry.length) {
    const { error } = await supabase.from('pantry_items').upsert(next.pantry.map((item) => pantryToRow(item, user.id)));
    if (error) throw error;
  }

  const { data: existingPlans, error: planListError } = await supabase.from('meal_plans').select('id').eq('user_id', user.id);
  if (planListError) throw planListError;
  const keepPlans = new Set(next.plans.map((plan) => plan.id));
  const stalePlans = (existingPlans || []).map((row) => row.id).filter((id) => !keepPlans.has(id));
  if (stalePlans.length) {
    const { error } = await supabase.from('meal_plans').delete().in('id', stalePlans);
    if (error) throw error;
  }

  for (const plan of next.plans) {
    const { error } = await supabase.from('meal_plans').upsert(planToRow(plan, user.id));
    if (error) throw error;
    const { data: existingDays, error: daysError } = await supabase.from('meal_plan_days').select('id').eq('plan_id', plan.id);
    if (daysError) throw daysError;
    const keepDays = new Set((plan.dayRows || []).map((day) => day.id));
    const staleDays = (existingDays || []).map((row) => row.id).filter((id) => !keepDays.has(id));
    if (staleDays.length) {
      const { error: deleteDaysError } = await supabase.from('meal_plan_days').delete().in('id', staleDays);
      if (deleteDaysError) throw deleteDaysError;
    }
    for (const day of plan.dayRows || []) {
      const { error: dayError } = await supabase.from('meal_plan_days').upsert({
        id: day.id,
        plan_id: plan.id,
        date: day.date,
        day_index: day.dayIndex,
        totals: day.totals,
        notes: day.notes || '',
      });
      if (dayError) throw dayError;
      await replaceChildren(
        supabase,
        'planned_meals',
        'plan_day_id',
        day.id,
        (day.meals || []).map((planned) => ({
          id: planned.id,
          plan_day_id: day.id,
          meal_id: next.meals.some((meal) => meal.id === planned.mealId) ? planned.mealId : null,
          slot: planned.slot,
          locked: planned.locked,
          consumed: planned.consumed,
          outside: Boolean(planned.outside),
          portion_multiplier: planned.portionMultiplier,
          snapshot: planned.snapshot,
        })),
      );
    }
  }

  const { data: existingLists, error: listError } = await supabase.from('grocery_lists').select('id').eq('user_id', user.id);
  if (listError) throw listError;
  const keepLists = new Set(next.groceryLists.map((item) => item.id));
  const staleLists = (existingLists || []).map((row) => row.id).filter((id) => !keepLists.has(id));
  if (staleLists.length) {
    const { error } = await supabase.from('grocery_lists').delete().in('id', staleLists);
    if (error) throw error;
  }
  for (const list of next.groceryLists) {
    const { error } = await supabase.from('grocery_lists').upsert(groceryListToRow(list, user.id));
    if (error) throw error;
    await replaceChildren(
      supabase,
      'grocery_items',
      'list_id',
      list.id,
      (list.items || []).map((item) => groceryItemToRow(item, list.id)),
    );
  }

  return { ok: true };
}

export async function loadNutritionBundle() {
  const local = readLocal();
  try {
    const cloud = await pullNutritionBundle();
    const merged = withSeededMeals(mergeBundles(local, cloud));
    writeLocal(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveNutritionBundle(bundle) {
  const next = writeLocal({
    ...normalizeBundle(bundle),
    updatedAt: nowIso(),
  });
  try {
    await pushNutritionBundle(next);
  } catch {
    /* stay local if cloud is down */
  }
  return next;
}

export function readNutritionBundleLocal() {
  return readLocal();
}
