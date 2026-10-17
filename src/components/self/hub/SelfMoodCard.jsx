import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  consumeMoodPrompt,
  getCachedMood,
  loadMood,
  loadMoodWindow,
  localDayIso,
  saveMood,
  subscribeMood,
} from '../../../lib/mood/store';
import './selfMood.css';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Re-check the lock this often; the Oura wake-up can arrive while the app is open. */
const WINDOW_REFRESH_MS = 5 * 60 * 1000;
const LOCK_TICK_MS = 30 * 1000;

function clock(date) {
  return date ? date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
}

function LockIcon() {
  return (
    <svg className="self-mood-card__lock" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z"
      />
    </svg>
  );
}

function MoodDialog({ day, initial, window: moodWindow, onClose, onSaved }) {
  const [score, setScore] = useState(initial?.score ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!score) {
      setError('Διάλεξε από 1 έως 10.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveMood(day, { score, note }));
    } catch (err) {
      setError(err?.message || 'Δεν αποθηκεύτηκε.');
      setSaving(false);
    }
  };

  const lockHint = moodWindow.wakeAt
    ? `Κλειδώνει στις ${clock(moodWindow.lockAt)}, μία ώρα μετά το ξύπνημα.`
    : 'Κλειδώνει μία ώρα μετά το ξύπνημα (Oura).';

  return createPortal(
    <div className="self-mood-dialog" role="presentation" onClick={onClose}>
      <div
        className="self-mood-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-mood-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="self-mood-dialog-title" className="self-mood-dialog__title">
          Πώς είναι η διάθεσή σου σήμερα;
        </h3>
        <p className="self-mood-dialog__hint">{lockHint}</p>
        <div className="self-mood-dialog__scores" role="radiogroup" aria-label="Διάθεση 1 έως 10">
          {SCORES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={score === value}
              className={`self-mood-dialog__score${score === value ? ' self-mood-dialog__score--active' : ''}`}
              onClick={() => setScore(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="self-mood-dialog__label" htmlFor="self-mood-note">
          Σημείωση (προαιρετικά)
        </label>
        <textarea
          id="self-mood-note"
          className="input self-mood-dialog__note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Τι επηρεάζει τη διάθεσή σου;"
        />
        {error && <p className="self-mood-dialog__error">{error}</p>}
        <div className="self-mood-dialog__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={saving}>
            Άκυρο
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving || !score}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Today's mood under the Sleep orb; no organ link, it is not a body metric. */
export function SelfMoodCard() {
  const day = localDayIso();
  const [entry, setEntry] = useState(() => getCachedMood(day));
  const [moodWindow, setMoodWindow] = useState({ wakeAt: null, lockAt: null });
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const locked = Boolean(moodWindow.lockAt && now >= moodWindow.lockAt.getTime());

  useEffect(() => {
    let cancelled = false;
    setEntry(getCachedMood(day));
    loadMood(day)
      .then((next) => {
        if (!cancelled) setEntry(next);
      })
      .catch(() => {});
    const refreshWindow = () => {
      loadMoodWindow(day)
        .then((next) => {
          if (!cancelled) setMoodWindow(next);
        })
        .catch(() => {});
    };
    refreshWindow();
    const interval = setInterval(refreshWindow, WINDOW_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshWindow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [day]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), LOCK_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  useEffect(() => {
    if (consumeMoodPrompt() && !locked) setOpen(true);
    return subscribeMood((type) => {
      if (type === 'prompt' && consumeMoodPrompt() && !locked) setOpen(true);
      if (type === 'saved') setEntry(getCachedMood(day));
    });
  }, [day, locked]);

  const close = useCallback(() => setOpen(false), []);

  const title = locked
    ? `Κλείδωσε στις ${clock(moodWindow.lockAt)}`
    : moodWindow.wakeAt
      ? `Ανοιχτό ως τις ${clock(moodWindow.lockAt)}`
      : 'Κλειδώνει μία ώρα μετά το ξύπνημα';

  return (
    <>
      <button
        type="button"
        className={`self-mood-card${entry ? ' self-mood-card--done' : ''}${locked ? ' self-mood-card--locked' : ''}`}
        onClick={() => setOpen(true)}
        disabled={locked}
        title={title}
        aria-label={entry ? `Διάθεση σήμερα ${entry.score} στα 10. ${title}` : `Διάθεση σήμερα. ${title}`}
      >
        {/* lang="el" so the uppercase label drops the accent (ΔΙΑΘΕΣΗ). */}
        <span className="self-mood-card__label" lang="el">Διάθεση</span>
        <span className="self-mood-card__value">
          {entry ? (
            <>
              {entry.score}
              <span className="self-mood-card__max">/10</span>
            </>
          ) : locked ? (
            '—'
          ) : (
            <span className="self-mood-card__ask">1–10</span>
          )}
          {locked ? <LockIcon /> : null}
        </span>
      </button>
      {open && !locked && (
        <MoodDialog
          day={day}
          initial={entry}
          window={moodWindow}
          onClose={close}
          onSaved={(saved) => {
            setEntry(saved);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
