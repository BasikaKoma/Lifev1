import { kindLabel, PIPELINE_STAGES } from '../../lib/brand/schema';

export function BrandIdeas({ items, signals, onOpen, onFromSignal }) {
  const ideas = items.filter((item) => item.stage === 'idea');
  return (
    <div className="brand-list">
      <section className="brand-card">
        <h2 className="brand-card__title">Idea Inbox</h2>
        <p className="brand-empty" style={{ marginTop: 8 }}>
          Ό,τι πιάνεις στο Quick Capture μένει εδώ. Δεν γίνεται draft μέχρι να το επιλέξεις.
        </p>
      </section>
      {!ideas.length && (
        <p className="brand-empty">Το inbox είναι άδειο. Κάτι που έζησες σήμερα είναι καλύτερο από οποιαδήποτε λίστα ιδεών.</p>
      )}
      {ideas.map((item) => (
        <article key={item.id} className="brand-idea">
          <div>
            <h3>{item.title || 'Untitled'}</h3>
            <p>{item.body}</p>
            <p>{kindLabel(item.kind)} · {item.sourceLabel || 'Capture'}</p>
          </div>
          <button type="button" className="brand-btn brand-btn--outline" onClick={() => onOpen(item)}>
            Open
          </button>
        </article>
      ))}
      {signals.length > 0 && (
        <section className="brand-card">
          <h2 className="brand-card__title">Signals waiting</h2>
          {signals.map((signal) => (
            <button key={signal.id} type="button" className="brand-signal" onClick={() => onFromSignal(signal)}>
              <span>
                <p className="brand-signal__title">{signal.title}</p>
                <p className="brand-signal__meta">{signal.sourceLabel} · {signal.angle}</p>
              </span>
              <span className="brand-signal__arrow">Create post</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

export function BrandPipeline({ pipeline, onOpen, onMove }) {
  return (
    <div className="brand-kanban">
      {PIPELINE_STAGES.map((stage) => (
        <section key={stage.id} className="brand-kanban__col">
          <h3>{stage.label} · {(pipeline[stage.id] || []).length}</h3>
          {(pipeline[stage.id] || []).map((item) => (
            <article key={item.id} className="brand-idea" style={{ gridTemplateColumns: '1fr' }}>
              <button type="button" className="brand-link" onClick={() => onOpen(item)}>
                {item.title || item.body.slice(0, 72) || 'Untitled'}
              </button>
              <p>{item.sourceLabel}</p>
              <div className="brand-draft__actions">
                {PIPELINE_STAGES.filter((row) => row.id !== stage.id).slice(0, 3).map((row) => (
                  <button key={row.id} type="button" className="brand-btn brand-btn--ghost" onClick={() => onMove(item.id, row.id)}>
                    {row.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export function BrandLibrary({ items, onOpen }) {
  const published = items.filter((item) => item.stage === 'published');
  return (
    <div className="brand-list">
      <section className="brand-card">
        <h2 className="brand-card__title">Published</h2>
        <p className="brand-empty" style={{ marginTop: 8 }}>
          Προηγούμενα posts μένουν εδώ, μέσα στο Brand DNA — όχι στο μοντέλο.
        </p>
      </section>
      {!published.length && <p className="brand-empty">Δεν έχει δημοσιευτεί τίποτα ακόμα.</p>}
      {published.map((item) => (
        <article key={item.id} className="brand-idea">
          <div>
            <h3>{item.title}</h3>
            <p>{item.body.slice(0, 180)}</p>
          </div>
          <button type="button" className="brand-btn brand-btn--ghost" onClick={() => onOpen(item)}>Open</button>
        </article>
      ))}
    </div>
  );
}
