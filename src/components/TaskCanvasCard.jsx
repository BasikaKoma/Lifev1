import { useState } from 'react';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { CategoryBadge, CategorySelect } from './CategorySelect';
import { PriorityBadge, PrioritySelect } from './PrioritySelect';

const STATUS_MAP = {
  Todo: { label: 'Todo', className: 'upcoming' },
  'In Progress': { label: 'Active', className: 'in-progress' },
  Done: { label: 'Done', className: 'completed' },
};

export function TaskCanvasCard({
  task,
  categoryOptions = [],
  onMove,
  onUpdate,
  onRemove,
  onConnectClick,
  onNodeSelect,
  connectFrom,
  connectModeActive = false,
  selectedNodeRef,
  readOnly = false,
  mapTheme,
  nodeLevel,
  side = 'free',
}) {
  const themeVars = resolveNodeThemeStyle(task, mapTheme, nodeLevel, 'task');
  const nodeRef = { type: 'task', id: task.id };
  const isConnectSource = connectFrom?.type === 'task' && connectFrom?.id === task.id;
  const isSelected = selectedNodeRef?.type === 'task' && selectedNodeRef?.id === task.id;
  const status = STATUS_MAP[task.status] || STATUS_MAP.Todo;
  const [editing, setEditing] = useState(false);

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly,
    onMove: onMove ? (x, y) => onMove(task.id, x, y) : null,
    getPosition: () => ({ x: task.canvasX, y: task.canvasY }),
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  return (
    <article
      className={`task-canvas-card canvas-node canvas-node--typed task-canvas-card--${status.className} ${canvasStyleClasses(task, mapTheme)} task-canvas-card--${side}${dragging ? ' task-canvas-card--dragging' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${readOnly ? ' task-canvas-card--readonly' : ''}`}
      style={{ left: task.canvasX, top: task.canvasY, ...themeVars }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => !readOnly && setEditing(true)}
    >
      <div className="task-canvas-card__head">
        <span className="task-canvas-card__type">Task</span>
        <div className="task-canvas-card__head-actions">
          <CategoryBadge category={task.category} />
          <PriorityBadge priority={task.priority} />
          {onUpdate && (
            <PrioritySelect
              compact
              value={task.priority}
              onChange={(priority) => onUpdate(task.id, { priority })}
            />
          )}
          <span className={`projects-badge projects-badge--outline projects-badge--${status.className}`}>
            {status.label}
          </span>
          {onRemove && (
            <button
              type="button"
              className="canvas-node__delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
              title="Remove task"
              aria-label="Remove task"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <input
            className="task-canvas-card__input input"
            value={task.title}
            autoFocus
            onChange={(e) => onUpdate?.(task.id, { title: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          {onUpdate && categoryOptions.length > 0 && (
            <CategorySelect
              value={task.category}
              options={categoryOptions}
              onChange={(category) => onUpdate(task.id, { category })}
              className="task-canvas-card__category"
            />
          )}
        </>
      ) : (
        <h3 className="task-canvas-card__title canvas-node__title">{task.title}</h3>
      )}

      {task.description && (
        <p className="task-canvas-card__desc canvas-node__body">{task.description}</p>
      )}

      {task.status !== 'Done' && onUpdate && (
        <button
          type="button"
          className="task-canvas-card__action btn btn--outline btn--sm"
          onClick={() => onUpdate(task.id, { status: 'Done' })}
        >
          Mark done
        </button>
      )}
    </article>
  );
}
