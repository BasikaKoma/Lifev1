import { kindLabel, PIPELINE_STAGES } from '../../lib/brand/schema';
import { threadTitle } from '../../lib/brand/threads';

export function BrandPipeline({ pipeline, onOpen, onMove }) {
  return (
    <div className="brand-kanban">
      {PIPELINE_STAGES.map((stage) => {
        const cards = pipeline[stage.id] || [];
        return (
          <section key={stage.id} className="brand-kanban__col">
            <h3>{stage.label} · {cards.length}</h3>
            <p className="brand-pipeline__hint">{stage.hint}</p>
            {!cards.length && (
              <p className="brand-empty">
                {stage.id === 'idea'
                  ? 'Ό,τι πιάνεις στο Quick Capture μένει εδώ.'
                  : stage.id === 'published'
                    ? 'Όσα βγήκαν στον κόσμο μένουν εδώ.'
                    : 'Άδειο.'}
              </p>
            )}
            {cards.map((item) => (
              <article key={item.id} className="brand-idea" style={{ gridTemplateColumns: '1fr' }}>
                <button type="button" className="brand-link" onClick={() => onOpen(item)}>
                  {item.title || item.body.slice(0, 72) || 'Untitled'}
                </button>
                <p>
                  {kindLabel(item.kind)}
                  {item.threadId ? ` · ${threadTitle(item.threadId)}` : ''}
                  {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
                </p>
                <div className="brand-draft__actions">
                  {PIPELINE_STAGES.filter((row) => row.id !== stage.id).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="brand-btn brand-btn--ghost"
                      onClick={() => onMove(item.id, row.id)}
                    >
                      {row.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
