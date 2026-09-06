import { useState } from 'react';
import { CategorySelect } from './CategorySelect';

export function AddMilestoneForm({ onAdd, onCancel, categoryOptions }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      category: category || '',
    });
  };

  return (
    <form className="card add-milestone-form" onSubmit={handleSubmit}>
      <h3 className="add-milestone-form__title">New milestone</h3>

      <label className="settings-label" htmlFor="milestone-title">Title</label>
      <input
        id="milestone-title"
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Foundation"
        autoFocus
      />

      <label className="settings-label" htmlFor="milestone-desc">Description (optional)</label>
      <textarea
        id="milestone-desc"
        className="input textarea"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What does completing this phase mean?"
      />

      <label className="settings-label" htmlFor="milestone-category">Category</label>
      <CategorySelect
        id="milestone-category"
        value={category}
        onChange={setCategory}
        options={categoryOptions}
      />

      <div className="add-milestone-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">
          Add to projects
        </button>
        <button type="button" className="btn btn--text btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
