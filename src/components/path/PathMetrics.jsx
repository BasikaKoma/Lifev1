import { useMemo, useState } from 'react';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import { createEmptyMetric, goalColorStyle } from '../../lib/path/schema';
import { latestMetricValue, progressPercent } from '../../lib/path/logic';
import { MetricFields, PathModal } from './PathFields';

function trendBars(entries = []) {
  const values = [...entries]
    .filter((entry) => entry.value != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-8)
    .map((entry) => entry.value);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value) => 8 + ((value - min) / span) * 28);
}

function metricProgress(metric) {
  const current = latestMetricValue(metric);
  if (current == null || metric.target == null) return null;
  const start = metric.baseline == null ? 0 : metric.baseline;
  const span = metric.target - start;
  if (span === 0) return current === metric.target ? 1 : 0;
  if (metric.direction === 'Decrease') return (start - current) / (start - metric.target || span);
  if (metric.direction === 'Maintain') {
    const tolerance = Math.abs(metric.target) * 0.08 || 1;
    return Math.max(0, 1 - Math.abs(current - metric.target) / tolerance);
  }
  return (current - start) / span;
}

export function PathMetrics({ path }) {
  const [editor, setEditor] = useState(null);
  const [entryMetricId, setEntryMetricId] = useState(null);
  const [entry, setEntry] = useState({ date: localTodayIsoDate(), value: '', note: '' });

  const grouped = useMemo(() => ({
    Outcome: path.metrics.filter((metric) => metric.type === 'Outcome'),
    Action: path.metrics.filter((metric) => metric.type === 'Action'),
  }), [path.metrics]);

  const saveEntry = () => {
    if (!entryMetricId || entry.value === '') return;
    path.addMetricEntry(entryMetricId, {
      date: entry.date,
      value: Number(entry.value),
      note: entry.note || null,
    });
    setEntryMetricId(null);
    setEntry({ date: localTodayIsoDate(), value: '', note: '' });
  };

  return (
    <div>
      <div className="path-toolbar">
        <p className="path-empty">Outcome = results. Action = what you control. No combined score.</p>
        <button type="button" className="btn btn--primary" onClick={() => setEditor(createEmptyMetric({ name: '' }))}>
          New metric
        </button>
      </div>

      {['Outcome', 'Action'].map((type) => (
        <section key={type} style={{ marginTop: 20 }}>
          <h2 className="path-card__title">{type} metrics</h2>
          {grouped[type].length === 0 ? (
            <p className="path-empty" style={{ marginTop: 8 }}>No {type.toLowerCase()} metrics yet.</p>
          ) : (
            <div className="path-grid" style={{ marginTop: 12 }}>
              {grouped[type].map((metric) => {
                const current = latestMetricValue(metric);
                const progress = progressPercent(metricProgress(metric));
                const goal = path.goals.find((item) => item.id === metric.goalId);
                const bars = trendBars(metric.entries);
                return (
                  <article key={metric.id} className={`path-panel${goal?.color ? ' path-card--goal' : ''}`} style={goalColorStyle(goal?.color)}>
                    <div className="path-card__top">
                      <h3 className="path-card__title">{metric.name}</h3>
                      <span className="path-pill">{metric.direction}</span>
                    </div>
                    <p className="path-card__meta">
                      {current != null || metric.target != null
                        ? `${current ?? '—'} / ${metric.target ?? '—'}${metric.unit ? ` ${metric.unit}` : ''}`
                        : 'No entries yet'}
                    </p>
                    <p className="path-card__meta">{goal?.title || 'Unlinked'} · {metric.frequency}</p>
                    <div className="path-progress" aria-hidden>
                      <span style={{ width: `${progress ?? 0}%` }} />
                    </div>
                    <div className="path-trend" aria-hidden>
                      {bars.map((height, index) => (
                        <span key={`${metric.id}-${index}`} style={{ height }} />
                      ))}
                    </div>
                    <div className="path-view__actions">
                      <button type="button" className="btn" onClick={() => { setEntryMetricId(metric.id); setEntry({ date: localTodayIsoDate(), value: '', note: '' }); }}>
                        Add entry
                      </button>
                      <button type="button" className="btn" onClick={() => setEditor(metric)}>Edit</button>
                      <button type="button" className="btn" onClick={() => path.removeMetric(metric.id)}>Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <PathModal open={Boolean(editor)} title={editor && path.metrics.some((metric) => metric.id === editor.id) ? 'Edit metric' : 'New metric'} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <MetricFields
              metric={editor}
              goals={path.goals.filter((goal) => goal.status !== 'Archived')}
              onChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))}
            />
            <div className="path-modal__actions">
              <button type="button" className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  if (!editor.name?.trim()) return;
                  path.upsertMetric(editor);
                  setEditor(null);
                }}
                disabled={!editor.name?.trim()}
              >
                Save metric
              </button>
            </div>
          </>
        ) : null}
      </PathModal>

      <PathModal open={Boolean(entryMetricId)} title="Log entry" onClose={() => setEntryMetricId(null)}>
        <div className="path-form">
          <label className="path-field">
            <span>Date</span>
            <input className="input" type="date" value={entry.date} onChange={(event) => setEntry((prev) => ({ ...prev, date: event.target.value }))} />
          </label>
          <label className="path-field">
            <span>Value</span>
            <input className="input" type="number" value={entry.value} onChange={(event) => setEntry((prev) => ({ ...prev, value: event.target.value }))} />
          </label>
          <label className="path-field path-field--wide">
            <span>Note</span>
            <input className="input" value={entry.note} onChange={(event) => setEntry((prev) => ({ ...prev, note: event.target.value }))} />
          </label>
        </div>
        <div className="path-modal__actions">
          <button type="button" className="btn" onClick={() => setEntryMetricId(null)}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={saveEntry} disabled={entry.value === ''}>Save entry</button>
        </div>
      </PathModal>
    </div>
  );
}
