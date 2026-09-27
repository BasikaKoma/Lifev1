import { useEffect, useState } from 'react';
import { SelfIcon } from '../SelfIcons';

/** @param {{ event: import('../../../utils/selfHubTimelineEvents').SelfTimelineEvent, entry?: { note?: string, detail?: string }, onClose: () => void, onSave: (eventId: string, fields: { note: string, detail: string }) => void }} props */
export function SelfTimelineEventDialog({ event, entry, onClose, onSave }) {
  const [detail, setDetail] = useState(entry?.detail || '');
  const [note, setNote] = useState(entry?.note || '');

  useEffect(() => {
    setDetail(entry?.detail || '');
    setNote(entry?.note || '');
  }, [event.id, entry?.detail, entry?.note]);

  function saveAndClose() {
    const unchanged = (entry?.note || '') === note && (entry?.detail || '') === detail;
    if (!unchanged) onSave(event.id, { note, detail });
    onClose();
  }

  useEffect(() => {
    const onKey = (keyboardEvent) => {
      if (keyboardEvent.key !== 'Escape') return;
      keyboardEvent.preventDefault();
      const unchanged = (entry?.note || '') === note && (entry?.detail || '') === detail;
      if (!unchanged) onSave(event.id, { note, detail });
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, note, entry?.note, entry?.detail, event.id, onSave, onClose]);

  return (
    <div className="self-event-dialog" role="presentation">
      <button
        type="button"
        className="self-event-dialog__backdrop"
        aria-label="Κλείσιμο"
        onClick={saveAndClose}
      />
      <div
        className="self-event-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-event-dialog-title"
      >
        <header className="self-event-dialog__header">
          <span className={`self-event-dialog__icon self-day-progress__event--${event.tone}`} aria-hidden>
            <SelfIcon name={event.icon} />
          </span>
          <div className="self-event-dialog__heading">
            <p className="self-event-dialog__type">
              {event.typeLabel}
              {event.timeLabel ? ` · ${event.timeLabel}` : ''}
            </p>
            <h2 id="self-event-dialog-title" className="self-event-dialog__title">
              {event.label}
            </h2>
          </div>
          <button type="button" className="self-event-dialog__close" onClick={saveAndClose}>
            Κλείσιμο
          </button>
        </header>

        <label className="self-event-dialog__field">
          <span>Λεπτομέρειες</span>
          <textarea
            value={detail}
            rows={3}
            placeholder="Τι έγινε, διάρκεια, πλαίσιο"
            onChange={(changeEvent) => setDetail(changeEvent.target.value)}
          />
        </label>

        <label className="self-event-dialog__field">
          <span>Σημείωση</span>
          <textarea
            value={note}
            rows={4}
            placeholder="Σημείωση για αυτό το συμβάν"
            onChange={(changeEvent) => setNote(changeEvent.target.value)}
          />
        </label>

        <footer className="self-event-dialog__footer">
          <button type="button" className="self-event-dialog__save" onClick={saveAndClose}>
            Αποθήκευση
          </button>
        </footer>
      </div>
    </div>
  );
}
