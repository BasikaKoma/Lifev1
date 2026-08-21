import { useEffect, useState } from 'react';
import { isCheckpointDone } from '../utils/logic';
import { formatPlanDayHeader } from '../utils/planMode';
import { toDateString } from '../utils/lifeline';
import { buildToggleCompletePatch } from '../utils/archive';
import { CopyTextButton } from './CopyTextButton';
import { CheckpointSubtasks } from './CheckpointSubtasks';

export function CheckpointPlanPanel({
  open,
  stageId,
  checkpointId,
  stages = [],
  onUpdateCheckpoint,
  onClose,
}) {
  const stage = stages.find((s) => s.id === stageId) || null;
  const checkpoint = stage?.checkpoints?.find((cp) => cp.id === checkpointId) || null;
  const done = checkpoint ? isCheckpointDone(checkpoint) : false;

  const [descDraft, setDescDraft] = useState('');

  useEffect(() => {
    setDescDraft(checkpoint?.description || '');
  }, [checkpoint?.id, checkpoint?.description]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !checkpoint || !stage) return null;

  const items = checkpoint.checklistItems || [];
  const dayLabel = checkpoint.planDate
    ? formatPlanDayHeader(stage, checkpoint.planDate)
    : null;

  const patch = (updates) => onUpdateCheckpoint?.(stageId, checkpointId, updates);

  const toggleComplete = () => {
    patch(buildToggleCompletePatch(checkpoint));
  };

  return (
    <aside className="checkpoint-plan-panel" role="dialog" aria-modal="true" aria-labelledby="checkpoint-plan-panel-title">
      <button type="button" className="checkpoint-plan-panel__backdrop" onClick={onClose} aria-label="Κλείσιμο" />
      <div className="checkpoint-plan-panel__drawer">
        <header className="checkpoint-plan-panel__header">
          <div>
            {dayLabel && <span className="checkpoint-plan-panel__day">{dayLabel}</span>}
            <div className="checkpoint-plan-panel__title-row">
              <h2 id="checkpoint-plan-panel-title" className="checkpoint-plan-panel__title">
                {checkpoint.title}
              </h2>
              <CopyTextButton
                text={checkpoint.title}
                className="checkpoint-plan-panel__copy"
                title="Αντιγραφή τίτλου"
                ariaLabel="Αντιγραφή τίτλου checkpoint"
              />
            </div>
            <span className="checkpoint-plan-panel__stage">{stage.title}</span>
          </div>
          <button type="button" className="checkpoint-plan-panel__close" onClick={onClose} aria-label="Κλείσιμο">
            ×
          </button>
        </header>

        <div className="checkpoint-plan-panel__body">
          <section className="checkpoint-plan-panel__section">
            <label className="checkpoint-plan-panel__label">
              Deadline
              <input
                type="date"
                className="input input--sm"
                value={checkpoint.planDate || ''}
                min={stage.planStartDate || undefined}
                max={stage.planEndDate || undefined}
                required
                onChange={(e) => {
                  const val = toDateString(e.target.value);
                  if (val) patch({ planDate: val });
                }}
              />
            </label>
          </section>

          <section className="checkpoint-plan-panel__section">
            <label className="checkpoint-plan-panel__label" htmlFor="cp-plan-desc">
              Περιγραφή
            </label>
            <textarea
              id="cp-plan-desc"
              className="input textarea"
              rows={3}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => {
                const val = descDraft.trim();
                if (val !== (checkpoint.description || '')) {
                  patch({ description: val });
                }
              }}
              placeholder="Τι πρέπει να επιτευχθεί…"
            />
          </section>

          <section className="checkpoint-plan-panel__section">
            <p className="checkpoint-plan-panel__hint">Ενέργειες μέσα στο checkpoint — όχι το ίδιο το αποτέλεσμα.</p>
            <CheckpointSubtasks
              variant="panel"
              items={items}
              onChange={(checklistItems) => patch({ checklistItems })}
            />
          </section>
        </div>

        <footer className="checkpoint-plan-panel__footer">
          <button
            type="button"
            className={`btn btn--sm ${done ? 'btn--outline' : 'btn--primary'}`}
            onClick={toggleComplete}
          >
            {done ? 'Επαναφορά checkpoint' : 'Ολοκλήρωση checkpoint'}
          </button>
        </footer>
      </div>
    </aside>
  );
}
