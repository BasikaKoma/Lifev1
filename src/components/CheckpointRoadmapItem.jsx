import { useEffect, useRef, useState } from 'react';
import { isCheckpointDone } from '../utils/logic';
import { formatArchiveDate } from '../utils/archive';
import { useZoomTransform } from './ZoomCanvas';
import { CHECKPOINT_DOT_RADIUS, CHECKPOINT_LABEL_GAP } from '../utils/stageLayout';
import { sameNodeRef } from '../utils/canvasNodes';
import { hasPriority } from '../constants/priority';
import { PriorityBadge, PrioritySelect } from './PrioritySelect';
import { ConfirmDialog } from './ConfirmDialog';
import { CopyTextButton } from './CopyTextButton';
import {
  formatPlanDayHeader,
  getCheckpointSubtaskSummary,
  snapPlanTimelineYForContext,
} from '../utils/planMode';
import { LIFELINE_ZOOM_LEVEL } from '../utils/lifeline';

const CHECKPOINT_DOT_HALF = CHECKPOINT_DOT_RADIUS;

function checkpointHasNotes(checkpoint) {
  return Boolean(
    (checkpoint.description || '').trim() ||
    (checkpoint.notesStickies || []).length ||
    (checkpoint.inkStrokes || []).length
  );
}

function getLabelStyle(centerX, side, dragOffset = 0) {
  const offset = CHECKPOINT_DOT_HALF + CHECKPOINT_LABEL_GAP;
  const isRight = side === 'right';
  return isRight
    ? { left: centerX + offset + dragOffset }
    : { left: centerX - offset + dragOffset, transform: 'translateX(-100%)' };
}

function getPlanLabelStyle(centerX, side, dragOffset) {
  const offset = CHECKPOINT_DOT_HALF + CHECKPOINT_LABEL_GAP;
  const isRight = side === 'right';
  if (isRight) {
    return { left: centerX + offset + dragOffset };
  }
  return { left: centerX - offset + dragOffset };
}

function resolveSideFromPosition(centerX, side, dragOffset, labelWidth) {
  const offset = CHECKPOINT_DOT_HALF + CHECKPOINT_LABEL_GAP;
  const isRight = side === 'right';
  const leftEdge = isRight
    ? centerX + offset + dragOffset
    : centerX - offset + dragOffset - labelWidth;
  const labelCenter = leftEdge + labelWidth / 2;
  return labelCenter < centerX ? 'left' : 'right';
}

export function CheckpointRoadmapItem({
  checkpoint,
  centerX,
  side,
  onSelectStage,
  onOpenCheckpoint,
  onOpenPlanPanel,
  onEditCheckpoint,
  onSideChange,
  onToggleComplete,
  onArchive,
  onRemove,
  onReorder,
  onPriorityChange,
  onUpdateCheckpoint,
  stageId,
  onConnectClick,
  onNodeSelect,
  connectFrom,
  connectModeActive = false,
  selectedNodeRef,
  lifelinePlanContext = null,
  isLifeline = false,
  lifelineZoomLevel = null,
  hasSettledLinkedNotes = false,
}) {
  const { scale } = useZoomTransform();
  const planMode = Boolean(checkpoint.stagePlanMode);
  const done = isCheckpointDone(checkpoint);
  const doneDate = formatArchiveDate(checkpoint.completedAt || checkpoint.archivedAt);
  const hasNotes = checkpointHasNotes(checkpoint);
  const labelRef = useRef(null);
  const titleInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [actionsPinned, setActionsPinned] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checkpoint.title || '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragOrigin = useRef(null);
  const moved = useRef(false);
  const dragAxis = useRef(null);
  const nodeRef = { type: 'checkpoint', id: checkpoint.id, stageId };
  const isConnectSource = sameNodeRef(connectFrom, nodeRef);
  const isSelected = sameNodeRef(selectedNodeRef, nodeRef);
  const showActions = !planMode && (hovered || isSelected || expanded || actionsPinned || confirmDeleteOpen);

  const dayLabel = planMode && checkpoint.planDate
    ? formatPlanDayHeader(
        { planStartDate: checkpoint.planStartDate, planEndDate: checkpoint.planEndDate, planMode: true },
        checkpoint.planDate
      )
    : null;
  const subtasks = planMode ? getCheckpointSubtaskSummary(checkpoint) : null;

  useEffect(() => {
    setTitleDraft(checkpoint.title || '');
  }, [checkpoint.title]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (!expanded || planMode) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const onPointer = (e) => {
      if (labelRef.current && !labelRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [expanded, planMode]);

  const interactiveSelector =
    '.checkpoint-roadmap-item__check, .checkpoint-roadmap-item__actions, .checkpoint-roadmap-item__copy, .checkpoint-roadmap-item__title-input, button, a, input, textarea, select';

  const openDeleteConfirm = () => {
    setConfirmDeleteOpen(true);
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(interactiveSelector)) return;
    e.stopPropagation();
    e.preventDefault();

    if (e.altKey && onConnectClick) {
      onConnectClick(nodeRef);
      return;
    }
    if (connectModeActive && onConnectClick) {
      onConnectClick(nodeRef);
      return;
    }

    setDragging(true);
    moved.current = false;
    dragAxis.current = planMode ? 'y' : null;
    dragOrigin.current = { x: e.clientX, y: e.clientY, offset: dragOffset, top: checkpoint.timelineY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragging || !dragOrigin.current) return;
    const dx = (e.clientX - dragOrigin.current.x) / scale;
    const dy = (e.clientY - dragOrigin.current.y) / scale;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;

    if (!dragAxis.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragAxis.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }

    if (dragAxis.current === 'y') {
      let nextY = dragOrigin.current.top + dy;
      if (planMode && typeof checkpoint.planStartY === 'number') {
        nextY = snapPlanTimelineYForContext(
          nextY,
          checkpoint.planStartDate,
          checkpoint.planEndDate,
          checkpoint.planStartY,
          checkpoint.planDurationDays ?? 0,
          lifelinePlanContext
        );
      }
      setDragOffsetY(nextY - dragOrigin.current.top);
      setDragOffset(0);
      return;
    }

    setDragOffsetY(0);
    setDragOffset(dragOrigin.current.offset + dx);
  };

  const finishDrag = () => {
    if (!moved.current) {
      if (connectModeActive && onConnectClick) {
        onConnectClick(nodeRef);
        return;
      }
      onNodeSelect?.(nodeRef);
      if (planMode) {
        onOpenPlanPanel?.(stageId, checkpoint.id);
        return;
      }
      setExpanded((prev) => !prev);
      return;
    }

    if (dragAxis.current === 'y' && onReorder) {
      const dropY = dragOrigin.current.top + dragOffsetY;
      onReorder(stageId, checkpoint.id, dropY);
      return;
    }

    const labelWidth = labelRef.current?.offsetWidth ?? 120;
    const nextSide = resolveSideFromPosition(centerX, side, dragOffset, labelWidth);
    if (nextSide !== side) {
      onSideChange?.(stageId, checkpoint.id, nextSide);
    }
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    finishDrag();
    dragOrigin.current = null;
    dragAxis.current = null;
    setDragOffset(0);
    setDragOffsetY(0);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handlePointerCancel = (e) => {
    if (!dragging) return;
    setDragging(false);
    dragOrigin.current = null;
    dragAxis.current = null;
    setDragOffset(0);
    setDragOffsetY(0);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    (onToggleComplete || onArchive)?.(stageId, checkpoint);
  };

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(checkpoint.title || '');
      setEditingTitle(false);
      return;
    }
    if (next !== checkpoint.title) {
      (onUpdateCheckpoint || onEditCheckpoint)?.(stageId, checkpoint.id, { title: next });
    }
    setEditingTitle(false);
  };

  const handleTitleDoubleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingTitle(true);
  };

  const labelStyle = getLabelStyle(centerX, side, dragOffset);
  const description = (checkpoint.description || '').trim();
  const fullText = description
    ? `${checkpoint.title}\n\n${description}`
    : checkpoint.title;

  const displayY = checkpoint.timelineY + dragOffsetY;
  const planCardTransform = side === 'left' ? 'translate(-100%, -50%)' : 'translateY(-50%)';
  const compactDot = isLifeline && lifelineZoomLevel === LIFELINE_ZOOM_LEVEL.life;
  const compactMini = isLifeline && lifelineZoomLevel === LIFELINE_ZOOM_LEVEL.time;

  if (isLifeline && !planMode && lifelineZoomLevel === LIFELINE_ZOOM_LEVEL.life) {
    return null;
  }

  if (planMode) {
    if (compactDot || compactMini) {
      return (
        <button
          type="button"
          className={[
            'checkpoint-roadmap-item',
            'checkpoint-roadmap-item--lifeline-mini',
            `checkpoint-roadmap-item--${side}`,
            done ? 'checkpoint-roadmap-item--done' : '',
            isSelected ? 'checkpoint-roadmap-item--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            top: displayY,
            ...(side === 'left'
              ? { right: `calc(100% - ${centerX}px + 12px)`, transform: 'translateY(-50%)' }
              : { left: centerX + 12, transform: 'translateY(-50%)' }),
          }}
          onClick={() => onOpenPlanPanel?.(stageId, checkpoint.id)}
          title={checkpoint.title}
        >
          <span className="checkpoint-roadmap-item__lifeline-mini-title">{checkpoint.title}</span>
        </button>
      );
    }

    return (
      <>
        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Διαγραφή checkpoint"
          message={`Θέλεις σίγουρα να διαγράψεις το checkpoint «${checkpoint.title}»; Η ενέργεια δεν αναιρείται.`}
          confirmLabel="Διαγραφή"
          onConfirm={() => {
            onRemove?.(stageId, checkpoint.id);
            setConfirmDeleteOpen(false);
          }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />

        <div
          ref={labelRef}
          className={[
            'checkpoint-roadmap-item',
            'checkpoint-roadmap-item--plan',
            `checkpoint-roadmap-item--${side}`,
            isLifeline ? 'checkpoint-roadmap-item--plan-lifeline' : '',
            done ? 'checkpoint-roadmap-item--done' : '',
            dragging ? 'checkpoint-roadmap-item--dragging' : '',
            isSelected ? 'checkpoint-roadmap-item--selected' : '',
            dragAxis.current === 'y' ? 'checkpoint-roadmap-item--reordering' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            left: getPlanLabelStyle(centerX, side, dragOffset).left,
            top: displayY,
            transform: planCardTransform,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          title="Κλικ για panel · σύρε κάθετα για αλλαγή ημέρας"
        >
          <div className="checkpoint-roadmap-item__plan-anchor">
            {dayLabel && (
              <span
                className={[
                  'checkpoint-roadmap-item__day-label',
                  isLifeline ? 'checkpoint-roadmap-item__day-label--lifeline' : '',
                ].filter(Boolean).join(' ')}
              >
                {dayLabel}
              </span>
            )}

            <div className="checkpoint-roadmap-item__plan-row">
              <button
                type="button"
                className={`checkpoint-roadmap-item__node${done ? ' checkpoint-roadmap-item__node--done' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleToggle}
                aria-label={done ? `Αναίρεση: ${checkpoint.title}` : `Ολοκλήρωση: ${checkpoint.title}`}
                title={done ? 'Επαναφορά checkpoint' : 'Ολοκλήρωση checkpoint'}
              />
              <span className="checkpoint-roadmap-item__plan-connector" aria-hidden="true" />

              <div className="checkpoint-roadmap-item__plan-content">
                {editingTitle ? (
                  <input
                    ref={titleInputRef}
                    className="checkpoint-roadmap-item__title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTitle();
                      }
                      if (e.key === 'Escape') {
                        setTitleDraft(checkpoint.title || '');
                        setEditingTitle(false);
                      }
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Τίτλος checkpoint"
                  />
                ) : (
                  <div className="checkpoint-roadmap-item__title-wrap checkpoint-roadmap-item__title-wrap--plan">
                    <span
                      className="checkpoint-roadmap-item__text checkpoint-roadmap-item__text--plan"
                      onDoubleClick={handleTitleDoubleClick}
                      title="Διπλό κλικ για επεξεργασία"
                    >
                      {checkpoint.title}
                    </span>
                    <CopyTextButton
                      text={checkpoint.title}
                      className="checkpoint-roadmap-item__copy checkpoint-roadmap-item__copy--plan"
                      title="Αντιγραφή τίτλου"
                      ariaLabel="Αντιγραφή τίτλου checkpoint"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <span
            className={`checkpoint-roadmap-item__subtasks checkpoint-roadmap-item__subtasks--plan${
              done || (subtasks && subtasks.done > 0) ? ' checkpoint-roadmap-item__subtasks--active' : ''
            }${done ? ' checkpoint-roadmap-item__subtasks--complete' : ''}`}
          >
            {done ? 'Ολοκληρώθηκε' : (subtasks?.label || 'Not started')}
          </span>
        </div>
      </>
    );
  }

  if (compactDot) {
    return (
      <button
        type="button"
        className={[
          'checkpoint-roadmap-item',
          'checkpoint-roadmap-item--lifeline-dot',
          done ? 'checkpoint-roadmap-item--done' : '',
          isSelected ? 'checkpoint-roadmap-item--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ top: checkpoint.timelineY - CHECKPOINT_DOT_RADIUS + dragOffsetY, left: centerX }}
        onClick={() => onOpenCheckpoint?.(stageId, checkpoint.id)}
        title={checkpoint.title}
        aria-label={checkpoint.title}
      />
    );
  }

  if (compactMini) {
    return (
      <button
        type="button"
        className={[
          'checkpoint-roadmap-item',
          'checkpoint-roadmap-item--lifeline-mini',
          `checkpoint-roadmap-item--${side}`,
          done ? 'checkpoint-roadmap-item--done' : '',
          isSelected ? 'checkpoint-roadmap-item--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          top: checkpoint.timelineY - CHECKPOINT_DOT_RADIUS + dragOffsetY,
          ...(side === 'left'
            ? { right: `calc(100% - ${centerX}px + 12px)`, transform: 'translateY(-50%)' }
            : { left: centerX + 12, transform: 'translateY(-50%)' }),
        }}
        onClick={() => onOpenCheckpoint?.(stageId, checkpoint.id)}
        title={checkpoint.title}
      >
        <span className="checkpoint-roadmap-item__lifeline-mini-title">{checkpoint.title}</span>
      </button>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Διαγραφή checkpoint"
        message={`Θέλεις σίγουρα να διαγράψεις το checkpoint «${checkpoint.title}»; Η ενέργεια δεν αναιρείται.`}
        confirmLabel="Διαγραφή"
        onConfirm={() => {
          onRemove?.(stageId, checkpoint.id);
          setConfirmDeleteOpen(false);
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <div
        ref={labelRef}
        className={[
          'checkpoint-roadmap-item',
          `checkpoint-roadmap-item--${side}`,
          done ? 'checkpoint-roadmap-item--done' : '',
          dragging ? 'checkpoint-roadmap-item--dragging' : '',
          expanded ? 'checkpoint-roadmap-item--expanded' : '',
          isConnectSource ? 'checkpoint-roadmap-item--connect-source' : '',
          isSelected ? 'checkpoint-roadmap-item--selected' : '',
          connectModeActive ? 'checkpoint-roadmap-item--connect-target' : '',
          dragAxis.current === 'y' ? 'checkpoint-roadmap-item--reordering' : '',
          showActions ? 'checkpoint-roadmap-item--actions-visible' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          top: checkpoint.timelineY - CHECKPOINT_DOT_RADIUS + dragOffsetY,
          ...labelStyle,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          if (!actionsPinned) return;
          setActionsPinned(false);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title={
          done && hasSettledLinkedNotes
            ? 'Κλικ για εμφάνιση σημειώσεων'
            : 'Διπλό κλικ στον τίτλο για επεξεργασία · σύρε κάθετα για σειρά'
        }
      >
        <label
          className="checkpoint-roadmap-item__check"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={done}
            onChange={handleToggle}
            aria-label={done ? `Αναίρεση: ${checkpoint.title}` : `Ολοκλήρωση: ${checkpoint.title}`}
          />
        </label>

        <div className="checkpoint-roadmap-item__body">
          <div className="checkpoint-roadmap-item__row">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="checkpoint-roadmap-item__title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitle();
                  }
                  if (e.key === 'Escape') {
                    setTitleDraft(checkpoint.title || '');
                    setEditingTitle(false);
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                aria-label="Τίτλος checkpoint"
              />
            ) : (
              <div className="checkpoint-roadmap-item__title-wrap">
                <span
                  className={`checkpoint-roadmap-item__text${hasNotes ? ' checkpoint-roadmap-item__text--has-notes' : ''}`}
                  onDoubleClick={handleTitleDoubleClick}
                  title="Διπλό κλικ για επεξεργασία τίτλου"
                >
                  {checkpoint.title}
                </span>
                {hasPriority(checkpoint.priority) && (
                  <PriorityBadge
                    priority={checkpoint.priority}
                    className="checkpoint-roadmap-item__priority-badge"
                  />
                )}
              </div>
            )}

            <div
              className="checkpoint-roadmap-item__actions"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setActionsPinned(true)}
              onMouseLeave={() => setActionsPinned(false)}
            >
              <CopyTextButton
                text={checkpoint.title}
                className="checkpoint-roadmap-item__copy"
                title="Αντιγραφή τίτλου"
                ariaLabel="Αντιγραφή τίτλου checkpoint"
              />

              {onPriorityChange && (
                <PrioritySelect
                  compact
                  className="checkpoint-roadmap-item__priority"
                  value={checkpoint.priority}
                  onChange={(priority) => onPriorityChange(stageId, checkpoint.id, priority)}
                />
              )}

              {onOpenCheckpoint && (
                <button
                  type="button"
                  className={`checkpoint-roadmap-item__notes${hasNotes ? ' checkpoint-roadmap-item__notes--active' : ''}`}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenCheckpoint(stageId, checkpoint.id);
                  }}
                  title={hasNotes ? 'Άνοιγμα σημειώσεων' : 'Προσθήκη σημειώσεων'}
                  aria-label="Σημειώσεις checkpoint"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                </button>
              )}

              {(onEditCheckpoint || onUpdateCheckpoint) && (
                <button
                  type="button"
                  className="checkpoint-roadmap-item__edit"
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onEditCheckpoint?.(stageId, checkpoint.id);
                  }}
                  title="Επεξεργασία checkpoint"
                  aria-label="Επεξεργασία checkpoint"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}

              {onRemove && (
                <button
                  type="button"
                  className="checkpoint-roadmap-item__delete"
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    openDeleteConfirm();
                  }}
                  title="Διαγραφή checkpoint"
                  aria-label="Διαγραφή checkpoint"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {expanded && (
            <div className="checkpoint-roadmap-item__full">
              <p className="checkpoint-roadmap-item__full-text">{fullText}</p>
              {done && doneDate && (
                <p className="checkpoint-roadmap-item__full-meta">Εκτελεσμένο · {doneDate}</p>
              )}
              {onOpenCheckpoint && (
                <button
                  type="button"
                  className="checkpoint-roadmap-item__open"
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenCheckpoint(stageId, checkpoint.id);
                  }}
                >
                  Άνοιγμα σημειώσεων
                </button>
              )}
              {onSelectStage && (
                <button
                  type="button"
                  className="checkpoint-roadmap-item__open"
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSelectStage(stageId);
                  }}
                >
                  Άνοιγμα milestone
                </button>
              )}
            </div>
          )}
        </div>

        {!expanded && done && doneDate && (
          <span className="checkpoint-roadmap-item__date">{doneDate}</span>
        )}
      </div>
    </>
  );
}
