import { useEffect, useRef, useState } from 'react';
import {
  analyzePlanText,
  clearImportDraft,
  createBlankDraftGoal,
  extractPdfText,
  loadImportDraft,
  mergeDrafts,
  refreshDraft,
  saveImportDraft,
} from '../../lib/path/importPlan';
import { goalColorStyle } from '../../lib/path/schema';
import { GoalFields } from './PathFields';

export function PathImportPlan({ path, projects = [], onClose, onCreated }) {
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [draft, setDraft] = useState(() => loadImportDraft());
  const [phase, setPhase] = useState(() => (loadImportDraft() ? 'review' : 'pick'));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [selectedMerge, setSelectedMerge] = useState([]);

  useEffect(() => {
    if (draft?.drafts?.length) saveImportDraft(draft);
  }, [draft]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const cancelAnalyze = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(draft ? 'review' : 'pick');
    setStatus('');
    setError(draft ? '' : 'Η ανάλυση ακυρώθηκε.');
  };

  const processFile = async (file) => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setPhase('upload');
    setStatus('Uploading PDF…');
    try {
      setPhase('extract');
      setStatus('Extracting text…');
      const text = await extractPdfText(file);
      if (controller.signal.aborted) return;
      setPhase('analyze');
      setStatus('Analyzing plan with Brain…');
      const next = await analyzePlanText(text, { projects, signal: controller.signal });
      if (controller.signal.aborted) return;
      saveImportDraft(next);
      setDraft(next);
      setPhase('review');
      setStatus('');
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        setPhase(draft ? 'review' : 'pick');
        setStatus('');
        return;
      }
      setError(err.message || 'Import failed.');
      setPhase(draft ? 'review' : 'pick');
      setStatus('');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const updateDraftGoal = (draftId, patch) => {
    setDraft((prev) => ({
      ...prev,
      drafts: prev.drafts.map((item) => (item.draftId === draftId ? refreshDraft(item, patch) : item)),
    }));
  };

  const createGoals = () => {
    const created = path.createImportedGoals(draft.drafts, draft.plan);
    if (!created.length) {
      setError('Select at least one goal with a title.');
      return;
    }
    clearImportDraft();
    onCreated?.();
  };

  if (phase !== 'review') {
    return (
      <section className="path-panel">
        <div className="path-card__top">
          <div>
            <h2 className="path-card__title">Import Plan</h2>
            <p className="path-empty">
              {draft
                ? 'A review is already saved. Continue it, or upload a new PDF to replace it.'
                : 'Upload a PDF. The review stays saved until you create the goals.'}
            </p>
          </div>
          <button type="button" className="btn" onClick={phase === 'pick' ? onClose : cancelAnalyze}>
            {phase === 'pick' ? 'Back' : 'Cancel'}
          </button>
        </div>
        {error ? <p className="path-error">{error}</p> : null}
        {phase === 'pick' ? (
          <div
            className={`path-dropzone${over ? ' path-dropzone--over' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              processFile(event.dataTransfer.files?.[0]);
            }}
          >
            <p>Drop a PDF here or</p>
            <div className="path-view__actions" style={{ justifyContent: 'center', marginTop: 12 }}>
              {draft ? (
                <button type="button" className="btn" onClick={() => setPhase('review')}>Continue review</button>
              ) : null}
              <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
                Choose PDF
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(event) => processFile(event.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="path-import-status">
            <div className="app-loading__spinner" />
            <p>{status}</p>
            <button type="button" className="btn" onClick={cancelAnalyze}>Cancel</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="path-toolbar">
        <div>
          <h2 className="path-card__title">Review imported goals</h2>
          <p className="path-empty">This review stays saved until you press Create Goals. Refresh is safe. Empty fields stay empty — fill only what you know.</p>
        </div>
        <div className="path-view__actions">
          <button type="button" className="btn" onClick={() => { setPhase('pick'); setError(''); }}>New PDF</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={createGoals}>Create Goals</button>
        </div>
      </div>
      {error ? <p className="path-error">{error}</p> : null}

      <section className="path-panel" style={{ marginTop: 16 }}>
        <div className="path-form">
          <label className="path-field">
            <span>Plan title</span>
            <input className="input" value={draft.plan.title || ''} onChange={(event) => setDraft((prev) => ({ ...prev, plan: { ...prev.plan, title: event.target.value } }))} />
          </label>
          <label className="path-field">
            <span>Start date</span>
            <input className="input" type="date" value={draft.plan.startDate || ''} onChange={(event) => setDraft((prev) => ({ ...prev, plan: { ...prev.plan, startDate: event.target.value || null } }))} />
          </label>
          <label className="path-field">
            <span>End date</span>
            <input className="input" type="date" value={draft.plan.endDate || ''} onChange={(event) => setDraft((prev) => ({ ...prev, plan: { ...prev.plan, endDate: event.target.value || null } }))} />
          </label>
        </div>
      </section>

      <div className="path-toolbar" style={{ marginTop: 16 }}>
        <div className="path-view__actions">
          <button
            type="button"
            className="btn"
            onClick={() => setDraft((prev) => ({
              ...prev,
              drafts: [...prev.drafts, createBlankDraftGoal(prev.drafts.map((item) => item.goal))],
            }))}
          >
            Add goal
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedMerge.length < 2}
            onClick={() => {
              setDraft((prev) => ({ ...prev, drafts: mergeDrafts(prev.drafts, selectedMerge) }));
              setSelectedMerge([]);
            }}
          >
            Merge selected
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {draft.drafts.map((item) => (
          <article
            key={item.draftId}
            className={`path-import-card${item.selected ? '' : ' path-import-card--off'}${item.goal.color ? ' path-card--goal' : ''}`}
            style={goalColorStyle(item.goal.color)}
          >
            <div className="path-import-card__head">
              <label className="path-check">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    drafts: prev.drafts.map((draftItem) => (
                      draftItem.draftId === item.draftId
                        ? { ...draftItem, selected: event.target.checked }
                        : draftItem
                    )),
                  }))}
                />
                Import this goal
              </label>
              <label className="path-check">
                <input
                  type="checkbox"
                  checked={selectedMerge.includes(item.draftId)}
                  onChange={(event) => setSelectedMerge((prev) => (
                    event.target.checked ? [...prev, item.draftId] : prev.filter((id) => id !== item.draftId)
                  ))}
                />
                Merge
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => setDraft((prev) => ({
                  ...prev,
                  drafts: prev.drafts.filter((draftItem) => draftItem.draftId !== item.draftId),
                }))}
              >
                Delete
              </button>
            </div>
            {item.missing.length ? (
              <p className="path-field__hint">Needs completion: {item.missing.join(', ')}</p>
            ) : null}
            <GoalFields
              goal={item.goal}
              projects={projects}
              highlightMissing
              showStatus={false}
              showCurrent={false}
              onChange={(patch) => updateDraftGoal(item.draftId, patch)}
            />
            {item.metrics.length ? (
              <p className="path-card__meta">
                Metrics ready: {item.metrics.map((metric) => `${metric.type} ${metric.name}`).join(' · ')}
              </p>
            ) : null}
            {item.templates.length ? (
              <p className="path-card__meta">
                Recurring blocks: {item.templates.map((template) => template.title).join(' · ')}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
