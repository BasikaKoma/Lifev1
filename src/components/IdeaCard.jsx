import { useState } from 'react';
import { getIdeaRecommendation } from '../utils/logic';
import { generateId } from '../data/templates';
import { CategorySelect, CategoryBadge } from './CategorySelect';
import { CheckpointLinkBadges, CheckpointLinkSelect } from './CheckpointLinkSelect';

const REC_CLASS = {
  'Do Now': 'rec-do-now',
  Park: 'rec-park',
  'Review Later': 'rec-review',
  Ignore: 'rec-ignore',
};

export function IdeaCard({ idea, stageId, stages = [], onUpdate }) {
  const recommendation = getIdeaRecommendation(idea);
  const icon = idea.status === 'Locked' ? '🔒' : idea.status === 'Ready' ? '🔓' : '✓';

  return (
    <div className={`card idea-card idea-card--${idea.status.toLowerCase()}`}>
      <div className="idea-card__header">
        <span className="idea-card__icon">{icon}</span>
        <h4 className="idea-card__title">{idea.title}</h4>
        {recommendation && (
          <span className={`badge badge--rec ${REC_CLASS[recommendation]}`}>{recommendation}</span>
        )}
      </div>
      {idea.description && <p className="idea-card__desc">{idea.description}</p>}
      {idea.reasonToWait && (
        <p className="idea-card__wait"><strong>Why wait:</strong> {idea.reasonToWait}</p>
      )}
      {idea.actionAfterUnlock && (
        <p className="idea-card__action"><strong>After unlock:</strong> {idea.actionAfterUnlock}</p>
      )}
      <CheckpointLinkBadges ids={idea.linkedCheckpointIds} stages={stages} />
      <div className="idea-card__badges">
        <CategoryBadge category={idea.category} />
        <span className="badge badge--impact">Impact: {idea.impact}</span>
        <span className="badge badge--effort">Effort: {idea.effort}</span>
        <span className="badge badge--timing">Timing: {idea.timing}</span>
        <span className="badge badge--status-sm">{idea.status}</span>
      </div>
      <div className="idea-card__category" style={{ marginTop: 8 }}>
        <CategorySelect
          value={idea.category || ''}
          onChange={(category) => onUpdate(stageId, idea.id, { category })}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <CheckpointLinkSelect
          stages={stages}
          value={idea.linkedCheckpointIds || []}
          onChange={(linkedCheckpointIds) => onUpdate(stageId, idea.id, { linkedCheckpointIds })}
        />
      </div>
      {idea.reviewDate && <p className="idea-card__review">Review: {idea.reviewDate}</p>}
      <div className="idea-card__actions">
        {idea.status === 'Ready' && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onUpdate(stageId, idea.id, { status: 'Executed' })}
          >
            Mark Executed
          </button>
        )}
        {idea.status === 'Locked' && !idea.unlockStageId && !idea.linkedCheckpointIds?.length && (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => onUpdate(stageId, idea.id, { status: 'Ready' })}
          >
            Mark Ready
          </button>
        )}
      </div>
    </div>
  );
}

export function AddIdeaForm({ stageId, stages, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    reasonToWait: '',
    unlockStageId: '',
    linkedCheckpointIds: [],
    actionAfterUnlock: '',
    impact: 'Medium',
    effort: 'Medium',
    timing: 'Too Early',
    reviewDate: '',
    category: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    onAdd(stageId, {
      id: generateId(),
      title: form.title.trim(),
      description: form.description,
      reasonToWait: form.reasonToWait,
      unlockStageId: form.unlockStageId || null,
      linkedCheckpointIds: form.linkedCheckpointIds || [],
      actionAfterUnlock: form.actionAfterUnlock,
      impact: form.impact,
      effort: form.effort,
      timing: form.timing,
      status: 'Locked',
      reviewDate: form.reviewDate || null,
      category: form.category || '',
    });

    setForm({
      title: '',
      description: '',
      reasonToWait: '',
      unlockStageId: '',
      linkedCheckpointIds: [],
      actionAfterUnlock: '',
      impact: 'Medium',
      effort: 'Medium',
      timing: 'Too Early',
      reviewDate: '',
      category: '',
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        + Add Idea
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input className="input" placeholder="Idea title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      <textarea className="input textarea" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      <textarea className="input textarea" placeholder="Reason to wait" value={form.reasonToWait} onChange={(e) => setForm({ ...form, reasonToWait: e.target.value })} rows={2} />
      <textarea className="input textarea" placeholder="Action after unlock" value={form.actionAfterUnlock} onChange={(e) => setForm({ ...form, actionAfterUnlock: e.target.value })} rows={2} />
      <select className="input" value={form.unlockStageId} onChange={(e) => setForm({ ...form, unlockStageId: e.target.value })}>
        <option value="">No unlock stage</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.title}</option>
        ))}
      </select>
      <CheckpointLinkSelect
        stages={stages}
        value={form.linkedCheckpointIds}
        onChange={(linkedCheckpointIds) => setForm({ ...form, linkedCheckpointIds })}
      />
      <div className="add-form__row">
        <select className="input" value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
          <option value="Low">Low Impact</option>
          <option value="Medium">Medium Impact</option>
          <option value="High">High Impact</option>
        </select>
        <select className="input" value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })}>
          <option value="Low">Low Effort</option>
          <option value="Medium">Medium Effort</option>
          <option value="High">High Effort</option>
        </select>
        <select className="input" value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })}>
          <option value="Too Early">Too Early</option>
          <option value="Ready">Ready</option>
          <option value="Late">Late</option>
        </select>
      </div>
      <input type="date" className="input" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
      <CategorySelect
        value={form.category || ''}
        onChange={(category) => setForm({ ...form, category })}
      />
      <div className="add-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">Add</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
