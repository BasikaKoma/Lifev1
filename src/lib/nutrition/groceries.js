import {
  GROCERY_CATEGORIES,
  createNutritionId,
  ingredientKey,
  mealCost,
  nowIso,
  normalizeGroceryItem,
  normalizeGroceryList,
  plannedMealView,
  roundQty,
} from './schema';

const PACKS_BY_UNIT = {
  g: [250, 500, 1000],
  kg: [1],
  ml: [250, 500, 1000],
  l: [1],
  pcs: [1, 6, 10, 12],
};

function packFor(unit, need) {
  if (need <= 0) return { qty: 0, label: '—' };
  const packs = PACKS_BY_UNIT[String(unit || '').toLowerCase()] || [1];
  const chosen = packs.find((size) => size >= need) || packs[packs.length - 1];
  if (chosen >= need) {
    return {
      qty: chosen,
      label: chosen === 1 && unit === 'pcs' ? '1 pc' : `${chosen} ${unit}`,
    };
  }
  const count = Math.ceil(need / chosen);
  return {
    qty: roundQty(chosen * count),
    label: `${count} × ${chosen} ${unit}`,
  };
}

export function pantryAvailableMap(pantry = []) {
  const map = new Map();
  for (const item of pantry) {
    const key = ingredientKey(item.ingredient, item.unit);
    map.set(key, (map.get(key) || 0) + (item.quantity || 0));
  }
  return map;
}

function extraAvailableMap(list = []) {
  const map = new Map();
  for (const item of list || []) {
    const key = ingredientKey(item.name, item.unit);
    map.set(key, (map.get(key) || 0) + (item.quantity || 0));
  }
  return map;
}

export function collectPlanIngredients(plan, peopleCount = 1) {
  const map = new Map();
  const scale = Math.max(1, peopleCount || 1);
  for (const day of plan?.dayRows || []) {
    for (const planned of day.meals || []) {
      const meal = plannedMealView(planned);
      if (meal.outside) continue;
      for (const ingredient of meal.ingredients || []) {
        const key = ingredientKey(ingredient.name, ingredient.unit);
        const prev = map.get(key) || {
          name: ingredient.name,
          unit: ingredient.unit,
          category: ingredient.category || 'Other',
          requiredQty: 0,
          estimatedCost: 0,
          costPerUnit: ingredient.costPerUnit || (ingredient.quantity ? ingredient.estimatedCost / ingredient.quantity : 0),
        };
        prev.requiredQty += (ingredient.quantity || 0) * scale;
        prev.estimatedCost += (ingredient.estimatedCost || 0) * scale;
        prev.category = ingredient.category || prev.category;
        map.set(key, prev);
      }
    }
  }
  return [...map.values()].map((item) => ({
    ...item,
    requiredQty: roundQty(item.requiredQty),
    estimatedCost: roundQty(item.estimatedCost),
  }));
}

export function buildGroceryList({
  plan,
  pantry = [],
  extraAvailable = [],
  existing,
  peopleCount = 1,
} = {}) {
  const pantryMap = pantryAvailableMap(pantry);
  const extraMap = extraAvailableMap(extraAvailable);
  const collected = collectPlanIngredients(plan, peopleCount);
  const keptManual = (existing?.items || []).filter((item) => item.manual);

  const items = collected.map((row) => {
    const key = ingredientKey(row.name, row.unit);
    const availableQty = roundQty((pantryMap.get(key) || 0) + (extraMap.get(key) || 0));
    const need = Math.max(0, roundQty(row.requiredQty - availableQty));
    const pack = packFor(row.unit, need);
    const unitCost = row.costPerUnit || (row.requiredQty ? row.estimatedCost / row.requiredQty : 0);
    const suggestedQty = pack.qty;
    const previous = (existing?.items || []).find((item) => !item.manual && ingredientKey(item.name, item.unit) === key);
    return normalizeGroceryItem({
      id: previous?.id,
      name: row.name,
      category: GROCERY_CATEGORIES.includes(row.category) ? row.category : 'Other',
      unit: row.unit,
      requiredQty: row.requiredQty,
      availableQty,
      suggestedQty,
      packageLabel: need <= 0 ? 'Already in pantry' : pack.label,
      estimatedCost: roundQty(suggestedQty * unitCost),
      purchased: previous?.purchased || false,
    });
  }).filter((item) => item.name);

  const merged = [...items, ...keptManual];
  const estimatedTotal = roundQty(merged.reduce((sum, item) => sum + (item.purchased ? 0 : item.estimatedCost || 0), 0));
  return normalizeGroceryList({
    id: existing?.id,
    planId: plan?.id || existing?.planId || null,
    items: merged.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    estimatedTotal,
    updatedAt: nowIso(),
  });
}

export function groceryByCategory(list) {
  const groups = GROCERY_CATEGORIES.map((category) => ({
    category,
    items: (list?.items || []).filter((item) => item.category === category),
  }));
  return groups.filter((group) => group.items.length);
}

export function addManualGroceryItem(list, partial) {
  const item = normalizeGroceryItem({
    ...partial,
    id: createNutritionId(),
    manual: true,
    suggestedQty: partial.suggestedQty ?? partial.requiredQty ?? 0,
    requiredQty: partial.requiredQty ?? partial.suggestedQty ?? 0,
  });
  const items = [...(list?.items || []), item];
  return normalizeGroceryList({ ...list, items });
}

export function planIngredientCost(plan, peopleCount = 1) {
  return roundQty(collectPlanIngredients(plan, peopleCount).reduce((sum, item) => sum + (item.estimatedCost || 0), 0) || mealCost({ ingredients: [] }));
}
