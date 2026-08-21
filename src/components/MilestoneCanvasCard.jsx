import { useEffect, useRef, useState } from 'react';
import { getCompletedCheckpointCount, isCheckpointDone, isStageDone } from '../utils/logic';
import { isPlanMode, getPlanDurationDays, formatPlanDateShort, formatPlanDayHeader } from '../utils/planMode';
import { canvasStyleClasses } from '../utils/canvasNodes';
import { resolveNodeThemeStyle } from '../utils/mapTheme';
import { useCanvasNodeCard } from '../hooks/useCanvasNodeCard';
import { CategoryBadge, CategorySelect } from './CategorySelect';
import { PrioritySelect } from './PrioritySelect';

const STATUS_MAP = {
  Done: { label: 'Done', className: 'completed' },
  Current: { label: 'Active', className: 'in-progress' },
  Locked: { label: 'Upcoming', className: 'upcoming' },
};

export function MilestoneCanvasCard({
  stage,
  onSelect,
  onUpdateStage,
  onAddCheckpoint,
  onOpenCheckpoint,
  onMove,
  onMoveEnd,
  onRemove,
  onRemoveFromCanvas,
  onConnectClick,
  onNodeSelect,
  connectFrom,
  connectModeActive = false,
  selectedNodeRef,
  readOnly = false,
  mapTheme,
  nodeLevel,
  side = 'left',
}) {
  const status = STATUS_MAP[stage.status] || STATUS_MAP.Locked;
  const done = isStageDone(stage);
  const completed = getCompletedCheckpointCount(stage);
  const totalCp = (stage.checkpoints || []).length;
  const themeVars = resolveNodeThemeStyle(stage, mapTheme, nodeLevel, 'milestoneMajor');
  const nodeRef = { type: 'milestone', id: stage.id };
  const isConnectSource = connectFrom?.type === 'milestone' && connectFrom?.id === stage.id;
  const isSelected = selectedNodeRef?.type === 'milestone' && selectedNodeRef?.id === stage.id;
  const posRef = useRef({ x: stage.posX, y: stage.posY });
  posRef.current = { x: stage.posX, y: stage.posY };
  const orderLabel = String(stage.order ?? 1).padStart(2, '0');
  const openCheckpoints = (stage.checkpoints || []).filter((cp) => !cp.archived);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage.title || '');
  const titleInputRef = useRef(null);

  useEffect(() => {
    setTitleDraft(stage.title || '');
  }, [stage.title]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const { dragging, handlePointerDown, handlePointerMove, handlePointerUp } = useCanvasNodeCard({
    readOnly: readOnly || editingTitle,
    onMove: onMove ? (x, y) => onMove(x, y) : null,
    onMoveEnd: onMoveEnd ? (x, y) => onMoveEnd(x, y) : null,
    getPosition: () => posRef.current,
    onConnectClick,
    onNodeSelect,
    nodeRef,
    connectModeActive,
  });

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== stage.title) {
      onUpdateStage?.(stage.id, { title: next });
    } else {
      setTitleDraft(stage.title || '');
    }
    setEditingTitle(false);
  };

  return (
    <article
      className={`milestone-canvas-card canvas-node canvas-node--typed milestone-canvas-card--major ${canvasStyleClasses(stage, mapTheme)} milestone-canvas-card--${status.className} milestone-canvas-card--${side}${!onMove ? ' milestone-canvas-card--fixed' : ''}${dragging ? ' milestone-canvas-card--dragging' : ''}${isConnectSource ? ' canvas-node--connect-source' : ''}${isSelected ? ' canvas-node--selected' : ''}${readOnly ? ' milestone-canvas-card--readonly' : ''}${done ? ' milestone-canvas-card--done' : ''}`}
      style={{ left: stage.posX, top: stage.posY, ...themeVars }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(e) => {
        if (e.target.closest('button, a, input, textarea, select')) return;
        onSelect?.(stage.id);
      }}
    >
      <div className="milestone-canvas-card__head">
        <span className="milestone-canvas-card__type">
          {done && <span className="milestone-canvas-card__done-mark" aria-hidden="true" />}
          Milestone
        </span>
        <div className="milestone-canvas-card__head-actions">
          <CategoryBadge category={stage.category} />
          {onUpdateStage && (
            <PrioritySelect
              compact
              value={stage.priority}
              onChange={(priority) => onUpdateStage(stage.id, { priority })}
            />
          )}
          <span className={`roadmap-badge roadmap-badge--outline roadmap-badge--${status.className}`}>
            {status.label}
          </span>
          {onRemove && (
            <button
              type="button"
              className="canvas-node__delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(stage.id);
              }}
              title="Remove milestone"
              aria-label="Remove milestone"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="milestone-canvas-card__body">
        <div className="milestone-canvas-card__title-row">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="input input--sm milestone-canvas-card__title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitle();
                }
                if (e.key === 'Escape') {
                  setTitleDraft(stage.title || '');
                  setEditingTitle(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Τίτλος milestone"
            />
          ) : (
            <h3
              className="milestone-canvas-card__title canvas-node__title"
              onDoubleClick={(e) => {
                if (readOnly || !onUpdateStage) return;
                e.stopPropagation();
                setEditingTitle(true);
              }}
              title={onUpdateStage ? 'Διπλό κλικ για επεξεργασία τίτλου' : undefined}
            >
              {stage.title}
            </h3>
          )}
          <span className="milestone-canvas-card__order" aria-hidden="true">{orderLabel}</span>
        </div>
        {stage.description && (
          <p className="milestone-canvas-card__desc canvas-node__body">{stage.description}</p>
        )}
        {isPlanMode(stage) && (
          <div className="milestone-canvas-card__plan">
            <span className="milestone-canvas-card__plan-badge">Πλάνο</span>
            <span className="milestone-canvas-card__plan-dates">
              {formatPlanDateShort(stage.planStartDate)} → {formatPlanDateShort(stage.planEndDate)}
            </span>
            <span className="milestone-canvas-card__plan-duration">{getPlanDurationDays(stage)} ημ.</span>
            {stage.planGoal && (
              <span className="milestone-canvas-card__plan-goal" title={stage.planGoal}>
                🎯 {stage.planGoal}
              </span>
            )}
            {openCheckpoints.length > 0 && (
              <ul className="milestone-canvas-card__checkpoint-list">
                {openCheckpoints.map((cp) => (
                  <li key={cp.id}>
                    <button
                      type="button"
                      className={`milestone-canvas-card__checkpoint-btn${isCheckpointDone(cp) ? ' milestone-canvas-card__checkpoint-btn--done' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCheckpoint?.(stage.id, cp.id);
                      }}
                      title={cp.planDate ? formatPlanDayHeader(stage, cp.planDate) : cp.title}
                    >
                      <span className="milestone-canvas-card__checkpoint-title">{cp.title}</span>
                      {cp.planDate && (
                        <span className="milestone-canvas-card__checkpoint-date">
                          {formatPlanDateShort(cp.planDate)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="milestone-canvas-card__footer">
        <span className="milestone-canvas-card__progress">
          {completed} / {totalCp}
        </span>
        <div className="milestone-canvas-card__footer-actions">
          {onAddCheckpoint && (
            <button
              type="button"
              className="milestone-canvas-card__add-cp"
              onClick={(e) => {
                e.stopPropagation();
                onAddCheckpoint(stage.id);
              }}
              title="Προσθήκη checkpoint"
            >
              + Checkpoint
            </button>
          )}
          <button
            type="button"
            className="milestone-canvas-card__open"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(stage.id);
            }}
          >
            Open →
          </button>
        </div>
      </div>
    </article>
  );
}
