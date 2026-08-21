import { useState } from 'react';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { PriorityBadge, PrioritySelect } from './PrioritySelect';

export function ResourceCanvasCard({
  resource,
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
  const themeVars = resolveNodeThemeStyle(resource, mapTheme, nodeLevel, 'resource');
  const nodeRef = { type: 'resource', id: resource.id };
  const isConnectSource = connectFrom?.type === 'resource' && connectFrom?.id === resource.id;
  const isSelected = selectedNodeRef?.type === 'resource' && selectedNodeRef?.id === resource.id;
  const [editing, setEditing] = useState(false);

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly,
    onMove: onMove ? (x, y) => onMove(resource.id, x, y) : null,
    getPosition: () => ({ x: resource.canvasX, y: resource.canvasY }),
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  return (
    <article
      className={`resource-canvas-card canvas-node canvas-node--typed ${canvasStyleClasses(resource, mapTheme)} resource-canvas-card--${side}${dragging ? ' resource-canvas-card--dragging' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${readOnly ? ' resource-canvas-card--readonly' : ''}`}
      style={{ left: resource.canvasX, top: resource.canvasY, ...themeVars }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => !readOnly && setEditing(true)}
    >
      <div className="resource-canvas-card__head">
        <span className="resource-canvas-card__type">Resource</span>
        <div className="resource-canvas-card__head-actions">
          <PriorityBadge priority={resource.priority} />
          {onUpdate && (
            <PrioritySelect
              compact
              value={resource.priority}
              onChange={(priority) => onUpdate(resource.id, { priority })}
            />
          )}
          <span className="badge badge--resource-type">{resource.resourceType || 'Tools'}</span>
          {onRemove && (
            <button
              type="button"
              className="canvas-node__delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(resource.id);
              }}
              title="Remove resource"
              aria-label="Remove resource"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <input
          className="resource-canvas-card__input input"
          value={resource.title}
          autoFocus
          onChange={(e) => onUpdate?.(resource.id, { title: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <h3 className="resource-canvas-card__title canvas-node__title">{resource.title}</h3>
      )}

      {resource.description && (
        <p className="resource-canvas-card__desc canvas-node__body">{resource.description}</p>
      )}

      {resource.status !== 'Secured' && onUpdate && (
        <button
          type="button"
          className="resource-canvas-card__action btn btn--outline btn--sm"
          onClick={() => onUpdate(resource.id, { status: 'Secured' })}
        >
          Mark secured
        </button>
      )}
    </article>
  );
}
