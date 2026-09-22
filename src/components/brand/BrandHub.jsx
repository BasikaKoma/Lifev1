import { CAPTURE_KINDS, kindLabel, PIPELINE_STAGES, platformLabel, verdictLabel } from '../../lib/brand/schema';
import { NARRATIVE_THREADS } from '../../lib/brand/threads';
import { isOpenAiConfigured } from '../../lib/openai';
import { metaStatusHint, metaStatusLabel } from '../../lib/meta';

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
  captureText,
  captureKind,
  recording,
  transcribing,
  briefs = {},
  threads = [],
  metaStatus,
  onCaptureText,
  onCaptureKind,
  onCapture,
  onToggleMic,
  onOpenSignal,
  onContinueDraft,
  onAskBrain,
  onVariations,
  onViewPipeline,
  onOpenThread,
  onManageMeta,
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
          {signals.slice(0, 6).map((signal) => {
            const brief = briefs[signal.id];
            const chip = brief?.platform || signal.angle;
            return (
              <button key={signal.id} type="button" className="brand-signal" onClick={() => onOpenSignal(signal)}>
                <span>
                  <p className="brand-signal__title">{signal.title}</p>
                  <p className="brand-signal__meta">
                    {signal.threadTitle ? (
                      <span className="brand-chip brand-chip--thread">{signal.threadTitle}</span>
                    ) : null}
                    <span className={chipClass(chip)}>
                      {brief ? platformLabel(brief.platform) : signal.angle.split('/')[0].trim()}
                    </span>
                    {' · '}
                    {signal.sourceLabel}
                  </p>
                </span>
                <span className="brand-signal__arrow" aria-hidden>→</span>
              </button>
            );
          })}
          {signals.length > 6 && (
            <button type="button" className="brand-link" onClick={onViewPipeline}>Όλα στο Pipeline</button>
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
          <div className="brand-meta">
            <p className="brand-meta__label">Meta</p>
            <div className="brand-meta__row">
              <span className="brand-meta__accounts">{metaStatusLabel(metaStatus)}</span>
              <button type="button" className="brand-link" onClick={onManageMeta}>
                {metaStatus?.connected ? 'Manage' : 'Connect'}
              </button>
            </div>
            {metaStatusHint(metaStatus) ? (
              <p className="brand-meta__hint">{metaStatusHint(metaStatus)}</p>
            ) : null}
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

      <section className="brand-card brand-capture">
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
          <h2 className="brand-card__title">Ιστορίες</h2>
        </div>
        <p className="brand-empty">
          Τα 7 ημέρες είναι για φρέσκα signals. Εδώ φαίνεται η εξέλιξη των ίδιων ιστοριών στον χρόνο.
        </p>
        <div className="brand-weekly" style={{ marginTop: 12 }}>
          {threads.map((thread) => {
            const latest = thread.beats?.[0];
            return (
              <button
                key={thread.id}
                type="button"
                className="brand-weekly__item brand-thread"
                onClick={() => onOpenThread?.(thread)}
              >
                <h4>{thread.title}</h4>
                <p>
                  {thread.beats?.length
                    ? `${thread.beats.length} ${thread.beats.length === 1 ? 'σημείο' : 'σημεία'}`
                    : 'Δεν έχει συνδεθεί ακόμα σήμα'}
                  {latest ? ` · ${latest.date || ''} ${latest.summary}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function SignalDetail({
  signal,
  brief,
  thread,
  busy,
  onCreate,
  onDevelop,
  onAssignThread,
  onClose,
}) {
  if (!signal) return null;
  const openAi = isOpenAiConfigured();
  const developing = busy === 'develop';

  return (
    <section className="brand-card">
      <div className="brand-card__head">
        <h2 className="brand-card__title">Signal</h2>
        <button type="button" className="brand-link" onClick={onClose}>Πίσω</button>
      </div>
      <h3 className="brand-draft__title">{signal.title}</h3>
      <p className="brand-draft__body"><strong>Τι γράφτηκε. </strong>{signal.what}</p>
      {signal.context ? <p className="brand-signal__meta">{signal.context}</p> : null}
      <p className="brand-signal__meta">Από: {signal.sourceLabel} · {kindLabel(signal.kind)}</p>
      <div className="brand-brief" style={{ marginTop: 12 }}>
        <p className="brand-card__title">Ιστορία</p>
        {thread ? (
          <>
            <h3 className="brand-draft__title" style={{ fontSize: '1.05rem', marginTop: 8 }}>{thread.title}</h3>
            <p className="brand-draft__body">{thread.story}</p>
            {thread.beats?.length ? (
              <div className="brand-weekly">
                {thread.beats.slice(0, 5).map((beat) => (
                  <article key={beat.id} className="brand-weekly__item">
                    <h4>{beat.date || '—'}</h4>
                    <p>{beat.summary}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="brand-empty" style={{ marginTop: 8 }}>Διάλεξε σε ποια ιστορία ανήκει αυτή η σκέψη.</p>
        )}
        <div className="brand-platforms" style={{ marginTop: 10 }}>
          {NARRATIVE_THREADS.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={thread?.id === row.id}
              onClick={() => onAssignThread?.(signal, row.id)}
            >
              {row.title}
            </button>
          ))}
        </div>
      </div>

      <div className="brand-brief">
        <div className="brand-card__head">
          <h3 className="brand-card__title">Κρίση για post</h3>
          {brief ? (
            <span className={`brand-verdict brand-verdict--${brief.verdict}`}>{verdictLabel(brief.verdict)}</span>
          ) : null}
        </div>
        {!openAi ? (
          <p className="brand-empty">Βάλε OpenAI key στις ρυθμίσεις για να κριθεί πώς γίνεται καλύτερο post και πού.</p>
        ) : developing && !brief ? (
          <p className="brand-empty">Κρίνει τη σκέψη και ψάχνει πού ταιριάζει…</p>
        ) : brief ? (
          <div className="brand-brief__body">
            {brief.core ? (
              <p className="brand-draft__body"><strong>Το ενδιαφέρον. </strong>{brief.core}</p>
            ) : null}
            {brief.develop ? (
              <p className="brand-draft__body"><strong>Πώς να το αναπτύξεις. </strong>{brief.develop}</p>
            ) : null}
            {brief.missing ? (
              <p className="brand-draft__body"><strong>Τι λείπει. </strong>{brief.missing}</p>
            ) : null}
            {brief.betterPost ? (
              <p className="brand-draft__body"><strong>Καλύτερο post. </strong>{brief.betterPost}</p>
            ) : null}
            <div className="brand-brief__platform">
              <span className={chipClass(brief.platform)}>{platformLabel(brief.platform)}</span>
              {brief.also.map((id) => (
                <span key={id} className={chipClass(id)}>{platformLabel(id)}</span>
              ))}
              {brief.platformWhy ? <p>{brief.platformWhy}</p> : null}
            </div>
            {brief.hook ? (
              <p className="brand-draft__body"><strong>Hook. </strong>{brief.hook}</p>
            ) : null}
          </div>
        ) : (
          <p className="brand-empty">
            Πάτα «Κρίνε» για να δεις πώς αναπτύσσεται και σε ποια πλατφόρμα αξίζει.
          </p>
        )}
      </div>

      <div className="brand-draft__actions" style={{ marginTop: 12 }}>
        <button type="button" className="brand-btn brand-btn--green" onClick={() => onCreate(signal)}>
          Create post
        </button>
        {openAi ? (
          <button
            type="button"
            className="brand-btn brand-btn--ghost"
            disabled={developing}
            onClick={() => onDevelop?.(signal, { force: Boolean(brief) })}
          >
            {developing ? 'Κρίνει…' : brief ? 'Κρίνε ξανά' : 'Κρίνε'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ThreadDetail({ thread, items = [], onOpenItem, onClose }) {
  if (!thread) return null;
  const related = (items || []).filter((item) => item.threadId === thread.id);
  return (
    <section className="brand-card">
      <div className="brand-card__head">
        <h2 className="brand-card__title">Ιστορία</h2>
        <button type="button" className="brand-link" onClick={onClose}>Πίσω</button>
      </div>
      <h3 className="brand-draft__title">{thread.title}</h3>
      <p className="brand-draft__body">{thread.story}</p>
      <div className="brand-weekly">
        {(thread.beats || []).map((beat) => (
          <article key={beat.id} className="brand-weekly__item">
            <h4>{beat.date || '—'}</h4>
            <p>{beat.summary}</p>
          </article>
        ))}
      </div>
      {!thread.beats?.length ? (
        <p className="brand-empty">Όταν ένα signal ή μια σκέψη ταιριάζει εδώ, θα μείνει ως κεφάλαιο.</p>
      ) : null}
      {related.length > 0 && (
        <div className="brand-draft__actions" style={{ marginTop: 12 }}>
          {related.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              className="brand-btn brand-btn--ghost"
              onClick={() => onOpenItem?.(item)}
            >
              {item.title || item.body.slice(0, 40)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
