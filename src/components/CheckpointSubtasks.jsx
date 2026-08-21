import { useState } from 'react';
import { generateId } from '../data/templates';

function SubtaskProgress({ done, total, className = '', showWhenEmpty = false }) {
  if (total === 0 && !showWhenEmpty) return null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`checkpoint-subtasks__progress ${className}`.trim()}>
      <div className="checkpoint-subtasks__progress-meta">
        <span className="checkpoint-subtasks__progress-label">Tasks</span>
        <span className="checkpoint-subtasks__progress-count">
          {total === 0 ? '—' : `${done}/${total}`}
        </span>
      </div>
      {total > 0 && (
        <div className="checkpoint-subtasks__progress-track" aria-hidden="true">
          <div
            className="checkpoint-subtasks__progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function CheckpointSubtasks({
  items = [],
  onChange,
  variant = 'panel',
  readOnly = false,
  placeholder = 'π.χ. Φτιάξε login',
  maxVisible,
}) {
  const [newText, setNewText] = useState('');
  const done = items.filter((item) => item.checked).length;
  const total = items.length;
  const canEdit = !readOnly && typeof onChange === 'function';
  const visibleItems =
    typeof maxVisible === 'number' && maxVisible > 0
      ? items.slice(0, maxVisible)
      : items;
  const hiddenCount =
    typeof maxVisible === 'number' && maxVisible > 0
      ? Math.max(0, items.length - maxVisible)
      : 0;

  const patchItems = (next) => onChange?.(next);

  const toggleItem = (itemId) => {
    patchItems(
      items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const removeItem = (itemId) => {
    patchItems(items.filter((item) => item.id !== itemId));
  };

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    patchItems([...items, { id: generateId(), text, checked: false }]);
    setNewText('');
  };

  const isCompact = variant === 'card' || variant === 'compact';
  const showAdd = canEdit && variant !== 'compact';

  if (isCompact && total === 0 && !showAdd) return null;

  return (
    <div className={`checkpoint-subtasks checkpoint-subtasks--${variant}`}>
      {(total > 0 || variant === 'panel') && (
        <SubtaskProgress
          done={done}
          total={total}
          showWhenEmpty={variant === 'panel'}
          className={total === 0 ? 'checkpoint-subtasks__progress--empty' : ''}
        />
      )}

      {total > 0 && (
        <ul className="checkpoint-subtasks__list">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className={`checkpoint-subtasks__item${item.checked ? ' checkpoint-subtasks__item--done' : ''}`}
            >
              <label className="checkpoint-subtasks__check">
                <input
                  type="checkbox"
                  checked={Boolean(item.checked)}
                  onChange={() => canEdit && toggleItem(item.id)}
                  disabled={!canEdit}
                />
                <span className="checkpoint-subtasks__box" aria-hidden="true" />
                <span className="checkpoint-subtasks__text">{item.text}</span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  className="checkpoint-subtasks__remove"
                  onClick={() => removeItem(item.id)}
                  aria-label="Αφαίρεση task"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="checkpoint-subtasks__more">+{hiddenCount} ακόμα</p>
      )}

      {showAdd && (
        <div className="checkpoint-subtasks__add">
          <input
            type="text"
            className="input input--sm checkpoint-subtasks__add-input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={placeholder}
          />
          <button type="button" className="btn btn--outline btn--sm" onClick={addItem}>
            + Task
          </button>
        </div>
      )}

      {isCompact && total === 0 && canEdit && (
        <div className="checkpoint-subtasks__add checkpoint-subtasks__add--solo">
          <input
            type="text"
            className="input input--sm checkpoint-subtasks__add-input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={placeholder}
          />
          <button type="button" className="btn btn--outline btn--sm" onClick={addItem}>
            + Task
          </button>
        </div>
      )}
    </div>
  );
}
