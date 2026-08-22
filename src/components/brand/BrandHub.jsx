import { CAPTURE_KINDS, kindLabel, PIPELINE_STAGES } from '../../lib/brand/schema';
import { isOpenAiConfigured } from '../../lib/openai';

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function MicIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={active ? 'currentColor' : 'none'} />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

function chipClass(angle = '') {
  if (/reel/i.test(angle)) return 'brand-chip brand-chip--reel';
  if (/\bx\b|twitter/i.test(angle)) return 'brand-chip brand-chip--x';
  return 'brand-chip brand-chip--linkedin';
}

function platformMark(id) {
  if (id === 'linkedin') return 'in';
  if (id === 'facebook') return 'f';
  if (id === 'instagram') return 'ig';
  if (id === 'x') return 'X';
  if (id === 'reel') return '▶';
  return '•';
}

export function BrandHub({
  signals,
  activeDraft,
  pipeline,
  stats,
  balance,
  weekly,
  captureText,
  captureKind,
  recording,
  transcribing,
  weeklyAi,
  onCaptureText,
  onCaptureKind,
  onCapture,
  onToggleMic,
  onOpenSignal,
  onContinueDraft,
  onAskBrain,
  onVariations,
  onViewPipeline,
  onViewSignals,
}) {
  const openAi = isOpenAiConfigured();

  return (
    <div className="brand-hub">
      <div className="brand-hub__top">
        <section className="brand-card">
          <div className="brand-card__head">
            <h2 className="brand-card__title">Content Signals</h2>
          </div>
          {!signals.length && (
            <p className="brand-empty">
              Δεν εντοπίστηκαν ακόμα γεγονότα από τις τελευταίες ημέρες. Γράψε κάτι στο Quick Capture — όχι generic ιδέες.
            </p>
          )}
          {signals.slice(0, 4).map((signal) => (
            <button key={signal.id} type="button" className="brand-signal" onClick={() => onOpenSignal(signal)}>
              <span>
                <p className="brand-signal__title">{signal.title}</p>
                <p className="brand-signal__meta">
                  <span className={chipClass(signal.angle)}>{signal.angle.split('/')[0].trim()}</span>
                  {' · '}
                  {signal.sourceLabel}
                </p>
              </span>
              <span className="brand-signal__arrow" aria-hidden>→</span>
            </button>
          ))}
          {signals.length > 0 && (
            <button type="button" className="brand-link" onClick={onViewSignals}>View all signals</button>
          )}
        </section>

        <section className="brand-card">
          <p className="brand-draft__kicker">Active Draft</p>
          {activeDraft ? (
            <>
              <h2 className="brand-draft__title">{activeDraft.title || 'Untitled draft'}</h2>
              <p className="brand-draft__body">
                {activeDraft.hook || activeDraft.body || 'Δεν υπάρχει ακόμα κείμενο. Continue writing από την πραγματική εμπειρία.'}
              </p>
              <div className="brand-draft__platforms">
                {(activeDraft.platforms.length ? activeDraft.platforms : ['linkedin']).map((id) => (
                  <span key={id}>{platformMark(id)}</span>
                ))}
              </div>
              <div className="brand-progress" aria-label={`${activeDraft.progress}%`}>
                <span style={{ width: `${activeDraft.progress}%` }} />
              </div>
              <div className="brand-draft__actions">
                <button type="button" className="brand-btn brand-btn--green" onClick={() => onContinueDraft()}>
                  <PenIcon /> Continue writing
                </button>
                <button type="button" className="brand-btn brand-btn--ghost" onClick={onAskBrain} disabled={!openAi}>
                  Ask Brain
                </button>
                <button type="button" className="brand-btn brand-btn--ghost" onClick={onVariations} disabled={!openAi}>
                  Create variations
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="brand-draft__title">Δεν δουλεύεις κάποιο post τώρα</h2>
              <p className="brand-draft__body">
                Διάλεξε ένα signal ή μια ιδέα από τη ζωή σου. Το AI θα προσαρμόσει — δεν θα εφεύρει θέμα.
              </p>
            </>
          )}
        </section>

        <section className="brand-card">
          <div className="brand-card__head">
            <h2 className="brand-card__title">This Week</h2>
          </div>
          <div className="brand-week__stats">
            <div className="brand-week__row"><span>Ideas</span><strong>{stats.ideas}</strong></div>
            <div className="brand-week__row"><span>Drafts</span><strong>{stats.drafts}</strong></div>
            <div className="brand-week__row"><span>Published</span><strong>{stats.published}</strong></div>
          </div>
          <div className="brand-ring-wrap">
            <div className="brand-ring" style={{ '--p': stats.consistency }} data-label={`${stats.consistency}%`} />
            <p>Keep showing up.</p>
          </div>
        </section>
      </div>

      <section className="brand-card">
        <div className="brand-card__head">
          <h2 className="brand-card__title">Content Pipeline</h2>
          <button type="button" className="brand-link" onClick={onViewPipeline}>View all</button>
        </div>
        <div className="brand-pipeline">
          {PIPELINE_STAGES.map((stage) => {
            const cards = pipeline[stage.id] || [];
            return (
              <div key={stage.id} className="brand-pipeline__stage">
                <p className="brand-pipeline__label">
                  {stage.label}
                  <span className="brand-pipeline__count">{cards.length}</span>
                </p>
                <p className="brand-pipeline__hint">{stage.hint}</p>
                {cards.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="brand-pipeline__card"
                    onClick={() => onContinueDraft(item)}
                  >
                    {item.title || item.body.slice(0, 60)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <div className="brand-hub__mid">
        <section className="brand-card">
          <div className="brand-card__head">
            <h2 className="brand-card__title">Quick Capture</h2>
          </div>
          <p className="brand-empty" style={{ marginBottom: 10 }}>
            Τι έγινε σήμερα που ίσως αξίζει να μοιραστείς;
          </p>
          <div className="brand-capture__field">
            <textarea
              id="brand-capture"
              value={captureText}
              onChange={(event) => onCaptureText(event.target.value)}
              placeholder="What happened today that is worth sharing?"
            />
            <button
              type="button"
              className="brand-btn brand-btn--icon"
              onClick={onToggleMic}
              aria-label={recording ? 'Stop recording' : 'Record'}
              disabled={transcribing}
            >
              <MicIcon active={recording} />
            </button>
            <button type="button" className="brand-btn brand-btn--green" onClick={onCapture} disabled={!captureText.trim()}>
              Capture
            </button>
          </div>
          <div className="brand-kinds">
            {CAPTURE_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                aria-pressed={captureKind === kind.id}
                onClick={() => onCaptureKind(kind.id)}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </section>

        <section className="brand-card">
          <div className="brand-card__head">
            <h2 className="brand-card__title">Brand Balance</h2>
          </div>
          {balance.bars.map((bar) => (
            <div key={bar.id} className="brand-balance__row">
              <span>{bar.label}</span>
              <strong>{bar.value}%</strong>
              <div className="brand-balance__track">
                <span style={{ width: `${bar.value}%` }} />
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className="brand-card">
        <div className="brand-card__head">
          <h2 className="brand-card__title">Weekly Direction</h2>
        </div>
        <p className="brand-empty">{weeklyAi?.headline || weekly.headline}</p>
        <div className="brand-weekly">
          {(weeklyAi?.directions || weekly.directions).map((item) => (
            <article key={item.id || item.title} className="brand-weekly__item">
              <h4>{item.title}</h4>
              <p>{item.why} {item.sourceLabel ? `· ${item.sourceLabel}` : ''}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SignalDetail({ signal, onCreate, onClose }) {
  if (!signal) return null;
  return (
    <section className="brand-card">
      <div className="brand-card__head">
        <h2 className="brand-card__title">Signal</h2>
        <button type="button" className="brand-link" onClick={onClose}>Close</button>
      </div>
      <h3 className="brand-draft__title">{signal.title}</h3>
      <p className="brand-draft__body"><strong>Τι συνέβη. </strong>{signal.what}</p>
      <p className="brand-draft__body"><strong>Γιατί αξίζει. </strong>{signal.why}</p>
      <p className="brand-draft__body"><strong>Οπτική. </strong>{signal.angle}</p>
      <p className="brand-signal__meta">Από: {signal.sourceLabel} · {kindLabel(signal.kind)}</p>
      <div className="brand-draft__actions" style={{ marginTop: 12 }}>
        <button type="button" className="brand-btn brand-btn--green" onClick={() => onCreate(signal)}>
          Create post
        </button>
      </div>
    </section>
  );
}
