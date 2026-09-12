import { useEffect, useMemo, useState } from 'react';
import { SelfIcon } from '../SelfIcons';
import { ThoughtItem } from '../../ThoughtItem';
import {
  isEveningCloseWindow,
  pendingEveningThoughts,
  visibleThoughts,
} from '../../../utils/dayThoughts';

export function SelfThoughtsCard({
  thoughts = [],
  onAddThought,
  onPromoteThought,
  onKeepThought,
  onDismissThought,
  onOpenDayDetails,
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [evening, setEvening] = useState(() => isEveningCloseWindow());
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    const tick = () => setEvening(isEveningCloseWindow());
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, []);

  const visible = useMemo(() => visibleThoughts(thoughts), [thoughts]);
  const pending = useMemo(() => pendingEveningThoughts(thoughts), [thoughts]);
  const showClose = evening && !snoozed && pending.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !onAddThought || saving) return;
    setSaving(true);
    try {
      await onAddThought(text);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="self-thoughts" aria-label="Σκέψεις σήμερα">
      <header className="self-thoughts__header">
        <div className="self-thoughts__heading">
          <span className="self-thoughts__icon" aria-hidden>
            <SelfIcon name="thought" />
          </span>
          <div>
            <p className="self-thoughts__eyebrow">ΣΚΕΨΕΙΣ ΣΗΜΕΡΑ</p>
            <p className="self-thoughts__count">{visible.length}</p>
          </div>
        </div>
        {onOpenDayDetails ? (
          <button type="button" className="self-project-day__details-btn" onClick={onOpenDayDetails}>
            Όλες
            <span aria-hidden>→</span>
          </button>
        ) : null}
      </header>

      {showClose ? (
        <div className="self-thoughts__close">
          <p>
            {pending.length} {pending.length === 1 ? 'σκέψη' : 'σκέψεις'} σήμερα. Κάτι να κρατήσεις;
          </p>
          <button type="button" className="btn btn--text btn--sm" onClick={() => setSnoozed(true)}>
            Αργότερα
          </button>
        </div>
      ) : null}

      <form className="self-thoughts__composer" onSubmit={handleSubmit}>
        <input
          className="input self-thoughts__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Μια σκέψη — χωρίς να σκεφτείς πού πάει"
          aria-label="Νέα σκέψη"
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!draft.trim() || saving}>
          {saving ? '…' : '+'}
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="self-thoughts__empty">Γράψε ό,τι περνάει από το μυαλό. Το βράδυ το κοιτάς ξανά.</p>
      ) : (
        <ul className="self-thoughts__list">
          {[...visible].reverse().map((thought) => (
            <ThoughtItem
              key={thought.id}
              thought={thought}
              evening={showClose}
              onPromote={onPromoteThought}
              onKeep={onKeepThought}
              onDismiss={onDismissThought}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
