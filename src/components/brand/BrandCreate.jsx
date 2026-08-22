import { useState } from 'react';
import { BRAND_PLATFORMS, PIPELINE_STAGES, kindLabel } from '../../lib/brand/schema';
import { isOpenAiConfigured } from '../../lib/openai';

export function BrandCreate({
  item,
  busy,
  onChange,
  onMove,
  onGenerate,
  onVariations,
  onAsk,
  onDelete,
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const openAi = isOpenAiConfigured();

  if (!item) {
    return (
      <section className="brand-card">
        <h2 className="brand-draft__title">Διάλεξε μια ιδέα από πραγματικό γεγονός</h2>
        <p className="brand-empty">
          Το Create ξεκινά από Idea Inbox ή από Content Signal. Δεν γεννά θέματα από το πουθενά.
        </p>
      </section>
    );
  }

  const togglePlatform = (id) => {
    const has = item.platforms.includes(id);
    onChange({
      ...item,
      platforms: has ? item.platforms.filter((row) => row !== id) : [...item.platforms, id],
    });
  };

  return (
    <div className="brand-create">
      <div className="brand-create__main">
        <section className="brand-card">
          <label htmlFor="brand-title">Title / core idea</label>
          <input id="brand-title" value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
        </section>
        <section className="brand-card">
          <label htmlFor="brand-hook">Hook</label>
          <textarea id="brand-hook" rows={3} value={item.hook} onChange={(event) => onChange({ ...item, hook: event.target.value })} />
        </section>
        <section className="brand-card">
          <label htmlFor="brand-body">Draft</label>
          <textarea id="brand-body" rows={12} value={item.body} onChange={(event) => onChange({ ...item, body: event.target.value })} />
          {item.why ? <p className="brand-empty">Γιατί αξίζει: {item.why}</p> : null}
          {item.sourceLabel ? <p className="brand-empty">Πηγή: {item.sourceLabel} · {kindLabel(item.kind)}</p> : null}
        </section>
      </div>

      <aside className="brand-create__side">
        <section className="brand-card">
          <p className="brand-card__title">Progress · {item.progress}%</p>
          <div className="brand-progress" style={{ marginTop: 10 }}>
            <span style={{ width: `${item.progress}%` }} />
          </div>
        </section>
        <section className="brand-card">
          <p className="brand-card__title">Platforms</p>
          <div className="brand-platforms" style={{ marginTop: 10 }}>
            {BRAND_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                type="button"
                aria-pressed={item.platforms.includes(platform.id)}
                onClick={() => togglePlatform(platform.id)}
              >
                {platform.label}
              </button>
            ))}
          </div>
        </section>
        <section className="brand-card">
          <p className="brand-card__title">Stage</p>
          <div className="brand-platforms" style={{ marginTop: 10 }}>
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                aria-pressed={item.stage === stage.id}
                onClick={() => onMove(item.id, stage.id)}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </section>
        <section className="brand-card">
          <p className="brand-card__title">From this experience</p>
          <div className="brand-draft__actions" style={{ marginTop: 10 }}>
            <button type="button" className="brand-btn brand-btn--green" disabled={!openAi || Boolean(busy)} onClick={() => onGenerate(item, 'linkedin')}>
              {busy === 'draft' ? 'Writing…' : 'Write LinkedIn'}
            </button>
            <button type="button" className="brand-btn brand-btn--ghost" disabled={!openAi || Boolean(busy)} onClick={() => onVariations(item)}>
              {busy === 'variations' ? 'Working…' : 'Create variations'}
            </button>
          </div>
        </section>
        <section className="brand-card">
          <p className="brand-card__title">Ask Brain</p>
          <textarea
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Π.χ. κάνε πιο κοφτερό το hook χωρίς να φύγεις από το γεγονός."
          />
          <button
            type="button"
            className="brand-btn brand-btn--outline"
            disabled={!openAi || !question.trim() || Boolean(busy)}
            onClick={async () => {
              const text = await onAsk(item, question);
              if (text) setAnswer(text);
            }}
          >
            {busy === 'brain' ? 'Thinking…' : 'Ask'}
          </button>
          {answer ? <div className="brand-assist">{answer}</div> : null}
        </section>
        {item.variations && Object.keys(item.variations).length > 0 && (
          <section className="brand-card">
            <p className="brand-card__title">Variations</p>
            {Object.entries(item.variations).map(([key, value]) => (
              <div key={key} className="brand-weekly__item">
                <h4>{key}</h4>
                <p>{Array.isArray(value) ? value.join(' · ') : String(value)}</p>
              </div>
            ))}
          </section>
        )}
        <button type="button" className="brand-btn brand-btn--ghost" onClick={() => onDelete(item.id)}>
          Delete
        </button>
      </aside>
    </div>
  );
}

export function BrandDna({ dna, handle, onSave }) {
  const [form, setForm] = useState({
    handle: handle || dna.handle || '',
    whoYouAre: dna.whoYouAre || '',
    standFor: dna.standFor || '',
    audience: dna.audience || '',
    voice: dna.voice || '',
    donts: dna.donts || '',
  });

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="brand-dna"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          whoYouAre: form.whoYouAre,
          standFor: form.standFor,
          audience: form.audience,
          voice: form.voice,
          donts: form.donts,
        }, form.handle);
      }}
    >
      <label className="brand-dna__wide">
        Handle
        <input value={form.handle} onChange={(event) => setField('handle', event.target.value)} placeholder="@you" />
      </label>
      <label>
        Ποιος είσαι
        <textarea value={form.whoYouAre} onChange={(event) => setField('whoYouAre', event.target.value)} />
      </label>
      <label>
        Τι πρεσβεύεις
        <textarea value={form.standFor} onChange={(event) => setField('standFor', event.target.value)} />
      </label>
      <label>
        Κοινό
        <textarea value={form.audience} onChange={(event) => setField('audience', event.target.value)} />
      </label>
      <label>
        Προσωπικό ύφος
        <textarea value={form.voice} onChange={(event) => setField('voice', event.target.value)} />
      </label>
      <label className="brand-dna__wide">
        Πράγματα που δεν θέλεις να λες
        <textarea value={form.donts} onChange={(event) => setField('donts', event.target.value)} />
      </label>
      <div className="brand-dna__wide">
        <p className="brand-empty">
          Άξονες: Επιχειρηματικότητα · Building Symphon / Lifev1 / Lifeeffect · Αποφάσεις και αποτυχίες · Αυτογνωσία · AI ως ενίσχυση του ανθρώπου.
          Nobelle εκτός. Market Portal μόνο ως μάθημα.
        </p>
        {(dna.projects || []).length > 0 && (
          <div className="brand-weekly" style={{ marginTop: 12 }}>
            {dna.projects.map((project) => (
              <article key={project.id || project.title} className="brand-weekly__item">
                <h4>{project.title}</h4>
                <p>{project.phase || 'Τρέχουσα φάση: ενημέρωσέ την όταν αλλάξει.'}</p>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="brand-dna__wide">
        <button type="submit" className="brand-btn brand-btn--green">Save Brand DNA</button>
      </div>
    </form>
  );
}
