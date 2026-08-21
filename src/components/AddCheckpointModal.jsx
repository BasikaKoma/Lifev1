import { useEffect, useState } from 'react';

import {
  emptyCheckpointForm,
  buildCheckpointFromForm,
  buildCheckpointPatchFromForm,
  checkpointToForm,
  isCheckpointFormValid,
} from '../utils/checkpointForm';
import { toDateString } from '../utils/lifeline';
import { CategorySelect } from './CategorySelect';
import { PrioritySelect } from './PrioritySelect';

function CheckpointFormFields({
  form,
  setForm,
  idPrefix = 'cp',
  includeDescription = false,
  categoryOptions = [],
  requirePlanDate = false,
  planStartDate,
  planEndDate,
}) {
  return (
    <>
      <label className="checkpoint-modal__field" htmlFor={`${idPrefix}-title`}>
        <span>Τίτλος</span>
        <input
          id={`${idPrefix}-title`}
          className="input"
          placeholder="Checkpoint title"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          required
          autoFocus
        />
      </label>

      {requirePlanDate && (
        <label className="checkpoint-modal__field" htmlFor={`${idPrefix}-plan-date`}>
          <span>Ημερομηνία</span>
          <input
            id={`${idPrefix}-plan-date`}
            type="date"
            className="input"
            value={form.planDate || ''}
            min={planStartDate || undefined}
            max={planEndDate || undefined}
            required
            onChange={(e) => {
              const val = toDateString(e.target.value);
              setForm((prev) => ({ ...prev, planDate: val || '' }));
            }}
          />
        </label>
      )}

      <div className="checkpoint-modal__row">
        <PrioritySelect
          id={`${idPrefix}-priority`}
          value={form.priority}
          onChange={(priority) => setForm((prev) => ({ ...prev, priority }))}
        />
        <label className="checkpoint-modal__field checkpoint-modal__field--inline" htmlFor={`${idPrefix}-category`}>
          <span>Κατηγορία</span>
          <CategorySelect
            id={`${idPrefix}-category`}
            value={form.category}
            onChange={(category) => setForm((prev) => ({ ...prev, category }))}
            options={categoryOptions}
          />
        </label>
      </div>

      {includeDescription && (
        <label className="checkpoint-modal__field" htmlFor={`${idPrefix}-description`}>
          <span>Περιγραφή</span>
          <textarea
            id={`${idPrefix}-description`}
            className="input textarea"
            rows={3}
            placeholder="Προαιρετική περιγραφή…"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </label>
      )}
    </>
  );
}

export function AddCheckpointModal({
  open,
  stageTitle,
  categoryOptions = [],
  requirePlanDate = false,
  planStartDate,
  planEndDate,
  onAdd,
  onClose,
}) {
  const planOptions = { requirePlanDate, planStartDate, planEndDate };
  const [form, setForm] = useState(() => emptyCheckpointForm(planOptions));

  useEffect(() => {
    if (open) setForm(emptyCheckpointForm(planOptions));
  }, [open, requirePlanDate, planStartDate, planEndDate]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const checkpoint = buildCheckpointFromForm(form, planOptions);
    if (!checkpoint) return;
    onAdd?.(checkpoint);
    onClose?.();
  };

  const canSubmit = isCheckpointFormValid(form, planOptions);

  return (
    <div className="checkpoint-modal" role="dialog" aria-modal="true" aria-labelledby="checkpoint-modal-title">
      <button type="button" className="checkpoint-modal__backdrop" onClick={onClose} aria-label="Close" />
      <form className="checkpoint-modal__panel" onSubmit={handleSubmit}>
        <h2 id="checkpoint-modal-title" className="checkpoint-modal__title">
          Νέο checkpoint
        </h2>
        {stageTitle && (
          <p className="checkpoint-modal__subtitle">Milestone: {stageTitle}</p>
        )}
        <CheckpointFormFields
          form={form}
          setForm={setForm}
          idPrefix="modal-cp"
          includeDescription
          categoryOptions={categoryOptions}
          requirePlanDate={requirePlanDate}
          planStartDate={planStartDate}
          planEndDate={planEndDate}
        />
        <div className="checkpoint-modal__actions">
          <button type="button" className="checkpoint-modal__btn" onClick={onClose}>
            Ακύρωση
          </button>
          <button type="submit" className="checkpoint-modal__btn checkpoint-modal__btn--primary" disabled={!canSubmit}>
            Προσθήκη
          </button>
        </div>
      </form>
    </div>
  );
}

export { CheckpointFormFields };

export function EditCheckpointModal({
  open,
  checkpoint,
  stageTitle,
  categoryOptions = [],
  requirePlanDate = false,
  planStartDate,
  planEndDate,
  onSave,
  onClose,
}) {
  const planOptions = { requirePlanDate, planStartDate, planEndDate };
  const [form, setForm] = useState(() => emptyCheckpointForm(planOptions));

  useEffect(() => {
    if (open && checkpoint) setForm(checkpointToForm(checkpoint, planOptions));
  }, [open, checkpoint, requirePlanDate, planStartDate, planEndDate]);

  if (!open || !checkpoint) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const patch = buildCheckpointPatchFromForm(form, planOptions);
    if (!patch) return;
    onSave?.(patch);
    onClose?.();
  };

  const canSubmit = isCheckpointFormValid(form, planOptions);

  return (
    <div className="checkpoint-modal" role="dialog" aria-modal="true" aria-labelledby="edit-checkpoint-modal-title">
      <button type="button" className="checkpoint-modal__backdrop" onClick={onClose} aria-label="Close" />
      <form className="checkpoint-modal__panel" onSubmit={handleSubmit}>
        <h2 id="edit-checkpoint-modal-title" className="checkpoint-modal__title">
          Επεξεργασία checkpoint
        </h2>
        {stageTitle && (
          <p className="checkpoint-modal__subtitle">Milestone: {stageTitle}</p>
        )}
        <CheckpointFormFields
          form={form}
          setForm={setForm}
          idPrefix="edit-cp"
          includeDescription
          categoryOptions={categoryOptions}
          requirePlanDate={requirePlanDate}
          planStartDate={planStartDate}
          planEndDate={planEndDate}
        />
        <div className="checkpoint-modal__actions">
          <button type="button" className="checkpoint-modal__btn" onClick={onClose}>
            Ακύρωση
          </button>
          <button type="submit" className="checkpoint-modal__btn checkpoint-modal__btn--primary" disabled={!canSubmit}>
            Αποθήκευση
          </button>
        </div>
      </form>
    </div>
  );
}
