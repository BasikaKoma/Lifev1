import { useMemo, useState } from 'react';
import { MEAL_SLOTS, createNutritionId, normalizeMeal, nowIso } from '../../lib/nutrition/schema';
import { MacroPills, MealBody, NutritionModal } from './NutritionBits';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: 'Saved' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'recent', label: 'Recent' },
  { id: 'custom', label: 'Custom' },
];

function emptyCustom(mealType = 'lunch') {
  return normalizeMeal({
    id: createNutritionId(),
    name: '',
    mealType,
    calories: 400,
    protein: 30,
    carbs: 30,
    fat: 12,
    prepTimeMin: 20,
    servings: 1,
    instructions: '',
    tags: [],
    source: 'custom',
    ingredients: [{ id: createNutritionId(), name: '', quantity: 100, unit: 'g', category: 'Other', estimatedCost: 0 }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function NutritionMeals({ nutrition }) {
  const [filter, setFilter] = useState('all');
  const [slot, setSlot] = useState('');
  const [maxCalories, setMaxCalories] = useState('');
  const [minProtein, setMinProtein] = useState('');
  const [maxTime, setMaxTime] = useState('');
  const [tag, setTag] = useState('');
  const [recipe, setRecipe] = useState(null);
  const [editor, setEditor] = useState(null);

  const recent = new Set(nutrition.bundle?.recentMealIds || []);

  const meals = useMemo(() => {
    return (nutrition.meals || []).filter((meal) => {
      if (filter === 'favorites' && !meal.favorite) return false;
      if (filter === 'custom' && meal.source !== 'custom') return false;
      if (filter === 'saved' && meal.source === 'catalog' && !meal.favorite) return false;
      if (filter === 'recent' && !recent.has(meal.id)) return false;
      if (slot && meal.mealType !== slot) return false;
      if (maxCalories && meal.calories > Number(maxCalories)) return false;
      if (minProtein && meal.protein < Number(minProtein)) return false;
      if (maxTime && meal.prepTimeMin > Number(maxTime)) return false;
      if (tag && !(meal.tags || []).some((item) => item.toLowerCase().includes(tag.toLowerCase()))) return false;
      return true;
    });
  }, [filter, maxCalories, maxTime, minProtein, nutrition.meals, recent, slot, tag]);

  const saveEditor = () => {
    if (!editor?.name?.trim()) return;
    nutrition.upsertMeal(editor);
    setEditor(null);
  };

  return (
    <div>
      <div className="nutrition-card__head">
        <h2 className="nutrition-card__title">Meal library</h2>
        <button type="button" className="nutrition-btn nutrition-btn--green" onClick={() => setEditor(emptyCustom())}>
          Custom meal
        </button>
      </div>
      <div className="nutrition-library__filters">
        <div className="nutrition-chips">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nutrition-chip${filter === item.id ? ' nutrition-chip--on' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select className="input" value={slot} onChange={(event) => setSlot(event.target.value)}>
          <option value="">Meal type</option>
          {MEAL_SLOTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <input className="input" type="number" placeholder="Max kcal" value={maxCalories} onChange={(event) => setMaxCalories(event.target.value)} />
        <input className="input" type="number" placeholder="Min protein" value={minProtein} onChange={(event) => setMinProtein(event.target.value)} />
        <input className="input" type="number" placeholder="Max minutes" value={maxTime} onChange={(event) => setMaxTime(event.target.value)} />
        <input className="input" placeholder="Tag" value={tag} onChange={(event) => setTag(event.target.value)} />
      </div>
      <div className="nutrition-library__grid">
        {meals.map((meal) => (
          <article key={meal.id} className="nutrition-card">
            <div className="nutrition-card__head">
              <h3 className="nutrition-meal__name">{meal.name}</h3>
              <button type="button" className="nutrition-btn nutrition-btn--icon" aria-pressed={meal.favorite} onClick={() => nutrition.toggleFavorite(meal.id)} title="Favorite">★</button>
            </div>
            <p className="nutrition-day__meta">{meal.mealType} · {meal.source}{meal.tags?.length ? ` · ${meal.tags.join(', ')}` : ''}</p>
            <MacroPills calories={meal.calories} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} prepTimeMin={meal.prepTimeMin} />
            <div className="nutrition-meal__actions" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => setRecipe(meal)}>View recipe</button>
              {meal.source === 'custom' ? <button type="button" onClick={() => setEditor(meal)}>Edit</button> : null}
            </div>
          </article>
        ))}
      </div>
      {!meals.length ? <p className="nutrition-empty">No meals match these filters.</p> : null}

      {recipe ? (
        <NutritionModal title={recipe.name} onClose={() => setRecipe(null)}>
          <MealBody meal={recipe} />
        </NutritionModal>
      ) : null}

      {editor ? (
        <NutritionModal title={editor.name ? 'Edit meal' : 'Custom meal'} onClose={() => setEditor(null)}>
          <div className="nutrition-form">
            <label className="nutrition-field nutrition-field--wide">
              <span>Name</span>
              <input className="input" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            </label>
            <label className="nutrition-field">
              <span>Type</span>
              <select className="input" value={editor.mealType} onChange={(event) => setEditor({ ...editor, mealType: event.target.value })}>
                {MEAL_SLOTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="nutrition-field">
              <span>Servings</span>
              <input className="input" type="number" min="1" value={editor.servings} onChange={(event) => setEditor({ ...editor, servings: Number(event.target.value) })} />
            </label>
            <label className="nutrition-field"><span>Calories</span><input className="input" type="number" value={editor.calories} onChange={(event) => setEditor({ ...editor, calories: Number(event.target.value) })} /></label>
            <label className="nutrition-field"><span>Protein</span><input className="input" type="number" value={editor.protein} onChange={(event) => setEditor({ ...editor, protein: Number(event.target.value) })} /></label>
            <label className="nutrition-field"><span>Carbs</span><input className="input" type="number" value={editor.carbs} onChange={(event) => setEditor({ ...editor, carbs: Number(event.target.value) })} /></label>
            <label className="nutrition-field"><span>Fat</span><input className="input" type="number" value={editor.fat} onChange={(event) => setEditor({ ...editor, fat: Number(event.target.value) })} /></label>
            <label className="nutrition-field"><span>Prep (min)</span><input className="input" type="number" value={editor.prepTimeMin} onChange={(event) => setEditor({ ...editor, prepTimeMin: Number(event.target.value) })} /></label>
            <label className="nutrition-field nutrition-field--wide">
              <span>Tags</span>
              <input className="input" value={(editor.tags || []).join(', ')} onChange={(event) => setEditor({ ...editor, tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
            </label>
            <label className="nutrition-field nutrition-field--wide">
              <span>Instructions</span>
              <textarea className="input textarea" rows={4} value={editor.instructions} onChange={(event) => setEditor({ ...editor, instructions: event.target.value })} />
            </label>
          </div>
          <h3 className="nutrition-card__title" style={{ margin: '16px 0 8px' }}>Ingredients</h3>
          {(editor.ingredients || []).map((item, index) => (
            <div key={item.id || index} className="nutrition-ingredient-row">
              <input className="input" placeholder="Ingredient" value={item.name} onChange={(event) => {
                const ingredients = editor.ingredients.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row);
                setEditor({ ...editor, ingredients });
              }} />
              <input className="input" type="number" value={item.quantity} onChange={(event) => {
                const ingredients = editor.ingredients.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row);
                setEditor({ ...editor, ingredients });
              }} />
              <input className="input" value={item.unit} onChange={(event) => {
                const ingredients = editor.ingredients.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value } : row);
                setEditor({ ...editor, ingredients });
              }} />
              <input className="input" type="number" placeholder="€" value={item.estimatedCost} onChange={(event) => {
                const ingredients = editor.ingredients.map((row, rowIndex) => rowIndex === index ? { ...row, estimatedCost: Number(event.target.value) } : row);
                setEditor({ ...editor, ingredients });
              }} />
              <button type="button" className="nutrition-btn nutrition-btn--icon" onClick={() => setEditor({ ...editor, ingredients: editor.ingredients.filter((_, rowIndex) => rowIndex !== index) })}>×</button>
            </div>
          ))}
          <button
            type="button"
            className="nutrition-btn nutrition-btn--ghost"
            onClick={() => setEditor({
              ...editor,
              ingredients: [...editor.ingredients, { id: createNutritionId(), name: '', quantity: 0, unit: 'g', category: 'Other', estimatedCost: 0 }],
            })}
          >
            Add ingredient
          </button>
          <div className="nutrition-view__actions" style={{ marginTop: 16 }}>
            <button type="button" className="nutrition-btn nutrition-btn--green" onClick={saveEditor}>Save meal</button>
          </div>
        </NutritionModal>
      ) : null}
    </div>
  );
}
