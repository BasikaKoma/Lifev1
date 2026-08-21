import { useState } from 'react';
import { isCheckpointDone } from '../utils/logic';
import {
  emptyCheckpointForm,
  buildCheckpointFromForm,
  isCheckpointFormValid,
} from '../utils/checkpointForm';
import { CheckpointFormFields } from './AddCheckpointModal';
import {
  buildToggleCompletePatch,
  formatArchiveDate,
  isItemDone,
} from '../utils/archive';
import { CategorySelect, CategoryBadge } from './CategorySelect';
import { PrioritySelect, PriorityBadge } from './PrioritySelect';
import { ArchiveCelebration } from './ArchiveCelebration';
import { CopyTextButton } from './CopyTextButton';
import { CheckpointSubtasks } from './CheckpointSubtasks';

export function CheckpointCard({
  checkpoint,
  stageId,
  onUpdate,
  onRemove,
  categoryOptions,
  onArchived,
  showSubtasks = false,
}) {
  const done = isCheckpointDone(checkpoint);
  const [celebration, setCelebration] = useState(null);

  const handleCompleteToggle = () => {
    const wasDone = isItemDone(checkpoint);
    const patch = buildToggleCompletePatch(checkpoint);
    onUpdate(stageId, checkpoint.id, patch);
    if (!wasDone) {
      setCelebration({
        title: checkpoint.title,
        subtitle: 'Checkpoint',
        completedAt: patch.completedAt,
      });
      onArchived?.(checkpoint, patch);
    }
  };

  return (
    <>
      {celebration && (
        <ArchiveCelebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          completedAt={celebration.completedAt}
          onDone={() => setCelebration(null)}
        />
      )}
      <div className={`card checkpoint-card ${done ? 'checkpoint-card--done' : ''}`}>
        <div className="checkpoint-card__header">
          <label className="checkpoint-card__check">
            <input
              type="checkbox"
              checked={done}
              onChange={handleCompleteToggle}
              aria-label={done ? `Αναίρεση: ${checkpoint.title}` : `Ολοκλήρωση: ${checkpoint.title}`}
            />
          </label>
          <h4 className="checkpoint-card__title">{checkpoint.title}</h4>
          <CopyTextButton
            text={checkpoint.title}
            className="checkpoint-card__copy"
            title="Αντιγραφή τίτλου"
            ariaLabel="Αντιγραφή τίτλου checkpoint"
          />
          <PriorityBadge priority={checkpoint.priority} />
          <CategoryBadge category={checkpoint.category} />
          {done && <span className="badge badge--done">Εκτελεσμένο</span>}
          {done && (checkpoint.completedAt || checkpoint.archivedAt) && (
            <span className="checkpoint-card__archive-date">
              {formatArchiveDate(checkpoint.completedAt || checkpoint.archivedAt)}
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              className="checkpoint-card__delete"
              onClick={() => {
                if (window.confirm(`Διαγραφή checkpoint «${checkpoint.title}»;`)) {
                  onRemove(stageId, checkpoint.id);
                }
              }}
              title="Διαγραφή checkpoint"
              aria-label="Διαγραφή checkpoint"
            >
              ×
            </button>
          )}
        </div>

        <div className="checkpoint-card__meta-row">
          <CategorySelect
            value={checkpoint.category || ''}
            onChange={(category) => onUpdate(stageId, checkpoint.id, { category })}
            options={categoryOptions}
          />
          <PrioritySelect
            compact
            value={checkpoint.priority}
            onChange={(priority) => onUpdate(stageId, checkpoint.id, { priority })}
          />
        </div>

        {showSubtasks && (
          <CheckpointSubtasks
            variant="card"
            items={checkpoint.checklistItems || []}
            maxVisible={4}
            onChange={(checklistItems) =>
              onUpdate(stageId, checkpoint.id, { checklistItems })
            }
          />
        )}
      </div>
    </>
  );
}

export function AddCheckpointForm({
  stageId,
  onAdd,
  categoryOptions,
  requirePlanDate = false,
  planStartDate,
  planEndDate,
}) {
  const planOptions = { requirePlanDate, planStartDate, planEndDate };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => emptyCheckpointForm(planOptions));

  const handleSubmit = (e) => {
    e.preventDefault();
    const checkpoint = buildCheckpointFromForm(form, planOptions);
    if (!checkpoint) return;
    onAdd(stageId, checkpoint);
    setForm(emptyCheckpointForm(planOptions));
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        + Add Checkpoint
      </button>
    );
  }

  const canSubmit = isCheckpointFormValid(form, planOptions);

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <CheckpointFormFields
        form={form}
        setForm={setForm}
        idPrefix={`stage-${stageId}`}
        requirePlanDate={requirePlanDate}
        planStartDate={planStartDate}
        planEndDate={planEndDate}
      />
      <CategorySelect
        value={form.category || ''}
        onChange={(category) => setForm((prev) => ({ ...prev, category }))}
        options={categoryOptions}
      />
      <div className="add-form__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={!canSubmit}>Add</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
