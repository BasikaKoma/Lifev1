import { useEffect, useState } from 'react';
import './OuraConnectModal.css';

export function ScaleConnectModal({
  open,
  onClose,
  available,
  scanning,
  connecting,
  connected,
  bleConnected = false,
  reconnecting = false,
  devices,
  lastMeasurement,
  error,
  profile,
  onScan,
  onConnect,
  onPickAndConnect,
  onReconnect,
  onForceReconnect,
  onDisconnect,
  onSaveProfile,
  isMobile = false,
  isWeb = false,
  backgroundCapture = false,
  phoneCapture = false,
  debug = null,
}) {
  const [heightCm, setHeightCm] = useState(profile?.heightCm ?? 170);
  const [age, setAge] = useState(profile?.age ?? 30);
  const [sex, setSex] = useState(profile?.sex ?? 'male');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    setHeightCm(profile?.heightCm ?? 170);
    setAge(profile?.age ?? 30);
    setSex(profile?.sex ?? 'male');
  }, [profile, open]);

  useEffect(() => {
    if (!open) {
      setProfileOpen(false);
      return;
    }
    if (!isMobile) {
      setProfileOpen(true);
    }
  }, [open, isMobile]);

  if (!open) return null;

  const handleSaveProfile = () => {
    onSaveProfile?.({ heightCm: Number(heightCm), age: Number(age), sex });
  };

  const profileSummary = `${heightCm} cm · ${age} ετών · ${sex === 'female' ? 'Γυναίκα' : 'Άνδρας'}`;

  return (
    <div className="oura-modal" role="dialog" aria-modal="true" aria-labelledby="scale-modal-title">
      <button type="button" className="oura-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="oura-modal__panel">
        <header className="oura-modal__header">
          <div>
            <h2 id="scale-modal-title" className="oura-modal__title">
              Smart Scale
            </h2>
            <p className="oura-modal__subtitle">
              ACME SC101 (QN-Scale). Στάσου barefoot στη ζυγαριά μετά τη σύνδεση.
            </p>
          </div>
          <span
            className={`oura-modal__badge ${connected ? 'oura-modal__badge--connected' : reconnecting ? 'oura-modal__badge--disconnected' : 'oura-modal__badge--disconnected'}`}
          >
            {connected
              ? bleConnected
                ? 'Συνδεδεμένο · Live'
                : 'Συνδεδεμένο'
              : reconnecting
                ? 'Επανασύνδεση…'
                : available
                  ? 'Έτοιμο'
                  : 'Έλεγχος…'}
          </span>
        </header>

        {connected && !bleConnected && isWeb && phoneCapture && (
          <p className="oura-modal__hint">
            Το κινητό τραβάει τις μετρήσεις στο παρασκήνιο. Τα κιλά εμφανίζονται εδώ από τον λογαριασμό.
            Μην συνδέσεις τη ζυγαριά από τον υπολογιστή — η ζυγαριά δέχεται μόνο μία σύνδεση και το κινητό θα σταματήσει να γράφει.
          </p>
        )}

        {connected && !bleConnected && isWeb && !phoneCapture && (
          <p className="oura-modal__hint">
            Η ζυγαριά είναι συνδεδεμένη στον λογαριασμό σου. Για live μετρήσεις σε αυτό το browser, πάτα «Σύνδεση QN-Scale» μία φορά.
          </p>
        )}

        {connected && backgroundCapture && (
          <p className="oura-modal__hint">
            Οι μετρήσεις αποθηκεύονται και στο παρασκήνιο, όσο το κινητό ή ο υπολογιστής είναι κοντά στη ζυγαριά.
          </p>
        )}

        {!available && !error && (
          <p className="oura-modal__hint">
            {isWeb
              ? 'Χρειάζεσαι Chrome ή Edge σε localhost/HTTPS. Πάτα «Σύνδεση QN-Scale» και επίλεξε τη συσκευή από το σύστημα.'
              : 'Ενεργοποίησε Bluetooth και δώσε άδεια scan. Αν ζητηθεί, επίτρεψε πρόσβαση σε κοντινές συσκευές.'}
          </p>
        )}

        {error && <p className="oura-modal__error">{error}</p>}

        <section className="oura-modal__section oura-modal__section--collapsible">
          <button
            type="button"
            className="oura-modal__section-toggle"
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
          >
            <span className="oura-modal__section-title">Προφίλ (QN handshake)</span>
            <span className="oura-modal__section-chevron" aria-hidden="true">
              {profileOpen ? '▾' : '▸'}
            </span>
          </button>
          {!profileOpen && (
            <p className="oura-modal__meta">{profileSummary}</p>
          )}
          {profileOpen && (
            <>
              <div className="oura-modal__metrics">
                <label className="oura-modal__metric">
                  <span className="oura-modal__metric-label">Ύψος (cm)</span>
                  <input
                    type="number"
                    className="input"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    min={100}
                    max={250}
                  />
                </label>
                <label className="oura-modal__metric">
                  <span className="oura-modal__metric-label">Ηλικία</span>
                  <input
                    type="number"
                    className="input"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    min={10}
                    max={120}
                  />
                </label>
                <label className="oura-modal__metric">
                  <span className="oura-modal__metric-label">Φύλο</span>
                  <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
                    <option value="male">Άνδρας</option>
                    <option value="female">Γυναίκα</option>
                  </select>
                </label>
              </div>
              <button type="button" className="oura-modal__btn oura-modal__btn--ghost" onClick={handleSaveProfile}>
                Αποθήκευση προφίλ
              </button>
            </>
          )}
        </section>

        {debug && (
          <section className="oura-modal__section">
            <h3 className="oura-modal__section-title">Διαγνωστικά</h3>
            <p className="oura-modal__meta" style={{ lineHeight: 1.6 }}>
              Platform: <strong>{debug.platform}</strong>
              <br />
              Stage: <strong>{debug.stage ?? '—'}</strong>
              <br />
              Σήματα από ζυγαριά: <strong>{debug.signalCount ?? 0}</strong>
              {debug.signalCount ? '' : ' — ανέβα στη ζυγαριά τώρα'}
              {debug.services ? (
                <>
                  <br />
                  Services:{' '}
                  <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>
                    {debug.services.length
                      ? debug.services
                          .map((s) => (s.length > 8 ? s.slice(4, 8) : s))
                          .join(', ')
                      : 'none'}
                  </code>
                </>
              ) : (
                <>
                  <br />
                  Services: <strong>—</strong> (δεν έγινε νέα σύνδεση)
                </>
              )}
              {debug.lastRawHex ? (
                <>
                  <br />
                  Τελευταίο raw:{' '}
                  <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                    {debug.lastRawHex}
                  </code>
                </>
              ) : null}
            </p>
            {onForceReconnect && (
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--ghost"
                onClick={onForceReconnect}
                style={{ marginTop: 8 }}
              >
                🔄 Force reconnect (καθαρή σύνδεση)
              </button>
            )}
          </section>
        )}

        {lastMeasurement && (
          <section className="oura-modal__section">
            <h3 className="oura-modal__section-title">Τελευταία μέτρηση</h3>
            {lastMeasurement.value != null || lastMeasurement.weightKg != null ? (
              <p className="oura-modal__metric-value">
                {lastMeasurement.value?.toFixed?.(1) ?? lastMeasurement.weightKg} kg
                {lastMeasurement.stable ? ' (stable)' : ' (measuring…)'}
              </p>
            ) : lastMeasurement.rawHex ? (
              <p className="oura-modal__meta">
                Λαμβάνεται σήμα από τη ζυγαριά, αλλά δεν αναγνωρίστηκε ως βάρος.
                <br />
                <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                  {lastMeasurement.rawHex}
                </code>
              </p>
            ) : null}
          </section>
        )}

        <section className="oura-modal__section">
          <h3 className="oura-modal__section-title">Συσκευές</h3>
          {devices.length === 0 && !scanning && (
            <p className="oura-modal__meta">
              {isWeb
                ? 'Στο browser η σύνδεση γίνεται μόνο με το κουμπί «Σύνδεση QN-Scale».'
                : 'Πάτα Scan για να βρεις QN-Scale.'}
            </p>
          )}
          <ul className="oura-modal__scopes">
            {devices.map((device) => (
              <li key={device.id}>
                <button
                  type="button"
                  className="oura-modal__btn oura-modal__btn--primary"
                  onClick={() => onConnect?.(device)}
                  disabled={connecting || connected}
                >
                  {device.name || 'QN-Scale'} {device.rssi != null ? `(${device.rssi} dBm)` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className="oura-modal__actions">
          {!bleConnected ? (
            <>
              <button
                type="button"
                className="oura-modal__btn oura-modal__btn--primary"
                onClick={onPickAndConnect}
                disabled={connecting || scanning || reconnecting}
              >
                {connecting ? 'Σύνδεση…' : 'Σύνδεση QN-Scale'}
              </button>
              {onReconnect && (
                <button
                  type="button"
                  className="oura-modal__btn oura-modal__btn--ghost"
                  onClick={onReconnect}
                  disabled={connecting || scanning || reconnecting}
                >
                  {reconnecting ? 'Επανασύνδεση…' : 'Επανασύνδεση'}
                </button>
              )}
              {!isWeb && (
                <button
                  type="button"
                  className="oura-modal__btn oura-modal__btn--ghost"
                  onClick={onScan}
                  disabled={scanning || connecting || reconnecting}
                >
                  {scanning ? 'Scanning…' : 'Scan ξανά'}
                </button>
              )}
            </>
          ) : (
            <button type="button" className="oura-modal__btn oura-modal__btn--ghost" onClick={onDisconnect}>
              Αποσύνδεση
            </button>
          )}
          <button type="button" className="oura-modal__btn" onClick={onClose}>
            Κλείσιμο
          </button>
        </footer>
      </div>
    </div>
  );
}
