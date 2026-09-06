import { getOpenAiKey } from '../openai';
import { NUTRITION_CATALOG } from './catalog';
import { filterEligibleMeals, mealViolatesRestrictions, similarMealScore, validateGeneratedPlan } from './validate';
import {
  addDaysIso,
  applyPortion,
  createNutritionId,
  dayTotalsFromMeals,
  emptyMacros,
  normalizeMeal,
  normalizeMealPlan,
  normalizePlannedMeal,
  nowIso,
  plannedMealView,
  profileTargets,
  roundOne,
  slotLabel,
  slotsForMealsPerDay,
  weeklyTotalsFromDays,
} from './schema';

const SLOT_SHARE = {
  breakfast: 0.24,
  lunch: 0.34,
  dinner: 0.32,
  snack: 0.1,
};

function outsideSet(list = []) {
  const map = new Map();
  for (const item of list) {
    map.set(item.date, new Set(item.slots || []));
  }
  return map;
}

function preferredScore(meal, profile) {
  const preferred = (profile.preferredFoods || []).map((item) => item.toLowerCase()).filter(Boolean);
  if (!preferred.length) return 0;
  const hay = `${meal.name} ${(meal.ingredients || []).map((item) => item.name).join(' ')}`.toLowerCase();
  return preferred.reduce((sum, food) => sum + (hay.includes(food) ? 1 : 0), 0);
}

function reuseScore(meal, usedIngredients) {
  if (!usedIngredients.size) return 0;
  let hits = 0;
  for (const ingredient of meal.ingredients || []) {
    if (usedIngredients.has(ingredient.name.toLowerCase())) hits += 1;
  }
  return hits;
}

function pickMeal({ slot, meals, usedCounts, maxReps, profile, usedIngredients, targetCalories, usedNamesToday }) {
  const eligible = meals.filter((meal) => {
    if (meal.mealType !== slot && !(slot === 'snack' && meal.mealType === 'snack')) return false;
    const name = meal.name.toLowerCase();
    if (usedNamesToday.has(name)) return false;
    if ((usedCounts.get(name) || 0) >= maxReps) return false;
    return !mealViolatesRestrictions(meal, profile);
  });
  const pool = eligible.length ? eligible : meals.filter((meal) => meal.mealType === slot);
  if (!pool.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const meal of pool) {
    const calDiff = Math.abs((meal.calories || 0) - targetCalories);
    const protein = meal.protein || 0;
    const score = (protein * 2)
      - calDiff / 12
      + preferredScore(meal, profile) * 18
      + reuseScore(meal, usedIngredients) * 8
      - (usedCounts.get(meal.name.toLowerCase()) || 0) * 14
      - (meal.prepTimeMin || 0) / 8;
    if (score > bestScore) {
      best = meal;
      bestScore = score;
    }
  }
  return best;
}

function scaleToTarget(meal, targetCalories) {
  if (!meal?.calories) return applyPortion(meal, 1);
  const raw = targetCalories / meal.calories;
  const stepped = Math.round(Math.max(0.5, Math.min(1.75, raw)) * 4) / 4;
  return applyPortion(meal, stepped);
}

function outsidePlaceholder(slot, calories, protein) {
  return normalizePlannedMeal({
    id: createNutritionId(),
    slot,
    locked: true,
    outside: true,
    portionMultiplier: 1,
    snapshot: normalizeMeal({
      name: `Eating out · ${slotLabel(slot)}`,
      mealType: slot,
      calories: Math.round(calories),
      protein: roundOne(protein),
      carbs: 0,
      fat: 0,
      prepTimeMin: 0,
      instructions: 'Placeholder for a meal eaten outside. Adjust calories after you know what you ate.',
      tags: ['outside'],
      ingredients: [],
    }),
  });
}

export function buildLocalMealPlan({ profile, draft, meals = NUTRITION_CATALOG } = {}) {
  const targets = profileTargets(profile);
  const slots = slotsForMealsPerDay(profile.mealsPerDay);
  const maxReps = profile.maxMealRepetitions || 2;
  const eligible = filterEligibleMeals(meals.length ? meals : NUTRITION_CATALOG, profile);
  const library = eligible.length ? eligible : meals;
  const outside = outsideSet(draft.mealsEatenOutside);
  const usedCounts = new Map();
  const usedIngredients = new Set((draft.availableIngredients || []).map((item) => String(item.name || '').toLowerCase()));
  const snackCount = slots.filter((slot) => slot === 'snack').length;
  const snackShare = snackCount ? SLOT_SHARE.snack / snackCount : 0;

  const dayRows = [];
  for (let index = 0; index < draft.days; index += 1) {
    const date = addDaysIso(draft.startDate, index);
    const training = (draft.trainingDays || []).includes(date);
    const dayCalories = Math.round(targets.calories * (training ? 1.06 : 1));
    const dayProtein = roundOne(targets.protein * (training ? 1.08 : 1));
    const skipped = outside.get(date) || new Set();
    const usedNamesToday = new Set();
    const planned = [];

    const activeSlots = slots.filter((slot) => !skipped.has(slot));
    const remainingShare = activeSlots.reduce((sum, slot) => (
      sum + (slot === 'snack' ? snackShare : SLOT_SHARE[slot] || 0.25)
    ), 0) || 1;

    for (const slot of slots) {
      const share = (slot === 'snack' ? snackShare : SLOT_SHARE[slot] || 0.25) / remainingShare;
      const slotCalories = Math.round(dayCalories * share);
      const slotProtein = roundOne(dayProtein * share);
      if (skipped.has(slot)) {
        planned.push(outsidePlaceholder(slot, slotCalories, slotProtein));
        continue;
      }
      const picked = pickMeal({
        slot,
        meals: library,
        usedCounts,
        maxReps,
        profile,
        usedIngredients,
        targetCalories: slotCalories,
        usedNamesToday,
      });
      if (!picked) {
        planned.push(outsidePlaceholder(slot, slotCalories, slotProtein));
        continue;
      }
      const scaled = scaleToTarget(picked, slotCalories);
      const row = normalizePlannedMeal({
        id: createNutritionId(),
        mealId: picked.id,
        slot,
        locked: false,
        consumed: false,
        portionMultiplier: scaled.portionMultiplier,
        snapshot: { ...scaled, id: picked.id, catalogKey: picked.catalogKey },
      });
      planned.push(row);
      const name = scaled.name.toLowerCase();
      usedCounts.set(name, (usedCounts.get(name) || 0) + 1);
      usedNamesToday.add(name);
      for (const ingredient of scaled.ingredients || []) {
        usedIngredients.add(ingredient.name.toLowerCase());
      }
    }

    dayRows.push({
      id: createNutritionId(),
      date,
      dayIndex: index,
      meals: planned,
      totals: dayTotalsFromMeals(planned),
      notes: training ? 'Training day' : '',
    });
  }

  return normalizeMealPlan({
    id: createNutritionId(),
    startDate: draft.startDate,
    days: draft.days,
    status: 'active',
    trainingDays: draft.trainingDays || [],
    mealsEatenOutside: draft.mealsEatenOutside || [],
    availableIngredients: draft.availableIngredients || [],
    temporaryInstructions: draft.temporaryInstructions || '',
    dayRows,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function regenerateLocalDay(plan, date, { profile, meals, keepLocked = true } = {}) {
  const draft = {
    startDate: date,
    days: 1,
    trainingDays: (plan.trainingDays || []).includes(date) ? [date] : [],
    mealsEatenOutside: (plan.mealsEatenOutside || []).filter((item) => item.date === date),
    availableIngredients: plan.availableIngredients || [],
    temporaryInstructions: plan.temporaryInstructions || '',
  };
  const generated = buildLocalMealPlan({ profile, draft, meals });
  const fresh = generated.dayRows[0];
  const existing = (plan.dayRows || []).find((day) => day.date === date);
  if (!existing || !keepLocked) return { ...fresh, id: existing?.id || fresh.id };

  const lockedBySlot = new Map();
  for (const meal of existing.meals || []) {
    if (meal.locked) lockedBySlot.set(meal.slot, meal);
  }
  const mealsNext = (fresh.meals || []).map((meal) => lockedBySlot.get(meal.slot) || meal);
  return {
    ...existing,
    meals: mealsNext,
    totals: dayTotalsFromMeals(mealsNext),
    notes: existing.notes,
  };
}

export function localMealAlternatives({ meal, meals = NUTRITION_CATALOG, profile, limit = 5 } = {}) {
  const view = plannedMealView(meal);
  return filterEligibleMeals(meals, profile)
    .filter((item) => item.mealType === view.slot || item.mealType === view.mealType)
    .filter((item) => item.name !== view.name && item.catalogKey !== view.catalogKey)
    .map((item) => ({ meal: item, score: similarMealScore(view, item) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.meal);
}

function planToPromptJson(plan) {
  return {
    startDate: plan.startDate,
    days: plan.days,
    dayRows: (plan.dayRows || []).map((day) => ({
      date: day.date,
      notes: day.notes,
      meals: (day.meals || []).map((planned) => {
        const meal = plannedMealView(planned);
        return {
          slot: meal.slot,
          name: meal.name,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          prepTimeMin: meal.prepTimeMin,
          instructions: meal.instructions,
          portionMultiplier: meal.portionMultiplier,
          outside: meal.outside,
          ingredients: (meal.ingredients || []).map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            estimatedCost: item.estimatedCost,
          })),
        };
      }),
    })),
  };
}

const localProvider = {
  id: 'local',
  label: 'Local catalog',
  async generatePlan(input) {
    return buildLocalMealPlan(input);
  },
  async regenerateDay(input) {
    return regenerateLocalDay(input.plan, input.date, input);
  },
  async suggestReplacements(input) {
    return localMealAlternatives(input);
  },
};

async function openaiComplete(messages) {
  const key = getOpenAiKey();
  if (!key) throw new Error('No OpenAI API key configured.');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 18000) : null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller?.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 7000,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI error ${response.status}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('The model did not return JSON.');
      return JSON.parse(match[0]);
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Meal plan generation timed out.');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mealsBrief(meals) {
  return meals.slice(0, 40).map((meal) => ({
    name: meal.name,
    mealType: meal.mealType,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    prepTimeMin: meal.prepTimeMin,
    tags: meal.tags,
    allergens: meal.allergens,
    diets: meal.diets,
    ingredients: (meal.ingredients || []).map((item) => `${item.quantity}${item.unit} ${item.name}`),
  }));
}

const openaiProvider = {
  id: 'openai',
  label: 'OpenAI',
  async generatePlan({ profile, draft, meals }) {
    const targets = profileTargets(profile);
    const json = await openaiComplete([
      {
        role: 'system',
        content: `You generate practical home-cooking meal plans. Return JSON only.
Do not give medical advice. Use the user's calorie/protein targets as given.
Reuse ingredients across the week. Respect allergies, excluded foods, max cooking time, equipment, and max meal repetitions.
Quantities must be realistic grocery amounts. Prefer the provided meal library; you may adapt portions.
JSON shape:
{"days":[{"date":"YYYY-MM-DD","meals":[{"slot":"breakfast|lunch|dinner|snack","name":"","calories":0,"protein":0,"carbs":0,"fat":0,"prepTimeMin":0,"instructions":"","portionMultiplier":1,"outside":false,"ingredients":[{"name":"","quantity":0,"unit":"g","category":"Produce|Meat|Fish|Dairy|Grains|Pantry|Frozen|Other","estimatedCost":0}]}]}]}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          startDate: draft.startDate,
          days: draft.days,
          calorieTarget: targets.calories,
          proteinTarget: targets.protein,
          mealsPerDay: profile.mealsPerDay,
          dietaryPreferences: profile.dietaryPreferences,
          allergies: profile.allergies,
          excludedFoods: profile.excludedFoods,
          preferredFoods: profile.preferredFoods,
          maxCookingTimeMin: profile.maxCookingTimeMin,
          weeklyBudget: profile.weeklyBudget,
          peopleCount: profile.peopleCount,
          cookingEquipment: profile.cookingEquipment,
          maxMealRepetitions: profile.maxMealRepetitions,
          permanentInstructions: profile.permanentInstructions,
          trainingDays: draft.trainingDays,
          mealsEatenOutside: draft.mealsEatenOutside,
          availableIngredients: draft.availableIngredients,
          temporaryInstructions: draft.temporaryInstructions,
          library: mealsBrief(meals || NUTRITION_CATALOG),
        }),
      },
    ]);
    const dayRows = (json.days || json.dayRows || []).map((day, index) => ({
      id: createNutritionId(),
      date: day.date || addDaysIso(draft.startDate, index),
      dayIndex: index,
      meals: (day.meals || []).map((meal) => normalizePlannedMeal({
        slot: meal.slot,
        outside: meal.outside,
        portionMultiplier: meal.portionMultiplier || 1,
        snapshot: meal,
      })),
      totals: emptyMacros(),
    })).map((day) => ({ ...day, totals: dayTotalsFromMeals(day.meals) }));

    const plan = normalizeMealPlan({
      startDate: draft.startDate,
      days: draft.days,
      status: 'active',
      trainingDays: draft.trainingDays,
      mealsEatenOutside: draft.mealsEatenOutside,
      availableIngredients: draft.availableIngredients,
      temporaryInstructions: draft.temporaryInstructions,
      dayRows,
    });
    const checked = validateGeneratedPlan(plan, { profile, draft });
    if (!checked.ok) return buildLocalMealPlan({ profile, draft, meals });
    return checked.plan;
  },
  async regenerateDay(input) {
    try {
      const one = await this.generatePlan({
        profile: input.profile,
        meals: input.meals,
        draft: {
          startDate: input.date,
          days: 1,
          trainingDays: (input.plan.trainingDays || []).includes(input.date) ? [input.date] : [],
          mealsEatenOutside: (input.plan.mealsEatenOutside || []).filter((item) => item.date === input.date),
          availableIngredients: input.plan.availableIngredients,
          temporaryInstructions: input.plan.temporaryInstructions,
        },
      });
      const fresh = one.dayRows[0];
      const existing = input.plan.dayRows.find((day) => day.date === input.date);
      const locked = new Map((existing?.meals || []).filter((meal) => meal.locked).map((meal) => [meal.slot, meal]));
      const mealsNext = (fresh.meals || []).map((meal) => locked.get(meal.slot) || meal);
      return { ...existing, ...fresh, id: existing?.id || fresh.id, meals: mealsNext, totals: dayTotalsFromMeals(mealsNext) };
    } catch {
      return regenerateLocalDay(input.plan, input.date, input);
    }
  },
  async suggestReplacements(input) {
    return localMealAlternatives(input);
  },
};

const providers = {
  local: localProvider,
  openai: openaiProvider,
};

export function listNutritionProviders() {
  return Object.values(providers).map((item) => ({ id: item.id, label: item.label }));
}

export function resolveNutritionProvider(name) {
  if (name && providers[name]) return providers[name];
  return localProvider;
}

export function createNutritionGenerator(providerOrName) {
  const provider = typeof providerOrName === 'string' || providerOrName == null
    ? resolveNutritionProvider(providerOrName)
    : providerOrName;

  return {
    providerId: provider.id,
    async generatePlan(input) {
      try {
        const raw = await provider.generatePlan(input);
        const checked = validateGeneratedPlan(raw, input);
        if (!checked.ok && provider.id !== 'local') {
          return buildLocalMealPlan(input);
        }
        return checked.plan;
      } catch (err) {
        if (provider.id === 'local') throw err;
        return buildLocalMealPlan(input);
      }
    },
    async regenerateDay(input) {
      const day = await provider.regenerateDay(input);
      return day;
    },
    async suggestReplacements(input) {
      const list = await provider.suggestReplacements(input);
      return Array.isArray(list) ? list : [];
    },
  };
}

export function summarizePlan(plan) {
  const weekly = weeklyTotalsFromDays(plan?.dayRows || []);
  return {
    ...weekly,
    estimatedCost: weekly.estimatedCost,
    json: planToPromptJson(plan),
  };
}
