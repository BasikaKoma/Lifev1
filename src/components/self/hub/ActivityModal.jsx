import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ActivityModal.css';

const THEMES = {
  workout: { color: '#dfbb7e', icon: 'dumbbell', note: 'Ενέργεια, διάθεση, μια μικρή νίκη…', details: 'Ασκήσεις, σετ, επαναλήψεις…' },
  meditation: { color: '#b3a7e1', icon: 'orbit', note: 'Μια σκέψη από τη συνεδρία σου…', details: 'Τεχνική, αναπνοές, περιβάλλον…' },
  pulse: { color: '#f43f5e', icon: 'activity', note: 'Τι συνέβαινε εκείνη τη στιγμή;', details: 'Πλαίσιο, ένταση, πώς το ένιωσες…' },
  other: { color: '#78d8b7', icon: 'activity', note: 'Πώς ήταν αυτή η δραστηριότητα για σένα;', details: 'Τι περιλάμβανε η δραστηριότητα;' },
};

function Icon({ name, ...props }) {
  const shapes = {
    x: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    dumbbell: <><path d="m6.5 6.5 11 11M4 9l5-5M15 20l5-5M2 7l5-5M17 22l5-5" /><path d="m3 8 5-5 3 3-5 5zm10 10 5-5 3 3-5 5z" /></>,
    orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(35 12 12)" /></>,
    activity: <path d="M2 12h4l3-8 6 16 3-8h4" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] || shapes.activity}</svg>;
}

/**
 * activity: { id, type, title, source?, time?, subtitle?, metrics: [{id,label,value,unit?,hint?}], note?, details? }
 * onSave({ activityId, note, details }): Promise<void> | void
 * Change activity.id when selecting another activity to reset its form.
 */
export default function ActivityModal({ open, activity, onClose, onSave, motion = true, accent = '#78d8b7' }) {
  if (!open || !activity || typeof document === 'undefined') return null;
  return createPortal(
    <ActivityDialog key={activity.id} activity={activity} onClose={onClose} onSave={onSave} motion={motion} accent={accent} />,
    document.body,
  );
}

function ActivityDialog({ activity, onClose, onSave, motion, accent }) {
  const dialogRef = useRef(null);
  const saveLock = useRef(false);
  const mounted = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const id = useId();
  const [note, setNote] = useState(activity.note ?? '');
  const [details, setDetails] = useState(activity.details ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const theme = THEMES[activity.type] || THEMES.other;

  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.focus();
    return () => {
      mounted.current = false;
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function requestClose() {
    if (!saveLock.current) closeRef.current?.();
  }

  async function submit(event) {
    event.preventDefault();
    if (saveLock.current) return;
    if (typeof onSave !== 'function') {
      setError('Δεν έχει συνδεθεί η αποθήκευση με την εφαρμογή.');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave({ activityId: activity.id, note: note.trim(), details: details.trim() });
      if (mounted.current) {
        saveLock.current = false;
        setSaving(false);
        closeRef.current?.();
      }
    } catch {
      if (mounted.current) {
        saveLock.current = false;
        setSaving(false);
        setError('Η αποθήκευση δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
      }
    }
  }

  return (
    <dialog ref={dialogRef} className="activity-modal" tabIndex={-1}
      aria-labelledby={`${id}-title`} aria-describedby={activity.subtitle ? `${id}-subtitle` : undefined}
      aria-busy={saving} data-motion={motion} data-kind={activity.type}
      style={{ '--am-accent': accent, '--am-art': theme.color }}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <form onSubmit={submit} className="am-form">
        <header className="am-header">
          <span className="am-source"><span className="am-source-dot" />{activity.source || 'Δραστηριότητα'}{activity.time && <span className="am-time">· {activity.time}</span>}</span>
          <button className="am-close" type="button" onClick={requestClose} disabled={saving} aria-label="Κλείσιμο"><Icon name="x" /></button>
        </header>

        <div className="am-hero">
          <div className="am-art" aria-hidden="true">
            <div className="am-glow" /><div className="am-orbit" /><div className="am-orbit am-orbit-inner" /><div className="am-orbit am-orbit-outer" />
            <span className="am-spark" /><span className="am-spark am-spark-end" />
            <span className="am-symbol"><Icon name={theme.icon} /></span>
          </div>
          <p className="am-kicker">Η ΔΡΑΣΤΗΡΙΟΤΗΤΑ ΣΟΥ</p>
          <h2 id={`${id}-title`} className="am-title">{activity.title}</h2>
          {activity.subtitle && <p id={`${id}-subtitle`} className="am-subtitle">{activity.subtitle}</p>}
        </div>

        {activity.metrics?.length > 0 && <dl className="am-metrics">
          {activity.metrics.map((metric, index) => <div className={`am-metric${/παλμ/i.test(metric.label) || metric.unit === 'bpm' ? ' am-metric--heart' : ''}`} key={metric.id ?? index}>
            <dt>{metric.label}</dt><dd>{metric.value}<span className="am-unit">{metric.unit}</span></dd>
            {metric.hint && <dd className="am-hint">{metric.hint}</dd>}
          </div>)}
        </dl>}

        <label className="am-label" htmlFor={`${id}-note`}>Πώς ένιωσες μετά; <span>Προαιρετικό</span></label>
        <textarea id={`${id}-note`} className="am-textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={theme.note} disabled={saving} />

        <details className="am-details">
          <summary><span><Icon name="plus" />Λεπτομέρειες δραστηριότητας</span><span className="am-optional">Προαιρετικό</span></summary>
          <label className="am-sr-only" htmlFor={`${id}-details`}>Λεπτομέρειες δραστηριότητας</label>
          <textarea id={`${id}-details`} className="am-textarea" rows={2} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={theme.details} disabled={saving} />
        </details>

        {error && <p className="am-error" role="alert">{error}</p>}
        <footer className="am-footer">
          <button type="button" className="am-cancel" onClick={requestClose} disabled={saving}>Ακύρωση</button>
          <button type="submit" className="am-save" disabled={saving}><span>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</span>{saving ? <span className="am-spinner" aria-hidden="true" /> : <Icon name="arrow" />}</button>
        </footer>
        <span className="am-sr-only" role="status">{saving ? 'Η δραστηριότητα αποθηκεύεται.' : ''}</span>
      </form>
    </dialog>
  );
}
