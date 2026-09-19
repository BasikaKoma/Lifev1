import { useEffect, useMemo, useState } from 'react';
import { formatIgHandle, metaStatusHint, metaStatusLabel } from '../../lib/meta';
import '../OuraConnectModal.css';
import './MetaConnectModal.css';

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('el-GR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export function MetaConnectModal({
  open,
  onClose,
  status,
  loading,
  busy,
  error,
  onConnect,
  onDisconnect,
  onRefresh,
  onSaveDestinations,
}) {
  const destinations = status?.destinations || [];
  const igOptions = useMemo(
    () => destinations.filter((row) => row.ig_user_id),
    [destinations],
  );
  const [pageId, setPageId] = useState('');
  const [igUserId, setIgUserId] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setPageId(status?.facebook?.page_id || destinations[0]?.page_id || '');
    setIgUserId(status?.instagram?.ig_user_id || igOptions[0]?.ig_user_id || '');
  }, [open, status, destinations, igOptions]);

  if (!open) return null;

  const connected = Boolean(status?.connected);
  const hint = metaStatusHint(status);
  const badgeLabel = loading
    ? 'Έλεγχος…'
    : connected
      ? (status?.token_valid ? 'Συνδεδεμένο' : 'Ληγμένο token')
      : 'Μη συνδεδεμένο';

  return (
    <div className="oura-modal" role="dialog" aria-modal="true" aria-labelledby="meta-modal-title">
      <button type="button" className="oura-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="oura-modal__panel">
        <header className="oura-modal__header">
          <div>
            <h2 id="meta-modal-title" className="oura-modal__title">
              Meta · Facebook / Instagram
            </h2>
            <p className="oura-modal__subtitle">
              Σύνδεσε Facebook Page και Instagram Professional. Τα tokens μένουν στον server — χωρίς δημοσίευση ακόμα.
            </p>
          </div>
          <span
            className={`oura-modal__badge ${connected && status?.token_valid ? 'oura-modal__badge--connected' : 'oura-modal__badge--disconnected'}`}
          >
            {badgeLabel}
          </span>
        </header>

        {hint ? <p className="oura-modal__hint">{hint}</p> : null}
        {error ? <p className="oura-modal__error">{error}</p> : null}

        {!connected && (
          <section className="oura-modal__section">
            <h3 className="oura-modal__section-title">Προϋποθέσεις</h3>
            <ul className="oura-modal__data-list">
              <li className="oura-modal__data-item">
                <span className="oura-modal__data-label">Instagram Professional</span>
                <span className="oura-modal__data-desc">Business ή Creator account, όχι προσωπικό προφίλ.</span>
              </li>
              <li className="oura-modal__data-item">
                <span className="oura-modal__data-label">Facebook Page</span>
                <span className="oura-modal__data-desc">Η Page πρέπει να είναι συνδεδεμένη με το Instagram και να έχεις admin-equivalent πρόσβαση.</span>
              </li>
            </ul>
          </section>
        )}

        {connected && (
          <>
            <section className="oura-modal__section">
              <h3 className="oura-modal__section-title">Κατάσταση</h3>
              <dl className="oura-modal__meta">
                <div>
                  <dt>Συνδέθηκε</dt>
                  <dd>{formatTimestamp(status?.connected_at)}</dd>
                </div>
                <div>
                  <dt>Επιλεγμένα</dt>
                  <dd>{metaStatusLabel(status)}</dd>
                </div>
              </dl>
            </section>

            <section className="oura-modal__section">
              <h3 className="oura-modal__section-title">Facebook Page</h3>
              {destinations.length ? (
                <div className="meta-modal__choices">
                  {destinations.map((row) => (
                    <label key={row.page_id} className="meta-modal__choice">
                      <input
                        type="radio"
                        name="meta-page"
                        checked={pageId === row.page_id}
                        onChange={() => setPageId(row.page_id)}
                      />
                      <span>
                        <strong>{row.page_name}</strong>
                        {row.ig_username ? <em>{formatIgHandle(row.ig_username)}</em> : <em>Χωρίς Instagram</em>}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="oura-modal__hint">Δεν βρέθηκε Facebook Page.</p>
              )}
            </section>

            <section className="oura-modal__section">
              <h3 className="oura-modal__section-title">Instagram Professional</h3>
              {igOptions.length ? (
                <div className="meta-modal__choices">
                  {igOptions.map((row) => (
                    <label key={row.ig_user_id} className="meta-modal__choice">
                      <input
                        type="radio"
                        name="meta-ig"
                        checked={igUserId === row.ig_user_id}
                        onChange={() => setIgUserId(row.ig_user_id)}
                      />
                      <span>
                        <strong>{formatIgHandle(row.ig_username)}</strong>
                        <em>{row.page_name}</em>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="oura-modal__hint">
                  Page χωρίς συνδεδεμένο Instagram Professional. Μετάτρεψε το Instagram σε Professional και συνδέσέ το στη Page.
                </p>
              )}
            </section>
          </>
        )}

        <footer className="oura-modal__actions">
          <button type="button" className="oura-modal__btn" onClick={onClose}>
            Κλείσιμο
          </button>
          {connected ? (
            <>
              {destinations.length > 0 && (
                <button
                  type="button"
                  className="oura-modal__btn oura-modal__btn--ghost"
                  disabled={busy || !pageId}
                  onClick={() => {
                    Promise.resolve(onSaveDestinations?.(pageId, igUserId || '')).catch(() => {});
                  }}
                >
                  {busy ? 'Αποθήκευση…' : 'Αποθήκευση προορισμών'}
                </button>
              )}
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--ghost"
                disabled={busy}
                onClick={onRefresh}
              >
                {busy ? 'Ενημέρωση…' : 'Ανανέωση Pages'}
              </button>
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--danger"
                disabled={busy}
                onClick={onDisconnect}
              >
                Αποσύνδεση
              </button>
            </>
          ) : (
            <button
              type="button"
              className="oura-modal__btn oura-modal__btn--primary"
              disabled={busy || loading}
              onClick={onConnect}
            >
              {busy ? 'Άνοιγμα Meta…' : 'Connect Meta'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
