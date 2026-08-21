import { useEffect, useRef, useState } from 'react';
import { isCheckpointDone, getStageProgress, getCompletedCheckpointCount, getStageHealth } from '../utils/logic';
import { AddMilestoneForm } from './AddMilestoneForm';

const STAGE_ICONS = {
  validation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  stability: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  growth: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  partnerships: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  scale: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const STATUS_MAP = {
  Done: { label: 'Completed', className: 'completed' },
  Current: { label: 'In Progress', className: 'in-progress' },
  Locked: { label: 'Upcoming', className: 'upcoming' },
};

function ProgressRing({ progress, size = 56 }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="progress-ring__bg" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="progress-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="progress-ring__text">{progress}%</span>
    </div>
  );
}

function MilestoneRow({
  stage,
  onSelectStage,
  isFirst,
  draggable,
  onDragHandleDown,
  isDragTarget,
  isDragging,
}) {
  const progress = getStageProgress(stage);
  const completed = getCompletedCheckpointCount(stage);
  const totalCp = (stage.checkpoints || []).length;
  const health = getStageHealth(stage);
  const status = STATUS_MAP[stage.status] || STATUS_MAP.Locked;
  const icon = STAGE_ICONS[stage.id] || DEFAULT_ICON;
  const checkpoints = (stage.checkpoints || []).slice(0, 5);

  return (
    <div
      className={`roadmap-row roadmap-row--${status.className} roadmap-row--major${isDragTarget ? ' roadmap-row--drop-target' : ''}${isDragging ? ' roadmap-row--dragging' : ''}`}
    >
      {draggable && (
        <button
          type="button"
          className="roadmap-row__drag-handle"
          aria-label="Drag to reorder"
          onPointerDown={(e) => onDragHandleDown?.(e, stage.id)}
        >
          ⠿
        </button>
      )}

      <div className="roadmap-row__left">
        <span className="roadmap-row__phase">Milestone</span>
        <h3 className="roadmap-row__title">{stage.title}</h3>
        <p className="roadmap-row__desc">{stage.description}</p>
        <div className="roadmap-row__meta">
          <span className="roadmap-row__count">
            {completed}/{totalCp} checkpoints
          </span>
          <span className={`roadmap-badge roadmap-badge--${status.className}`}>{status.label}</span>
        </div>
      </div>

      <div className="roadmap-row__center">
        {!isFirst && <div className="roadmap-row__line" aria-hidden="true" />}
        <button
          type="button"
          className={`roadmap-node roadmap-node--${status.className} roadmap-node--major`}
          onClick={() => onSelectStage(stage.id)}
          aria-label={`Open ${stage.title} details`}
        >
          <span className="roadmap-node__number">{stage.order}</span>
          <span className="roadmap-node__icon">{icon}</span>
        </button>
      </div>

      <div className="roadmap-row__right">
        <div className="roadmap-card roadmap-card--major">
          <div className="roadmap-card__header">
            <ProgressRing progress={progress} size={72} />
            <div className="roadmap-card__header-text">
              <span className="roadmap-card__percent">{progress}% Complete</span>
              <span className={`roadmap-card__health roadmap-card__health--${health.toLowerCase().replace(' ', '-')}`}>
                {health}
              </span>
            </div>
          </div>

          {checkpoints.length > 0 ? (
            <ul className="roadmap-card__checklist">
              {checkpoints.map((cp) => (
                <li
                  key={cp.id}
                  className={`roadmap-card__check-item ${isCheckpointDone(cp) ? 'roadmap-card__check-item--done' : ''}`}
                >
                  <span className="roadmap-card__check-icon">
                    {isCheckpointDone(cp) ? (
                      <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.485 3.929a1 1 0 0 1 0 1.414l-6.5 6.5a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L6.5 9.672l5.793-5.793a1 1 0 0 1 1.414 0z" />
                      </svg>
                    ) : (
                      <span className="roadmap-card__dot" />
                    )}
                  </span>
                  <span>{cp.title}</span>
                </li>
              ))}
              {(stage.checkpoints || []).length > 5 && (
                <li className="roadmap-card__more">+{(stage.checkpoints || []).length - 5} more</li>
              )}
            </ul>
          ) : (
            <p className="roadmap-card__empty">No checkpoints yet</p>
          )}

          {(stage.ideas || []).length > 0 && (
            <p className="roadmap-card__ideas">{stage.ideas.length} parked idea(s)</p>
          )}

          <button type="button" className="roadmap-card__details" onClick={() => onSelectStage(stage.id)}>
            View details
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>
        <div className="roadmap-row__connector" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BusinessPath({
  stages,
  onSelectStage,
  onAddMilestone,
  onReorderStage,
  embedded = false,
  projectTitle,
  isActive = false,
  disableAutoScroll = false,
}) {
  const startRef = useRef(null);
  const timelineRef = useRef(null);
  const rowRefs = useRef(new Map());
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  const sorted = [...stages].sort((a, b) => b.order - a.order);
  const canDrag = !embedded && Boolean(onReorderStage);

  const handleAdd = (options) => {
    onAddMilestone?.(options);
    setShowAddForm(false);
  };

  useEffect(() => {
    if (disableAutoScroll) return;
    startRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [disableAutoScroll, stages.length]);

  const findDropTarget = (clientY) => {
    let closestId = null;
    let closestDist = Infinity;

    for (const stage of sorted) {
      const el = rowRefs.current.get(stage.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = stage.id;
      }
    }

    return closestId;
  };

  const handleDragHandleDown = (e, stageId) => {
    if (!canDrag) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(stageId);
    setDropTargetId(stageId);

    const onMove = (ev) => {
      setDropTargetId(findDropTarget(ev.clientY));
    };

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const targetId = findDropTarget(ev.clientY);
      if (targetId && targetId !== stageId) {
        onReorderStage(stageId, targetId);
      }
      setDraggingId(null);
      setDropTargetId(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <section className={`roadmap ${embedded ? 'roadmap--embedded' : ''} ${isActive ? 'roadmap--active' : ''}`}>
      <div className="roadmap__header">
        <div>
          <h2 className="roadmap__title">{embedded ? projectTitle : 'Roadmap'}</h2>
          <p className="roadmap__subtitle">
            {embedded
              ? 'Project milestones on the roadmap'
              : sorted.length > 0
                ? 'Your milestones — drag ⠿ to reorder, start from the bottom and grow upward'
                : 'Add milestones or load a template to build your path'}
          </p>
        </div>
        {!embedded && onAddMilestone && !showAddForm && (
          <div className="roadmap__header-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowAddForm(true)}>
              + Milestone
            </button>
          </div>
        )}
      </div>

      {!embedded && showAddForm && onAddMilestone && (
        <AddMilestoneForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {sorted.length === 0 && !showAddForm ? (
        <div className="empty-state roadmap-empty">
          <p>No milestones on your roadmap yet.</p>
          {onAddMilestone && (
            <div className="roadmap-empty__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowAddForm(true)}>
                + Milestone
              </button>
            </div>
          )}
        </div>
      ) : sorted.length === 0 ? null : (
        <div className="roadmap__timeline" ref={timelineRef}>
          {sorted.map((stage, index) => (
            <div
              key={stage.id}
              ref={(el) => {
                if (index === sorted.length - 1) startRef.current = el;
                if (el) rowRefs.current.set(stage.id, el);
                else rowRefs.current.delete(stage.id);
              }}
            >
              <MilestoneRow
                stage={stage}
                onSelectStage={onSelectStage}
                isFirst={index === 0}
                draggable={canDrag}
                onDragHandleDown={handleDragHandleDown}
                isDragging={draggingId === stage.id}
                isDragTarget={dropTargetId === stage.id && draggingId !== stage.id}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
