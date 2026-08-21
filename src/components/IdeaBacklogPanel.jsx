import { useState } from 'react';

export function IdeaBacklogPanel({ items, onAddIdea, onDragStart, collapsed, onToggleCollapse }) {
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddIdea({ title: title.trim() });
    setTitle('');
    setAdding(false);
  };

  if (collapsed) {
    return (
      <aside className="idea-backlog idea-backlog--collapsed">
        <button type="button" className="idea-backlog__toggle" onClick={onToggleCollapse} title="Show ideas">
          💡 {items.length}
        </button>
      </aside>
    );
  }

  return (
    <aside className="idea-backlog">
      <div className="idea-backlog__header">
        <div>
          <h3 className="idea-backlog__title">Ideas</h3>
          <p className="idea-backlog__subtitle">Drag onto the board</p>
        </div>
        <button type="button" className="btn btn--text btn--sm" onClick={onToggleCollapse} aria-label="Collapse">
          ‹
        </button>
      </div>

      {!adding ? (
        <button type="button" className="btn btn--outline btn--sm idea-backlog__add" onClick={() => setAdding(true)}>
          + New idea
        </button>
      ) : (
        <form className="idea-backlog__form" onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Idea title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="idea-backlog__form-actions">
            <button type="submit" className="btn btn--primary btn--sm">Add</button>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      <ul className="idea-backlog__list">
        {items.length === 0 && (
          <li className="idea-backlog__empty">No ideas yet — add one and drag it to the board</li>
        )}
        {items.map((item) => (
          <li key={`${item.source}-${item.stageId || 'b'}-${item.id}`}>
            <div
              className="idea-backlog-item"
              onPointerDown={(e) => onDragStart?.(e, item)}
            >
              <span className="idea-backlog-item__icon">💡</span>
              <div className="idea-backlog-item__body">
                <span className="idea-backlog-item__title">{item.title}</span>
                {item.stageTitle && (
                  <span className="idea-backlog-item__stage">{item.stageTitle}</span>
                )}
              </div>
              <span className="idea-backlog-item__handle" aria-hidden="true">⠿</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
