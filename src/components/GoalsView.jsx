import { useState } from 'react';

const STATUS_OPTIONS = ['Locked', 'Current', 'Done'];

function GoalCard({ goal, canDelete, isFirst, isLast, onUpdate, onDelete, onMove }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [targetDate, setTargetDate] = useState(goal.targetDate || '');
  const [status, setStatus] = useState(goal.status);

  const statusClass =
    goal.status === 'Done' ? 'completed' : goal.status === 'Current' ? 'in-progress' : 'upcoming';

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdate(goal.id, {
      title: title.trim(),
      description,
      targetDate: targetDate || null,
      status,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${goal.title}"?`)) onDelete(goal.id);
  };

  if (editing) {
    return (
      <div className="card goal-card goal-card--editing">
        <label className="settings-label">Goal title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          autoFocus
        />
        <label className="settings-label">Description</label>
        <textarea
          className="input textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why does this matter? What does success look like?"
        />
        <label className="settings-label">Target date (optional)</label>
        <input
          type="date"
          className="input"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <label className="settings-label">Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <div className="goal-card__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={handleSave}>Save</button>
          <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card goal-card goal-card--${statusClass}`}>
      <div className="goal-card__header">
        <div className="goal-card__order">Goal {goal.order}</div>
        <span className={`roadmap-badge roadmap-badge--${statusClass}`}>
          {goal.status === 'Done' ? 'Completed' : goal.status === 'Current' ? 'In Progress' : 'Upcoming'}
        </span>
      </div>
      <h4 className="goal-card__title">{goal.title}</h4>
      {goal.description && <p className="goal-card__desc">{goal.description}</p>}
      {goal.targetDate && (
        <p className="goal-card__date">Target: {new Date(goal.targetDate).toLocaleDateString()}</p>
      )}
      <div className="goal-card__actions goal-card__actions--row">
        <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn btn--text btn--sm btn--danger-text" onClick={handleDelete}>
          Delete
        </button>
      </div>
      <div className="goal-card__reorder">
        <button type="button" className="btn btn--outline btn--sm" disabled={isFirst} onClick={() => onMove(goal.id, 'up')}>
          ↑ Higher
        </button>
        <button type="button" className="btn btn--outline btn--sm" disabled={isLast} onClick={() => onMove(goal.id, 'down')}>
          ↓ Lower
        </button>
      </div>
    </div>
  );
}

export function GoalsView({ goals, onAdd, onUpdate, onRemove, onMove }) {
  const sorted = [...goals].sort((a, b) => b.order - a.order);

  return (
    <section className="section view-section">
      <div className="goals-header">
        <div>
          <h2 className="view-section__title">Goals</h2>
          <p className="view-section__desc">
            Strategic goals for your business — separate from the roadmap milestones.
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}>
          + Add Goal
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          No goals yet. Add what you want to achieve — these stay here and do not appear on the roadmap.
        </div>
      ) : (
        <div className="goals-list">
          {sorted.map((goal, index) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              canDelete={sorted.length > 1}
              isFirst={index === 0}
              isLast={index === sorted.length - 1}
              onUpdate={onUpdate}
              onDelete={onRemove}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
