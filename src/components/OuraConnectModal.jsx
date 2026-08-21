import { useEffect } from 'react';
import { OURA_DATA_TYPES, extractOuraSummary, formatOuraTimestamp, needsOuraReconnect } from '../utils/ouraInfo';
import './OuraConnectModal.css';

function MetricPreview({ label, value, suffix = '' }) {
  return (
    <div className="oura-modal__metric">
      <span className="oura-modal__metric-label">{label}</span>
      <span className="oura-modal__metric-value">
        {value != null && value !== '' ? `${value}${suffix}` : '—'}
      </span>
    </div>
  );
}

export function OuraConnectModal({
  open,
  onClose,
  status,
  metricsRow,
  loading,
  busy,
  error,
  onConnect,
  onSync,
  onDisconnect,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const connected = Boolean(status?.connected);
  const latestDay = metricsRow?.day
    ? new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' }).format(new Date(`${metricsRow.day}T12:00:00`))
    : null;
  const summary = extractOuraSummary(metricsRow, status);
  const showReconnectHint = needsOuraReconnect(status);
  const isToday =
    metricsRow?.day === new Intl.DateTimeFormat('en-CA').format(new Date());

  return (
    <div className="oura-modal" role="dialog" aria-modal="true" aria-labelledby="oura-modal-title">
      <button type="button" className="oura-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="oura-modal__panel">
        <header className="oura-modal__header">
          <div>
            <h2 id="oura-modal-title" className="oura-modal__title">
              Oura Ring
            </h2>
            <p className="oura-modal__subtitle">
              Πλήρης πρόσβαση σε sleep, readiness, activity, stress, SpO2, heart rate, workouts και sessions.
            </p>
          </div>
          <span
            className={`oura-modal__badge ${connected ? 'oura-modal__badge--connected' : 'oura-modal__badge--disconnected'}`}
          >
            {loading ? 'Έλεγχος…' : connected ? 'Συνδεδεμένο' : 'Μη συνδεδεμένο'}
          </span>
        </header>

        {showReconnectHint && (
          <p className="oura-modal__hint">
            Για όλα τα δεδομένα, κάνε αποσύνδεση και ξανασύνδεση ώστε να εγκριθούν τα νέα scopes.
          </p>
        )}

        {error && <p className="oura-modal__error">{error}</p>}

        <section className="oura-modal__section">
          <h3 className="oura-modal__section-title">Κατάσταση</h3>
          <dl className="oura-modal__meta">
            <div>
              <dt>Συνδέθηκε</dt>
              <dd>{formatOuraTimestamp(status?.connected_at)}</dd>
            </div>
            <div>
              <dt>Τελευταίο sync</dt>
              <dd>{formatOuraTimestamp(status?.last_synced_at)}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>{status?.scopes || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="oura-modal__section">
          <h3 className="oura-modal__section-title">Δεδομένα που παρέχει</h3>
          <ul className="oura-modal__data-list">
            {OURA_DATA_TYPES.map((item) => (
              <li key={item.id} className="oura-modal__data-item">
                <span className="oura-modal__data-label">{item.label}</span>
                <span className="oura-modal__data-desc">{item.description}</span>
              </li>
            ))}
          </ul>
        </section>

        {connected && metricsRow && (
          <section className="oura-modal__section">
            <h3 className="oura-modal__section-title">
              {isToday ? 'Σήμερα' : 'Τελευταία μέτρηση'}
              {latestDay ? ` · ${latestDay}` : ''}
            </h3>
            {summary.activityPending && (
              <p className="oura-modal__hint oura-modal__hint--inline">
                Activity & steps ενημερώνονται κατά τη διάρκεια της ημέρας από την Oura.
              </p>
            )}
            <div className="oura-modal__metrics-grid">
              <MetricPreview label="Sleep" value={summary.sleepScore} suffix="/100" />
              <MetricPreview label="Readiness" value={summary.readinessScore} suffix="/100" />
              <MetricPreview label="Activity" value={summary.activityScore} suffix="/100" />
              <MetricPreview label="Steps" value={summary.steps} />
              <MetricPreview label="SpO2" value={summary.spo2} suffix="%" />
              <MetricPreview label="HRV balance" value={summary.hrvBalance} suffix="/100" />
              <MetricPreview label="Resting HR" value={summary.restingHeartRate} suffix=" bpm" />
              <MetricPreview label="Avg HR" value={summary.avgHeartRate} suffix=" bpm" />
              <MetricPreview label="Stress high" value={summary.stressHigh} />
              <MetricPreview label="Recovery high" value={summary.recoveryHigh} />
              <MetricPreview label="Workouts" value={summary.workouts} />
              <MetricPreview label="Sessions" value={summary.sessions} />
            </div>
          </section>
        )}

        <footer className="oura-modal__actions">
          <button type="button" className="oura-modal__btn" onClick={onClose}>
            Κλείσιμο
          </button>
          {connected ? (
            <>
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--ghost"
                onClick={onSync}
                disabled={busy}
              >
                {busy ? 'Sync…' : 'Sync τώρα (30 ημέρες)'}
              </button>
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--danger"
                onClick={onDisconnect}
                disabled={busy}
              >
                Αποσύνδεση
              </button>
            </>
          ) : (
            <button
              type="button"
              className="oura-modal__btn oura-modal__btn--primary"
              onClick={onConnect}
              disabled={busy || loading}
            >
              {busy ? 'Άνοιγμα Oura…' : 'Connect Oura'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
