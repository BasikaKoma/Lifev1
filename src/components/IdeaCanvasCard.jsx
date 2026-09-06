import { useRef } from 'react';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { CategoryBadge } from './CategorySelect';
import { PriorityBadge, PrioritySelect } from './PrioritySelect';

const STATUS_MAP = {
  Locked: { label: 'Locked', className: 'upcoming' },
  Ready: { label: 'Ready', className: 'in-progress' },
  Executed: { label: 'Done', className: 'completed' },
};

export function IdeaCanvasCard({
  idea,
  source,
  stageId,
  stageTitle,
  onMove,
  onRemove,
  onRemoveFromCanvas,
  onSelect,
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
  const status = STATUS_MAP[idea.status] || STATUS_MAP.Locked;
  const themeVars = resolveNodeThemeStyle(idea, mapTheme, nodeLevel, 'idea');
  const nodeRef = { type: 'idea', id: idea.id, source, stageId: stageId || undefined };
  const isConnectSource =
    connectFrom?.type === 'idea' &&
    connectFrom?.id === idea.id &&
    (connectFrom?.source || 'backlog') === (source || 'backlog') &&
    (connectFrom?.stageId || '') === (stageId || '');
  const isSelected =
    selectedNodeRef?.type === 'idea' &&
    selectedNodeRef?.id === idea.id &&
    (selectedNodeRef?.source || 'backlog') === (source || 'backlog') &&
    (selectedNodeRef?.stageId || '') === (stageId || '');
  const posRef = useRef({ x: idea.canvasX, y: idea.canvasY });
  posRef.current = { x: idea.canvasX, y: idea.canvasY };

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly,
    onMove: onMove
      ? (x, y) => onMove(source, stageId, idea.id, x, y)
      : null,
    getPosition: () => posRef.current,
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  return (
    <article
      className={`idea-canvas-card canvas-node canvas-node--typed ${canvasStyleClasses(idea, mapTheme)} idea-canvas-card--${idea.status?.toLowerCase() || 'locked'} idea-canvas-card--${side}${dragging ? ' idea-canvas-card--dragging' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${readOnly ? ' idea-canvas-card--readonly' : ''}`}
      style={{ left: idea.canvasX, top: idea.canvasY, ...themeVars }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="idea-canvas-card__head">
        <span className="idea-canvas-card__type">Idea</span>
        <div className="idea-canvas-card__head-actions">
          <CategoryBadge category={idea.category} />
          <PriorityBadge priority={idea.priority} />
          <span className={`projects-badge projects-badge--outline projects-badge--${status.className}`}>
            {status.label}
          </span>
          {onRemove && (
            <button
              type="button"
              className="canvas-node__delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(source, stageId, idea.id);
              }}
              title="Remove idea"
              aria-label="Remove idea"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <h4 className="idea-canvas-card__title canvas-node__title">{idea.title || 'New idea'}</h4>
      {idea.description && (
        <p className="idea-canvas-card__desc canvas-node__body">{idea.description}</p>
      )}
      {stageTitle && <span className="idea-canvas-card__stage">{stageTitle}</span>}

      {(idea.impact || idea.timing) && (
        <div className="idea-canvas-card__meta">
          {idea.impact && <span>{idea.impact}</span>}
          {idea.timing && <span>{idea.timing}</span>}
        </div>
      )}

      {onSelect && source === 'stage' && stageId && (
        <button type="button" className="idea-canvas-card__open" onClick={() => onSelect(stageId)}>
          Open →
        </button>
      )}
    </article>
  );
}
