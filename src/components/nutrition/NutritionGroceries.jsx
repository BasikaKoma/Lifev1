import { useState } from 'react';
import { GROCERY_CATEGORIES, createNutritionId, nowIso } from '../../lib/nutrition/schema';
import { groceryByCategory } from '../../lib/nutrition/groceries';
import { NutritionModal } from './NutritionBits';

export function NutritionGroceries({ nutrition }) {
  const list = nutrition.groceryList;
  const groups = groceryByCategory(list);
  const [addOpen, setAddOpen] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', suggestedQty: 1, unit: 'pcs', category: 'Other', estimatedCost: 0 });
  const [pantryDraft, setPantryDraft] = useState({ ingredient: '', quantity: 0, unit: 'g', expiresOn: '' });

  return (
    <div className="nutrition-grocery-layout">
      <article className="nutrition-card">
        <div className="nutrition-card__head">
          <h2 className="nutrition-card__title">Supermarket list</h2>
          <button type="button" className="nutrition-btn nutrition-btn--outline" onClick={() => setAddOpen(true)}>Add item</button>
        </div>
        {!nutrition.plan ? (
          <p className="nutrition-empty">Generate a plan first. The grocery list is built from the active meal plan, minus pantry stock.</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.category} className="nutrition-grocery-group">
            <h3>{group.category}</h3>
            {group.items.map((item) => (
              <div key={item.id} className={`nutrition-grocery-row${item.purchased ? ' nutrition-grocery-row--bought' : ''}`}>
                <input
                  type="checkbox"
                  checked={item.purchased}
                  onChange={(event) => nutrition.patchGroceryItem(item.id, { purchased: event.target.checked })}
                  aria-label={`Purchased ${item.name}`}
                />
                <div>
                  <div className="nutrition-grocery-row__name">{item.name}</div>
                  <div className="nutrition-day__meta">
                    Need {item.requiredQty} {item.unit} · Have {item.availableQty} {item.unit} · Buy {item.suggestedQty} {item.unit}
                    {item.packageLabel ? ` · ${item.packageLabel}` : ''}
                    {item.manual ? ' · manual' : ''}
                  </div>
                </div>
                <span className="nutrition-qty">Need {item.requiredQty} {item.unit}</span>
                <span className="nutrition-qty">Have {item.availableQty} {item.unit}</span>
                <input
                  className="input input--sm"
                  type="number"
                  aria-label={`Buy quantity for ${item.name}`}
                  value={item.suggestedQty}
                  onChange={(event) => nutrition.patchGroceryItem(item.id, { suggestedQty: Number(event.target.value) })}
                />
                <span className="nutrition-cost">€{(item.estimatedCost || 0).toFixed(2)}</span>
                <button type="button" className="nutrition-btn nutrition-btn--icon" onClick={() => nutrition.deleteGroceryItem(item.id)} aria-label={`Delete ${item.name}`}>×</button>
              </div>
            ))}
          </section>
        ))}
        {list ? (
          <div className="nutrition-stat">
            <span>Estimated shopping cost</span>
            <strong>€{(list.estimatedTotal || 0).toFixed(2)}</strong>
          </div>
        ) : null}
      </article>

      <aside>
        <article className="nutrition-card">
          <div className="nutrition-card__head">
            <h2 className="nutrition-card__title">Pantry</h2>
            <button type="button" className="nutrition-btn nutrition-btn--ghost" onClick={() => setPantryOpen(true)}>Add</button>
          </div>
          {(nutrition.pantry || []).length ? nutrition.pantry.map((item) => (
            <div key={item.id} className="nutrition-pantry-row">
              <strong>{item.ingredient}</strong>
              <span>{item.quantity} {item.unit}</span>
              <span className="nutrition-day__meta">{item.expiresOn || '—'}</span>
              {item.lowStock ? <span className="nutrition-low">Low stock</span> : <span />}
              <button type="button" className="nutrition-btn nutrition-btn--icon" onClick={() => nutrition.deletePantryItem(item.id)}>×</button>
            </div>
          )) : <p className="nutrition-empty">No pantry items yet. Add what you already have so groceries skip it.</p>}
        </article>
      </aside>

      {addOpen ? (
        <NutritionModal title="Add grocery item" onClose={() => setAddOpen(false)}>
          <div className="nutrition-form">
            <label className="nutrition-field nutrition-field--wide">
              <span>Item</span>
              <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="nutrition-field">
              <span>Buy quantity</span>
              <input className="input" type="number" value={draft.suggestedQty} onChange={(event) => setDraft({ ...draft, suggestedQty: Number(event.target.value) })} />
            </label>
            <label className="nutrition-field">
              <span>Unit</span>
              <input className="input" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
            </label>
            <label className="nutrition-field">
              <span>Category</span>
              <select className="input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {GROCERY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="nutrition-field">
              <span>Estimated cost (€)</span>
              <input className="input" type="number" value={draft.estimatedCost} onChange={(event) => setDraft({ ...draft, estimatedCost: Number(event.target.value) })} />
            </label>
          </div>
          <div className="nutrition-view__actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="nutrition-btn nutrition-btn--green"
              onClick={() => {
                if (!draft.name.trim()) return;
                nutrition.addGroceryItem(draft);
                setAddOpen(false);
                setDraft({ name: '', suggestedQty: 1, unit: 'pcs', category: 'Other', estimatedCost: 0 });
              }}
            >
              Add
            </button>
          </div>
        </NutritionModal>
      ) : null}

      {pantryOpen ? (
        <NutritionModal title="Add pantry item" onClose={() => setPantryOpen(false)}>
          <div className="nutrition-form">
            <label className="nutrition-field nutrition-field--wide">
              <span>Ingredient</span>
              <input className="input" value={pantryDraft.ingredient} onChange={(event) => setPantryDraft({ ...pantryDraft, ingredient: event.target.value })} />
            </label>
            <label className="nutrition-field">
              <span>Quantity</span>
              <input className="input" type="number" value={pantryDraft.quantity} onChange={(event) => setPantryDraft({ ...pantryDraft, quantity: Number(event.target.value) })} />
            </label>
            <label className="nutrition-field">
              <span>Unit</span>
              <input className="input" value={pantryDraft.unit} onChange={(event) => setPantryDraft({ ...pantryDraft, unit: event.target.value })} />
            </label>
            <label className="nutrition-field">
              <span>Expiration (optional)</span>
              <input className="input" type="date" value={pantryDraft.expiresOn} onChange={(event) => setPantryDraft({ ...pantryDraft, expiresOn: event.target.value })} />
            </label>
          </div>
          <div className="nutrition-view__actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="nutrition-btn nutrition-btn--green"
              onClick={() => {
                if (!pantryDraft.ingredient.trim()) return;
                nutrition.savePantryItem({
                  id: createNutritionId(),
                  ...pantryDraft,
                  updatedAt: nowIso(),
                });
                setPantryOpen(false);
                setPantryDraft({ ingredient: '', quantity: 0, unit: 'g', expiresOn: '' });
              }}
            >
              Save
            </button>
          </div>
        </NutritionModal>
      ) : null}
    </div>
  );
}
