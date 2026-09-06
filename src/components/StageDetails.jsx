import { useEffect, useState } from 'react';
import {
  getStageProgress,
  getCompletedCheckpointCount,
  getStageHealth,
  getNextIncompleteCheckpoint,
  isStageDone,
} from '../utils/logic';
import {
  isPlanMode,
  getPlanDurationDays,
  formatPlanDateShort,
} from '../utils/planMode';
import { toDateString } from '../utils/lifeline';
import { partitionOpenDone, formatArchiveDate } from '../utils/archive';
import { CheckpointCard, AddCheckpointForm } from './CheckpointCard';
import { IdeaCard, AddIdeaForm } from './IdeaCard';
import { BlockerCard, AddBlockerForm, DecisionCard, AddDecisionForm } from './BlockerDecisionCards';
import { CategorySelect, CategoryBadge } from './CategorySelect';
import { PrioritySelect } from './PrioritySelect';

function ProgressRing({ progress, size = 72 }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="progress-ring progress-ring--lg" style={{ width: size, height: size }}>
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

const STATUS_MAP = {
  Done: { label: 'Completed', className: 'completed' },
  Current: { label: 'In Progress', className: 'in-progress' },
  Locked: { label: 'Upcoming', className: 'upcoming' },
};

export function StageDetails({
  stage,
  stages,
  onClose,
  onUpdateStage,
  onUpdateStagePlan,
  onUpdateCheckpoint,
  onRemoveCheckpoint,
  onAddCheckpoint,
  onUpdateIdea,
  onAddIdea,
  onUpdateBlocker,
  onAddBlocker,
  onUpdateDecision,
  onAddDecision,
  onMarkStageDone,
  onToggleStageComplete,
  categoryOptions,
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage?.title || '');
  const [descDraft, setDescDraft] = useState(stage?.description || '');
  const [shiftCheckpointsOnStartChange, setShiftCheckpointsOnStartChange] = useState(true);

  const planUpdate = onUpdateStagePlan || onUpdateStage;

  useEffect(() => {
    setTitleDraft(stage?.title || '');
    setDescDraft(stage?.description || '');
    setEditingTitle(false);
  }, [stage?.id, stage?.title, stage?.description]);

  if (!stage) return null;

  const progress = getStageProgress(stage);
  const completed = getCompletedCheckpointCount(stage);
  const total = (stage.checkpoints || []).length;
  const health = getStageHealth(stage);
  const nextCheckpoint = getNextIncompleteCheckpoint(stage);
  const done = isStageDone(stage);
  const status = STATUS_MAP[stage.status] || STATUS_MAP.Locked;
  const toggleComplete = () => {
    if (onToggleStageComplete) onToggleStageComplete(stage.id);
    else if (!done) onMarkStageDone?.(stage.id);
  };
  const { open: openCheckpoints, done: archivedCheckpoints } = partitionOpenDone(
    stage.checkpoints || []
  );

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(stage.title);
      setEditingTitle(false);
      return;
    }
    onUpdateStage?.(stage.id, { title: next });
    setEditingTitle(false);
  };

  return (
    <section className="stage-details">
      <button type="button" className="stage-details__back btn btn--outline btn--sm" onClick={onClose}>
        ← Back to path
      </button>

      <div className={`stage-details__hero stage-details__hero--major${done ? ' stage-details__hero--done' : ''}`}>
        <div className="stage-details__hero-left">
          <span className="projects-row__phase">Milestone</span>
          {editingTitle ? (
            <div className="stage-details__title-edit">
              <input
                className="input stage-details__title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                  }
                  if (e.key === 'Escape') {
                    setTitleDraft(stage.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                aria-label="Τίτλος milestone"
              />
              <div className="stage-details__title-actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={saveTitle}>
                  Αποθήκευση
                </button>
                <button
                  type="button"
                  className="btn btn--text btn--sm"
                  onClick={() => {
                    setTitleDraft(stage.title);
                    setEditingTitle(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="stage-details__title-btn"
              onClick={() => setEditingTitle(true)}
              title="Επεξεργασία τίτλου"
            >
              <h2 className="stage-details__title">{stage.title}</h2>
              <span className="stage-details__title-hint">Επεξεργασία τίτλου</span>
            </button>
          )}

          <textarea
            className="input textarea stage-details__desc-input"
            rows={2}
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if ((descDraft || '') !== (stage.description || '')) {
                onUpdateStage?.(stage.id, { description: descDraft.trim() });
              }
            }}
            placeholder="Περιγραφή milestone…"
          />

          <div className="stage-details__meta-row">
            <CategorySelect
              value={stage.category || ''}
              onChange={(category) => onUpdateStage?.(stage.id, { category })}
              options={categoryOptions}
            />
            <PrioritySelect
              value={stage.priority}
              onChange={(priority) => onUpdateStage?.(stage.id, { priority })}
            />
            <CategoryBadge category={stage.category} />
          </div>

          <div className="stage-details__badges">
            <span className={`projects-badge projects-badge--${status.className}`}>{status.label}</span>
            {done && stage.completedAt && (
              <span className="stage-details__complete-date">
                Εκτελεσμένο · {formatArchiveDate(stage.completedAt)}
              </span>
            )}
            <span className={`projects-badge projects-badge--health-${health.toLowerCase().replace(' ', '-')}`}>
              {health}
            </span>
            <span className="stage-details__count">{completed}/{total} checkpoints</span>
          </div>
        </div>
        <div className="stage-details__hero-right">
          <ProgressRing progress={progress} />
        </div>
      </div>

      {nextCheckpoint && !done && (
        <div className="panel panel--subtle stage-details__next">
          <span className="panel__label">Next Action</span>
          <p>Complete: <strong>{nextCheckpoint.title}</strong></p>
        </div>
      )}

      <div className="panel panel--subtle stage-details__plan">
        <div className="stage-details__plan-header">
          <h3 className="detail-section__title">Πλάνο</h3>
          <label className="stage-details__plan-toggle">
            <input
              type="checkbox"
              checked={Boolean(stage.planMode)}
              onChange={(e) => {
                if (e.target.checked) {
                  planUpdate?.(stage.id, { planMode: true });
                } else {
                  planUpdate?.(stage.id, { planMode: false });
                }
              }}
            />
            <span>Plan Mode</span>
          </label>
        </div>

        {isPlanMode(stage) && (
          <div className="stage-details__plan-fields">
            <div className="stage-details__plan-row">
              <label className="stage-details__plan-label">
                Έναρξη
                <input
                  type="date"
                  className="input input--sm"
                  value={stage.planStartDate || ''}
                  onChange={(e) => {
                    const val = toDateString(e.target.value);
                    if (!val) return;
                    planUpdate?.(
                      stage.id,
                      { planStartDate: val },
                      { shiftCheckpoints: shiftCheckpointsOnStartChange }
                    );
                  }}
                />
              </label>
              <label className="stage-details__plan-label">
                Λήξη
                <input
                  type="date"
                  className="input input--sm"
                  value={stage.planEndDate || ''}
                  min={stage.planStartDate || undefined}
                  onChange={(e) => {
                    const val = toDateString(e.target.value);
                    if (!val) return;
                    planUpdate?.(stage.id, { planEndDate: val });
                  }}
                />
              </label>
            </div>

            <div className="stage-details__plan-summary">
              <span className="stage-details__plan-duration">
                Διάρκεια: <strong>{getPlanDurationDays(stage)} ημέρες</strong>
              </span>
              <span className="stage-details__plan-range">
                {formatPlanDateShort(stage.planStartDate)} → {formatPlanDateShort(stage.planEndDate)}
              </span>
            </div>

            <label className="stage-details__plan-label stage-details__plan-label--full">
              Τελικός στόχος
              <input
                type="text"
                className="input input--sm"
                defaultValue={stage.planGoal || ''}
                key={`planGoal-${stage.id}-${stage.planGoal}`}
                placeholder="π.χ. λειτουργικό MVP"
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val !== (stage.planGoal || '')) {
                    planUpdate?.(stage.id, { planGoal: val });
                  }
                }}
              />
            </label>

            <label className="stage-details__plan-shift">
              <input
                type="checkbox"
                checked={shiftCheckpointsOnStartChange}
                onChange={(e) => setShiftCheckpointsOnStartChange(e.target.checked)}
              />
              <span>Μετακίνηση checkpoints κατά την αλλαγή ημερομηνίας έναρξης</span>
            </label>
          </div>
        )}
      </div>

      <div className="stage-details__sections">
        <div className="detail-section detail-section--full">
          <h3 className="detail-section__title">Checkpoints</h3>
          <div className="detail-section__list detail-section__list--grid">
            {openCheckpoints.map((cp) => (
              <CheckpointCard
                key={cp.id}
                checkpoint={cp}
                stageId={stage.id}
                onUpdate={onUpdateCheckpoint}
                onRemove={onRemoveCheckpoint}
                categoryOptions={categoryOptions}
                showSubtasks={isPlanMode(stage)}
              />
            ))}
            {openCheckpoints.length === 0 && (
              <div className="empty-state empty-state--sm">
                {total === 0 ? 'No checkpoints yet' : 'Όλα τα checkpoints είναι στο Archived'}
              </div>
            )}
          </div>
          <AddCheckpointForm
            stageId={stage.id}
            onAdd={onAddCheckpoint}
            categoryOptions={categoryOptions}
            requirePlanDate={isPlanMode(stage)}
            planStartDate={stage.planStartDate}
            planEndDate={stage.planEndDate}
          />
        </div>

        {archivedCheckpoints.length > 0 && (
          <div className="detail-section detail-section--full stage-details__archived">
            <h3 className="detail-section__title">
              Archived
              <span className="stage-details__archived-count">{archivedCheckpoints.length}</span>
            </h3>
            <p className="stage-details__archived-desc">
              Checked / ολοκληρωμένα checkpoints — μένουν ορατά στα Projects ως εκτελεσμένα
            </p>
            <div className="detail-section__list detail-section__list--grid">
              {archivedCheckpoints.map((cp) => (
                <CheckpointCard
                  key={cp.id}
                  checkpoint={cp}
                  stageId={stage.id}
                  onUpdate={onUpdateCheckpoint}
                  onRemove={onRemoveCheckpoint}
                  categoryOptions={categoryOptions}
                  showSubtasks={isPlanMode(stage)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="stage-details__columns">
          <div className="detail-section">
            <h3 className="detail-section__title">Ideas</h3>
            <div className="detail-section__list">
              {(stage.ideas || []).map((idea) => (
                <IdeaCard key={idea.id} idea={idea} stageId={stage.id} stages={stages} onUpdate={onUpdateIdea} />
              ))}
              {(stage.ideas || []).length === 0 && <div className="empty-state empty-state--sm">No ideas yet</div>}
            </div>
            <AddIdeaForm stageId={stage.id} stages={stages} onAdd={onAddIdea} />
          </div>

          <div className="detail-section">
            <h3 className="detail-section__title">Blockers</h3>
            <div className="detail-section__list">
              {(stage.blockers || []).map((blocker) => (
                <BlockerCard key={blocker.id} blocker={blocker} stageId={stage.id} onUpdate={onUpdateBlocker} />
              ))}
              {(stage.blockers || []).length === 0 && <div className="empty-state empty-state--sm">No blockers</div>}
            </div>
            <AddBlockerForm stageId={stage.id} onAdd={onAddBlocker} />
          </div>

          <div className="detail-section">
            <h3 className="detail-section__title">Decisions</h3>
            <div className="detail-section__list">
              {(stage.decisions || []).map((decision) => (
                <DecisionCard key={decision.id} decision={decision} stageId={stage.id} onUpdate={onUpdateDecision} />
              ))}
              {(stage.decisions || []).length === 0 && <div className="empty-state empty-state--sm">No decisions</div>}
            </div>
            <AddDecisionForm stageId={stage.id} onAdd={onAddDecision} />
          </div>
        </div>
      </div>

      <div className="stage-details__footer">
        <button
          type="button"
          className={`btn ${done ? 'btn--outline' : 'btn--primary'} stage-details__complete-btn`}
          onClick={toggleComplete}
        >
          {done ? 'Αναίρεση ολοκλήρωσης' : 'Ολοκληρώθηκε'}
        </button>
      </div>
    </section>
  );
}
