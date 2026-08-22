import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCallRecorder } from '../hooks/useCallRecorder';
import { isOpenAiConfigured } from '../lib/openai';
import { transcribeAudio } from '../utils/voiceTranscribe';
import {
  CALL_DIRECTIONS,
  CALL_OUTCOMES,
  createCall,
  deleteCall,
  getCallAudioUrl,
  listCalls,
  summarizeCalls,
  updateCall,
  uploadCallAudio,
} from '../utils/callsDb';
import './calls.css';

function formatDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('el-GR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function outcomeLabel(id) {
  return CALL_OUTCOMES.find((o) => o.id === id)?.label || '—';
}

const EMPTY_DRAFT = {
  contact: '',
  phone: '',
  direction: 'outgoing',
  purpose: '',
  outcome: '',
  notes: '',
  tagsText: '',
};

export function CallsView() {
  const recorder = useCallRecorder();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null); // { blob, durationSeconds } after stop
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [transcribingPending, setTranscribingPending] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState(null);

  const openAiReady = isOpenAiConfigured();
  const summary = useMemo(() => summarizeCalls(calls), [calls]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await listCalls();
      setCalls(rows);
    } catch (err) {
      setLoadError(err.message || 'Δεν φορτώθηκαν οι κλήσεις.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pending?.blob) {
      setPendingAudioUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(pending.blob);
    setPendingAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const handleStop = async () => {
    const result = await recorder.stop();
    if (!result.blob || result.blob.size < 800) {
      setSaveError('Δεν ηχογραφήθηκε αρκετός ήχος.');
      return;
    }
    setSaveError('');
    setPendingTranscript('');
    setDraft(EMPTY_DRAFT);
    setPending({ blob: result.blob, durationSeconds: result.durationSeconds });
  };

  const discardPending = () => {
    setPending(null);
    setPendingTranscript('');
    setDraft(EMPTY_DRAFT);
    setSaveError('');
  };

  const transcribePending = async () => {
    if (!pending?.blob || !openAiReady) return;
    setTranscribingPending(true);
    try {
      const text = await transcribeAudio(pending.blob);
      setPendingTranscript(text || '');
    } catch (err) {
      setSaveError(err.message || 'Αποτυχία μεταγραφής.');
    } finally {
      setTranscribingPending(false);
    }
  };

  const savePending = async () => {
    if (!pending?.blob) return;
    setSaving(true);
    setSaveError('');
    try {
      const tags = draft.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await createCall({
        contact: draft.contact,
        phone: draft.phone,
        direction: draft.direction,
        purpose: draft.purpose,
        outcome: draft.outcome,
        notes: draft.notes,
        tags,
        transcript: pendingTranscript,
        durationSeconds: pending.durationSeconds,
      });
      try {
        const audioPath = await uploadCallAudio(created.id, pending.blob);
        await updateCall(created.id, { audioPath });
      } catch {
        // Row is saved even if audio upload fails; surface a soft warning.
        setSaveError('Η κλήση αποθηκεύτηκε αλλά το ηχητικό δεν ανέβηκε.');
      }
      discardPending();
      await refresh();
    } catch (err) {
      setSaveError(err.message || 'Δεν αποθηκεύτηκε η κλήση.');
    } finally {
      setSaving(false);
    }
  };

  const isRecording = recorder.status === 'recording' || recorder.status === 'paused';

  return (
    <div className="calls-view">
      <header className="calls-view__header">
        <div>
          <h1 className="calls-view__title">Review</h1>
          <p className="calls-view__subtitle">
            Ηχογράφησε με ανοιχτή ακρόαση και ανάλυσε τον τρόπο σου.
          </p>
        </div>
      </header>

      <section className="calls-recorder">
        <div className="calls-recorder__consent">
          Θύμισε στον συνομιλητή ότι η κλήση ηχογραφείται πριν ξεκινήσεις.
        </div>

        {!pending && (
          <div className="calls-recorder__panel">
            {isRecording ? (
              <>
                <div className="calls-recorder__live">
                  <span className="calls-recorder__dot" />
                  <span className="calls-recorder__timer">{formatDuration(recorder.elapsed)}</span>
                  <span className="calls-recorder__status">
                    {recorder.status === 'paused' ? 'Σε παύση' : 'Ηχογράφηση…'}
                  </span>
                </div>
                <div className="calls-recorder__meter" aria-hidden="true">
                  <div
                    className="calls-recorder__meter-fill"
                    style={{ width: `${recorder.status === 'paused' ? 0 : recorder.level}%` }}
                  />
                </div>
                <div className="calls-recorder__controls">
                  {recorder.status === 'recording' ? (
                    <button type="button" className="btn btn--ghost" onClick={recorder.pause}>
                      Παύση
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost" onClick={recorder.resume}>
                      Συνέχεια
                    </button>
                  )}
                  <button type="button" className="btn btn--primary" onClick={handleStop}>
                    ■ Σταμάτα &amp; κράτα
                  </button>
                  <button type="button" className="btn btn--text" onClick={recorder.cancel}>
                    Άκυρο
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="calls-recorder__start"
                onClick={recorder.start}
              >
                <span className="calls-recorder__start-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </span>
                <span>Ξεκίνα ηχογράφηση</span>
              </button>
            )}
            {recorder.error && <p className="calls-error">{recorder.error}</p>}
          </div>
        )}

        {pending && (
          <div className="calls-recorder__review">
            <div className="calls-recorder__review-head">
              <strong>Νέα κλήση · {formatDuration(pending.durationSeconds)}</strong>
              {pendingAudioUrl && <audio controls src={pendingAudioUrl} className="calls-audio" />}
            </div>

            <div className="calls-form">
              <div className="calls-form__row">
                <label className="calls-field">
                  <span>Επαφή</span>
                  <input
                    className="input"
                    value={draft.contact}
                    onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
                    placeholder="Όνομα"
                  />
                </label>
                <label className="calls-field">
                  <span>Τηλέφωνο</span>
                  <input
                    className="input"
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="Προαιρετικό"
                  />
                </label>
              </div>
              <div className="calls-form__row">
                <label className="calls-field">
                  <span>Κατεύθυνση</span>
                  <select
                    className="input"
                    value={draft.direction}
                    onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value }))}
                  >
                    {CALL_DIRECTIONS.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="calls-field">
                  <span>Έκβαση</span>
                  <select
                    className="input"
                    value={draft.outcome}
                    onChange={(e) => setDraft((d) => ({ ...d, outcome: e.target.value }))}
                  >
                    <option value="">—</option>
                    {CALL_OUTCOMES.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="calls-field">
                <span>Σκοπός</span>
                <input
                  className="input"
                  value={draft.purpose}
                  onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                  placeholder="π.χ. πρώτη επαφή, follow-up"
                />
              </label>
              <label className="calls-field">
                <span>Tags (χωρισμένα με κόμμα)</span>
                <input
                  className="input"
                  value={draft.tagsText}
                  onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))}
                  placeholder="π.χ. ψυχρή, σύσταση"
                />
              </label>
              <label className="calls-field">
                <span>Σημειώσεις</span>
                <textarea
                  className="input textarea"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>

              <div className="calls-form__transcript">
                <div className="calls-form__transcript-head">
                  <span>Μεταγραφή</span>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={transcribePending}
                    disabled={!openAiReady || transcribingPending}
                    title={openAiReady ? '' : 'Πρόσθεσε OpenAI key: Settings → Voice'}
                  >
                    {transcribingPending ? 'Μεταγραφή…' : 'Μεταγραφή κλήσης'}
                  </button>
                </div>
                {!openAiReady && (
                  <p className="calls-hint">Για μεταγραφή χρειάζεσαι OpenAI key (Settings → Voice).</p>
                )}
                <textarea
                  className="input textarea"
                  rows={4}
                  value={pendingTranscript}
                  onChange={(e) => setPendingTranscript(e.target.value)}
                  placeholder="Η μεταγραφή θα εμφανιστεί εδώ (ή γράψε χειροκίνητα)."
                />
              </div>

              {saveError && <p className="calls-error">{saveError}</p>}

              <div className="calls-form__actions">
                <button type="button" className="btn btn--text" onClick={discardPending} disabled={saving}>
                  Απόρριψη
                </button>
                <button type="button" className="btn btn--primary" onClick={savePending} disabled={saving}>
                  {saving ? 'Αποθήκευση…' : 'Αποθήκευση κλήσης'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="calls-stats">
        <div className="calls-stat">
          <span className="calls-stat__value">{summary.total}</span>
          <span className="calls-stat__label">Κλήσεις</span>
        </div>
        <div className="calls-stat">
          <span className="calls-stat__value">{formatDuration(summary.avgSeconds)}</span>
          <span className="calls-stat__label">Μέση διάρκεια</span>
        </div>
        <div className="calls-stat">
          <span className="calls-stat__value">{summary.conversionRate}%</span>
          <span className="calls-stat__label">Θετικές</span>
        </div>
      </section>

      <section className="calls-list">
        {loading && <p className="calls-hint">Φόρτωση…</p>}
        {loadError && <p className="calls-error">{loadError}</p>}
        {!loading && !loadError && calls.length === 0 && (
          <p className="calls-hint">Δεν υπάρχουν κλήσεις ακόμη. Ξεκίνα την πρώτη ηχογράφηση.</p>
        )}
        {calls.map((call) => (
          <CallRow
            key={call.id}
            call={call}
            expanded={expandedId === call.id}
            onToggle={() => setExpandedId((id) => (id === call.id ? null : call.id))}
            openAiReady={openAiReady}
            onChanged={refresh}
          />
        ))}
      </section>
    </div>
  );
}

function CallRow({ call, expanded, onToggle, openAiReady, onChanged }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');
  const [outcome, setOutcome] = useState(call.outcome || '');
  const [notes, setNotes] = useState(call.notes || '');

  useEffect(() => {
    if (!expanded || audioUrl || !call.audioPath) return;
    let cancelled = false;
    setLoadingAudio(true);
    getCallAudioUrl(call.audioPath)
      .then((url) => {
        if (!cancelled) setAudioUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAudio(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, audioUrl, call.audioPath]);

  const saveEdits = async () => {
    setBusy(true);
    setRowError('');
    try {
      await updateCall(call.id, { outcome, notes });
      await onChanged();
    } catch (err) {
      setRowError(err.message || 'Δεν αποθηκεύτηκε.');
    } finally {
      setBusy(false);
    }
  };

  const transcribeExisting = async () => {
    if (!call.audioPath || !openAiReady) return;
    setBusy(true);
    setRowError('');
    try {
      const url = audioUrl || (await getCallAudioUrl(call.audioPath));
      const blob = await fetch(url).then((r) => r.blob());
      const text = await transcribeAudio(blob);
      await updateCall(call.id, { transcript: text || '' });
      await onChanged();
    } catch (err) {
      setRowError(err.message || 'Αποτυχία μεταγραφής.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Διαγραφή κλήσης και ηχογράφησης;')) return;
    setBusy(true);
    try {
      await deleteCall(call.id, call.audioPath);
      await onChanged();
    } catch (err) {
      setRowError(err.message || 'Δεν διαγράφηκε.');
      setBusy(false);
    }
  };

  return (
    <article className={`call-row${expanded ? ' call-row--open' : ''}`}>
      <button type="button" className="call-row__summary" onClick={onToggle}>
        <span className={`call-row__dir call-row__dir--${call.direction}`} aria-hidden="true">
          {call.direction === 'incoming' ? '↙' : '↗'}
        </span>
        <span className="call-row__main">
          <span className="call-row__contact">{call.contact || call.phone || 'Άγνωστη επαφή'}</span>
          <span className="call-row__meta">{formatDate(call.calledAt)} · {formatDuration(call.durationSeconds)}</span>
        </span>
        {call.outcome && (
          <span className={`call-badge call-badge--${call.outcome}`}>{outcomeLabel(call.outcome)}</span>
        )}
      </button>

      {expanded && (
        <div className="call-row__detail">
          {call.audioPath ? (
            loadingAudio ? (
              <p className="calls-hint">Φόρτωση ήχου…</p>
            ) : audioUrl ? (
              <audio controls src={audioUrl} className="calls-audio" />
            ) : (
              <p className="calls-hint">Δεν βρέθηκε ηχητικό.</p>
            )
          ) : (
            <p className="calls-hint">Χωρίς ηχογράφηση.</p>
          )}

          {call.purpose && <p className="call-row__purpose">Σκοπός: {call.purpose}</p>}
          {call.tags?.length > 0 && (
            <div className="call-row__tags">
              {call.tags.map((t) => (
                <span key={t} className="call-tag">{t}</span>
              ))}
            </div>
          )}

          <div className="calls-form__row">
            <label className="calls-field">
              <span>Έκβαση</span>
              <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">—</option>
                {CALL_OUTCOMES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="calls-field">
            <span>Σημειώσεις</span>
            <textarea
              className="input textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="call-row__transcript">
            <span className="call-row__transcript-label">Μεταγραφή</span>
            {call.transcript ? (
              <p className="call-row__transcript-text">{call.transcript}</p>
            ) : (
              <p className="calls-hint">Χωρίς μεταγραφή.</p>
            )}
          </div>

          {rowError && <p className="calls-error">{rowError}</p>}

          <div className="call-row__actions">
            {call.audioPath && !call.transcript && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={transcribeExisting}
                disabled={busy || !openAiReady}
                title={openAiReady ? '' : 'Πρόσθεσε OpenAI key: Settings → Voice'}
              >
                Μεταγραφή
              </button>
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={saveEdits} disabled={busy}>
              Αποθήκευση
            </button>
            <button type="button" className="btn btn--text btn--sm" onClick={remove} disabled={busy}>
              Διαγραφή
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
