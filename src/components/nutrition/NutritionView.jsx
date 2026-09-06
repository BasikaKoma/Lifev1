import { useState } from 'react';
import { useNutrition } from '../../hooks/useNutrition';
import { NUTRITION_DISCLAIMER, NUTRITION_TABS } from '../../lib/nutrition/schema';
import { NutritionGroceries } from './NutritionGroceries';
import { NutritionMeals } from './NutritionMeals';
import { NutritionPlan } from './NutritionPlan';
import { NutritionProfile } from './NutritionProfile';
import './nutrition.css';

export function NutritionView() {
  const nutrition = useNutrition();
  const [tab, setTab] = useState('plan');

  if (nutrition.loading) {
    return (
      <section className="nutrition-view">
        <p className="nutrition-empty">Loading Nutrition…</p>
      </section>
    );
  }

  return (
    <section className="nutrition-view">
      <header className="nutrition-view__header">
        <div>
          <h1 className="nutrition-view__title">Nutrition</h1>
          <p className="nutrition-view__lede">
            Turn your dietary instructions into a 7 or 14 day meal plan, then a supermarket list.
          </p>
        </div>
      </header>

      <nav className="nutrition-tabs" aria-label="Nutrition">
        {NUTRITION_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {nutrition.error ? <p className="nutrition-error">{nutrition.error}</p> : null}
      {nutrition.saving ? <p className="nutrition-disclaimer">Saving…</p> : null}

      {tab === 'plan' ? <NutritionPlan nutrition={nutrition} onOpenGroceries={() => setTab('groceries')} /> : null}
      {tab === 'meals' ? <NutritionMeals nutrition={nutrition} /> : null}
      {tab === 'groceries' ? <NutritionGroceries nutrition={nutrition} /> : null}
      {tab === 'profile' ? <NutritionProfile nutrition={nutrition} /> : null}

      <p className="nutrition-disclaimer">{NUTRITION_DISCLAIMER}</p>
    </section>
  );
}
