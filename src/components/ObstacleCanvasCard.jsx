import { useState } from 'react';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { PriorityBadge, PrioritySelect } from './PrioritySelect';

const SEVERITY_CLASS = {
  Low: 'low',
  Medium: 'medium',
  Critical: 'critical',
};

export function ObstacleCanvasCard({
  obstacle,
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
  const themeVars = resolveNodeThemeStyle(obstacle, mapTheme, nodeLevel, 'obstacle');
  const nodeRef = { type: 'obstacle', id: obstacle.id };
  const isConnectSource = connectFrom?.type === 'obstacle' && connectFrom?.id === obstacle.id;
  const isSelected = selectedNodeRef?.type === 'obstacle' && selectedNodeRef?.id === obstacle.id;
  const [editing, setEditing] = useState(false);
  const severityClass = SEVERITY_CLASS[obstacle.severity] || 'medium';

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly,
    onMove: onMove ? (x, y) => onMove(obstacle.id, x, y) : null,
    getPosition: () => ({ x: obstacle.canvasX, y: obstacle.canvasY }),
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  return (
    <article
      className={`obstacle-canvas-card canvas-node canvas-node--typed obstacle-canvas-card--${severityClass} ${canvasStyleClasses(obstacle, mapTheme)} obstacle-canvas-card--${side}${dragging ? ' obstacle-canvas-card--dragging' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${readOnly ? ' obstacle-canvas-card--readonly' : ''}`}
      style={{ left: obstacle.canvasX, top: obstacle.canvasY, ...themeVars }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => !readOnly && setEditing(true)}
    >
      <div className="obstacle-canvas-card__head">
        <span className="obstacle-canvas-card__type">Obstacle</span>
        <div className="obstacle-canvas-card__head-actions">
          <PriorityBadge priority={obstacle.priority} />
          {onUpdate && (
            <PrioritySelect
              compact
              value={obstacle.priority}
              onChange={(priority) => onUpdate(obstacle.id, { priority })}
            />
          )}
          <span className={`roadmap-badge roadmap-badge--outline roadmap-badge--${severityClass}`}>
            {obstacle.severity || 'Medium'}
          </span>
          {onRemove && (
            <button
              type="button"
              className="canvas-node__delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(obstacle.id);
              }}
              title="Remove obstacle"
              aria-label="Remove obstacle"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <input
          className="obstacle-canvas-card__input input"
          value={obstacle.title}
          autoFocus
          onChange={(e) => onUpdate?.(obstacle.id, { title: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <h3 className="obstacle-canvas-card__title canvas-node__title">{obstacle.title}</h3>
      )}

      {obstacle.description && (
        <p className="obstacle-canvas-card__desc canvas-node__body">{obstacle.description}</p>
      )}

      {obstacle.status === 'Open' && onUpdate && (
        <button
          type="button"
          className="obstacle-canvas-card__action btn btn--outline btn--sm"
          onClick={() => onUpdate(obstacle.id, { status: 'Mitigated' })}
        >
          Mark mitigated
        </button>
      )}
    </article>
  );
}
