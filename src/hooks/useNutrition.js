import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NUTRITION_CATALOG } from '../lib/nutrition/catalog';
import { createNutritionGenerator } from '../lib/nutrition/generate';
import { addManualGroceryItem, buildGroceryList } from '../lib/nutrition/groceries';
import {
  activePlan,
  applyPortion,
  createEmptyPlanDraft,
  createEmptyProfile,
  createNutritionId,
  dayTotalsFromMeals,
  normalizeMeal,
  normalizeMealPlan,
  normalizePantryItem,
  normalizePlannedMeal,
  nowIso,
  plannedMealView,
  weeklyTotalsFromDays,
} from '../lib/nutrition/schema';
import { loadNutritionBundle, saveNutritionBundle } from '../lib/nutrition/store';

export function useNutrition() {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadNutritionBundle()
      .then((next) => {
        if (!cancelled) setBundle(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Nutrition could not load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next) => {
    setBundle(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      saveNutritionBundle(next)
        .catch((err) => setError(err.message || 'Nutrition could not save.'))
        .finally(() => setSaving(false));
    }, 450);
  }, []);

  const updateBundle = useCallback((patchOrFn) => {
    setBundle((prev) => {
      if (!prev) return prev;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      const next = { ...prev, ...patch, updatedAt: nowIso() };
      persist(next);
      return next;
    });
  }, [persist]);

  const profile = bundle?.profile || createEmptyProfile();
  const meals = bundle?.meals || [];
  const pantry = bundle?.pantry || [];
  const plan = activePlan(bundle);
  const groceryList = useMemo(() => {
    if (!bundle) return null;
    if (!plan) return bundle.groceryLists[0] || null;
    return bundle.groceryLists.find((item) => item.planId === plan.id) || bundle.groceryLists[0] || null;
  }, [bundle, plan]);

  const refreshGroceries = useCallback((nextBundle, nextPlan = plan) => {
    if (!nextPlan) return nextBundle;
    const existing = (nextBundle.groceryLists || []).find((item) => item.planId === nextPlan.id);
    const list = buildGroceryList({
      plan: nextPlan,
      pantry: nextBundle.pantry,
      extraAvailable: nextPlan.availableIngredients,
      existing,
      peopleCount: nextBundle.profile?.peopleCount || 1,
    });
    const groceryLists = [
      list,
      ...(nextBundle.groceryLists || []).filter((item) => item.planId !== nextPlan.id && item.id !== list.id),
    ];
    return { ...nextBundle, groceryLists };
  }, [plan]);

  const saveProfile = useCallback((patch) => {
    updateBundle((prev) => ({
      profile: { ...createEmptyProfile({ ...prev.profile, ...patch }), updatedAt: nowIso() },
    }));
  }, [updateBundle]);

  const libraryMeals = meals.length ? meals : NUTRITION_CATALOG;

  const generatePlan = useCallback(async (draft) => {
    setBusy('plan');
    setError('');
    setWarnings([]);
    try {
      const generator = createNutritionGenerator();
      const created = await generator.generatePlan({
        profile,
        draft: { ...createEmptyPlanDraft(profile), ...draft },
        meals: libraryMeals,
      });
      updateBundle((prev) => {
        const archived = (prev.plans || []).map((item) => (
          item.id === created.id ? created : { ...item, status: item.status === 'active' ? 'archived' : item.status }
        ));
        const plans = [created, ...archived.filter((item) => item.id !== created.id)];
        return refreshGroceries({
          ...prev,
          plans,
          activePlanId: created.id,
          recentMealIds: [
            ...created.dayRows.flatMap((day) => day.meals.map((meal) => meal.mealId)),
            ...(prev.recentMealIds || []),
          ].filter(Boolean).slice(0, 24),
        }, created);
      });
      return created;
    } catch (err) {
      setError(err.message || 'Could not generate a meal plan.');
      return null;
    } finally {
      setBusy('');
    }
  }, [libraryMeals, profile, refreshGroceries, updateBundle]);

  const regenerateDay = useCallback(async (date) => {
    if (!plan) return null;
    setBusy(`day:${date}`);
    setError('');
    try {
      const generator = createNutritionGenerator();
      const nextDay = await generator.regenerateDay({
        plan,
        date,
        profile,
        meals: libraryMeals,
      });
      updateBundle((prev) => {
        const current = activePlan(prev);
        if (!current) return prev;
        const dayRows = current.dayRows.map((day) => (day.date === date ? nextDay : day));
        const nextPlan = normalizeMealPlan({
          ...current,
          dayRows,
          weeklyTotals: weeklyTotalsFromDays(dayRows),
          updatedAt: nowIso(),
        });
        const plans = prev.plans.map((item) => (item.id === nextPlan.id ? nextPlan : item));
        return refreshGroceries({ ...prev, plans }, nextPlan);
      });
      return nextDay;
    } catch (err) {
      setError(err.message || 'Could not regenerate this day.');
      return null;
    } finally {
      setBusy('');
    }
  }, [libraryMeals, plan, profile, refreshGroceries, updateBundle]);

  const suggestReplacements = useCallback(async (plannedMeal) => {
    const generator = createNutritionGenerator();
    return generator.suggestReplacements({
      meal: plannedMeal,
      meals: libraryMeals,
      profile,
    });
  }, [libraryMeals, profile]);

  const patchPlannedMeal = useCallback((dayDate, mealId, patchOrFn) => {
    updateBundle((prev) => {
      const current = activePlan(prev);
      if (!current) return prev;
      const dayRows = current.dayRows.map((day) => {
        if (day.date !== dayDate) return day;
        const mealsNext = day.meals.map((meal) => {
          if (meal.id !== mealId) return meal;
          const patch = typeof patchOrFn === 'function' ? patchOrFn(meal) : patchOrFn;
          return normalizePlannedMeal({ ...meal, ...patch });
        });
        return { ...day, meals: mealsNext, totals: dayTotalsFromMeals(mealsNext) };
      });
      const nextPlan = normalizeMealPlan({ ...current, dayRows, updatedAt: nowIso() });
      const plans = prev.plans.map((item) => (item.id === nextPlan.id ? nextPlan : item));
      return refreshGroceries({ ...prev, plans }, nextPlan);
    });
  }, [refreshGroceries, updateBundle]);

  const replaceMeal = useCallback((dayDate, plannedId, nextMeal, multiplier) => {
    const scaled = applyPortion(nextMeal, multiplier || 1);
    patchPlannedMeal(dayDate, plannedId, (current) => ({
      ...current,
      mealId: nextMeal.id,
      locked: current.locked,
      consumed: false,
      outside: false,
      portionMultiplier: scaled.portionMultiplier,
      snapshot: { ...scaled, id: nextMeal.id, catalogKey: nextMeal.catalogKey },
    }));
    updateBundle((prev) => ({
      recentMealIds: [nextMeal.id, ...(prev.recentMealIds || []).filter((id) => id !== nextMeal.id)].slice(0, 24),
    }));
  }, [patchPlannedMeal, updateBundle]);

  const setPortion = useCallback((dayDate, plannedId, multiplier) => {
    patchPlannedMeal(dayDate, plannedId, (current) => {
      const view = plannedMealView(current);
      const scaled = applyPortion(view, multiplier);
      return {
        ...current,
        portionMultiplier: scaled.portionMultiplier,
        snapshot: { ...scaled, id: view.mealId || view.id, catalogKey: view.catalogKey },
      };
    });
  }, [patchPlannedMeal]);

  const upsertMeal = useCallback((meal) => {
    const next = normalizeMeal({ ...meal, updatedAt: nowIso(), source: meal.source || 'custom' });
    updateBundle((prev) => {
      const exists = prev.meals.some((item) => item.id === next.id);
      return {
        meals: exists
          ? prev.meals.map((item) => (item.id === next.id ? next : item))
          : [next, ...prev.meals],
      };
    });
    return next;
  }, [updateBundle]);

  const toggleFavorite = useCallback((mealId) => {
    updateBundle((prev) => ({
      meals: prev.meals.map((item) => (item.id === mealId ? { ...item, favorite: !item.favorite, updatedAt: nowIso() } : item)),
    }));
  }, [updateBundle]);

  const deleteMeal = useCallback((mealId) => {
    updateBundle((prev) => ({
      meals: prev.meals.filter((item) => item.id !== mealId || item.source === 'catalog'),
    }));
  }, [updateBundle]);

  const savePantryItem = useCallback((item) => {
    const next = normalizePantryItem({ ...item, id: item.id || createNutritionId(), updatedAt: nowIso() });
    updateBundle((prev) => {
      const exists = prev.pantry.some((row) => row.id === next.id);
      const pantryNext = exists
        ? prev.pantry.map((row) => (row.id === next.id ? next : row))
        : [next, ...prev.pantry];
      return refreshGroceries({ ...prev, pantry: pantryNext });
    });
  }, [refreshGroceries, updateBundle]);

  const deletePantryItem = useCallback((id) => {
    updateBundle((prev) => refreshGroceries({
      ...prev,
      pantry: prev.pantry.filter((item) => item.id !== id),
    }));
  }, [refreshGroceries, updateBundle]);

  const patchGroceryItem = useCallback((itemId, patch) => {
    updateBundle((prev) => {
      const groceryLists = prev.groceryLists.map((list) => {
        if (groceryList && list.id !== groceryList.id) return list;
        const items = list.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
        const estimatedTotal = items.reduce((sum, item) => sum + (item.purchased ? 0 : item.estimatedCost || 0), 0);
        return { ...list, items, estimatedTotal, updatedAt: nowIso() };
      });
      return { groceryLists };
    });
  }, [groceryList, updateBundle]);

  const addGroceryItem = useCallback((partial) => {
    if (!groceryList) return;
    updateBundle((prev) => ({
      groceryLists: prev.groceryLists.map((list) => (
        list.id === groceryList.id ? addManualGroceryItem(list, partial) : list
      )),
    }));
  }, [groceryList, updateBundle]);

  const deleteGroceryItem = useCallback((itemId) => {
    updateBundle((prev) => ({
      groceryLists: prev.groceryLists.map((list) => (
        list.id === groceryList?.id
          ? { ...list, items: list.items.filter((item) => item.id !== itemId), updatedAt: nowIso() }
          : list
      )),
    }));
  }, [groceryList, updateBundle]);

  return {
    loading,
    saving,
    busy,
    error,
    setError,
    warnings,
    bundle,
    profile,
    meals,
    pantry,
    plan,
    groceryList,
    saveProfile,
    generatePlan,
    regenerateDay,
    suggestReplacements,
    patchPlannedMeal,
    replaceMeal,
    setPortion,
    upsertMeal,
    toggleFavorite,
    deleteMeal,
    savePantryItem,
    deletePantryItem,
    patchGroceryItem,
    addGroceryItem,
    deleteGroceryItem,
  };
}
