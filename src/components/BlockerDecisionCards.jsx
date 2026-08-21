import { useState } from 'react';
import { generateId } from '../data/templates';

export function BlockerCard({ blocker, stageId, onUpdate }) {
  return (
    <div className={`card blocker-card blocker-card--${blocker.severity.toLowerCase()}`}>
      <div className="blocker-card__header">
        <h4 className="blocker-card__title">{blocker.title}</h4>
        <span className={`badge badge--severity badge--${blocker.severity.toLowerCase()}`}>
          {blocker.severity}
        </span>
        <span className={`badge badge--status-sm badge--${blocker.status.toLowerCase()}`}>
          {blocker.status}
        </span>
      </div>
      {blocker.description && <p className="blocker-card__desc">{blocker.description}</p>}
      {blocker.status === 'Open' && (
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => onUpdate(stageId, blocker.id, { status: 'Resolved' })}
        >
          Mark Resolved
        </button>
      )}
    </div>
  );
}

export function AddBlockerForm({ stageId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'Medium' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onAdd(stageId, {
      id: generateId(),
      title: form.title.trim(),
      description: form.description,
      severity: form.severity,
      status: 'Open',
      relatedStageId: stageId,
    });
    setForm({ title: '', description: '', severity: 'Medium' });
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        + Add Blocker
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input className="input" placeholder="Blocker title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      <textarea className="input textarea" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
        <option value="Low">Low</option>
        <option value="Medium">Medium</option>
        <option value="Critical">Critical</option>
      </select>
      <div className="add-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">Add</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function DecisionCard({ decision, stageId, onUpdate }) {
  return (
    <div className="card decision-card">
      <div className="decision-card__header">
        <h4 className="decision-card__title">{decision.title}</h4>
        <span className={`badge badge--status-sm badge--${decision.status.toLowerCase()}`}>
          {decision.status}
        </span>
      </div>
      {decision.date && <p className="decision-card__date">Date: {decision.date}</p>}
      {decision.reason && <p className="decision-card__text"><strong>Reason:</strong> {decision.reason}</p>}
      {decision.optionsConsidered && (
        <p className="decision-card__text"><strong>Options:</strong> {decision.optionsConsidered}</p>
      )}
      {decision.expectedResult && (
        <p className="decision-card__text"><strong>Expected:</strong> {decision.expectedResult}</p>
      )}
      {decision.actualResult && (
        <p className="decision-card__text"><strong>Actual:</strong> {decision.actualResult}</p>
      )}
      {decision.reviewDate && <p className="decision-card__review">Review: {decision.reviewDate}</p>}
      {decision.status === 'Open' && (
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => onUpdate(stageId, decision.id, { status: 'Reviewed' })}
        >
          Mark Reviewed
        </button>
      )}
    </div>
  );
}

export function AddDecisionForm({ stageId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
    optionsConsidered: '',
    expectedResult: '',
    reviewDate: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onAdd(stageId, {
      id: generateId(),
      title: form.title.trim(),
      date: form.date,
      relatedStageId: stageId,
      reason: form.reason,
      optionsConsidered: form.optionsConsidered,
      expectedResult: form.expectedResult,
      reviewDate: form.reviewDate || null,
      actualResult: '',
      status: 'Open',
    });
    setForm({
      title: '',
      date: new Date().toISOString().slice(0, 10),
      reason: '',
      optionsConsidered: '',
      expectedResult: '',
      reviewDate: '',
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
        + Add Decision
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input className="input" placeholder="Decision title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <textarea className="input textarea" placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
      <textarea className="input textarea" placeholder="Options considered" value={form.optionsConsidered} onChange={(e) => setForm({ ...form, optionsConsidered: e.target.value })} rows={2} />
      <textarea className="input textarea" placeholder="Expected result" value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} rows={2} />
      <input type="date" className="input" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
      <div className="add-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">Add</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
