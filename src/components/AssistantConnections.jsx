import { useEffect, useState } from 'react';
import { disconnectMail, getMailStatus, startMailConnect, syncMail } from '../lib/assistant/mail';
import { connectErp, disconnectErp, getErpStatus } from '../lib/assistant/erp';
import { hasElectronBrain } from '../platform/brain';

export function AssistantConnections() {
  const [mail, setMail] = useState(null);
  const [erp, setErp] = useState(null);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [mailStatus, erpStatus] = await Promise.all([
      getMailStatus().catch(() => null),
      getErpStatus().catch(() => null),
    ]);
    setMail(mailStatus);
    setErp(erpStatus);
  };

  useEffect(() => {
    reload();
  }, []);

  const connectMail = async () => {
    setBusy(true);
    setError('');
    try {
      await startMailConnect();
    } catch (err) {
      setError(err.message || 'Δεν άνοιξε η σύνδεση mail.');
    } finally {
      setBusy(false);
    }
  };

  const refreshMail = async () => {
    setBusy(true);
    setError('');
    try {
      await syncMail();
      await reload();
    } catch (err) {
      setError(err.message || 'Το mail δεν συγχρονίστηκε.');
    } finally {
      setBusy(false);
    }
  };

  const removeMail = async () => {
    if (!window.confirm('Αποσύνδεση mail; Το token σβήνεται από τον server.')) return;
    setBusy(true);
    setError('');
    try {
      await disconnectMail();
      await reload();
    } catch (err) {
      setError(err.message || 'Δεν αποσυνδέθηκε το mail.');
    } finally {
      setBusy(false);
    }
  };

  const saveErp = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await connectErp({ baseUrl, apiKey, label });
      setApiKey('');
      await reload();
    } catch (err) {
      setError(err.message || 'Το ERP δεν συνδέθηκε.');
    } finally {
      setBusy(false);
    }
  };

  const removeErp = async () => {
    if (!window.confirm('Αποσύνδεση ERP; Το κλειδί σβήνεται από τον server.')) return;
    setBusy(true);
    setError('');
    try {
      await disconnectErp();
      await reload();
    } catch (err) {
      setError(err.message || 'Δεν αποσυνδέθηκε το ERP.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="settings-block">
        <h3 className="settings-block__title">Mail</h3>
        <p className="settings-block__desc">
          {mail?.connected
            ? `Συνδεδεμένο${mail.email ? ` — ${mail.email}` : ''}. Ο βοηθός διαβάζει περιλήψεις και ετοιμάζει απάντηση. Στέλνει μόνο μετά από ναι. Το token δεν φτάνει στο μοντέλο.`
            : 'Σύνδεσε το Gmail όπως το Oura. Ο βοηθός ξεχωρίζει τα επείγοντα και ετοιμάζει απάντηση στο ύφος σου.'}
        </p>
        <div className="settings-inline-actions">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={connectMail}>
            {mail?.connected ? 'Σύνδεση ξανά' : 'Connect Mail'}
          </button>
          {mail?.connected ? (
            <>
              <button type="button" className="btn btn--outline" disabled={busy} onClick={refreshMail}>
                Συγχρονισμός
              </button>
              <button type="button" className="btn btn--outline" disabled={busy} onClick={removeMail}>
                Αποσύνδεση
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">ERP</h3>
        <p className="settings-block__desc">
          {erp?.connected
            ? `Συνδεδεμένο${erp.label ? ` — ${erp.label}` : ''}. Ο βοηθός ζητά νούμερα με function. Το κλειδί μένει στον server.`
            : 'GET {διεύθυνση}/{τομέας} με JSON. Τομείς: ταμείο, πελάτες, πωλήσεις, τιμές, λειτουργία, άνθρωποι, προμηθευτές, έγγραφα. Το κλειδί δεν φτάνει στο μοντέλο.'}
        </p>
        <form className="settings-blocks" onSubmit={saveErp}>
          <input
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Όνομα, π.χ. Soft1"
          />
          <input
            className="input"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://erp.example.com/api"
            autoComplete="off"
          />
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="API key"
            autoComplete="new-password"
          />
          <div className="settings-inline-actions">
            <button type="submit" className="btn btn--primary" disabled={busy || !baseUrl.trim() || !apiKey.trim()}>
              Αποθήκευση ERP
            </button>
            {erp?.connected ? (
              <button type="button" className="btn btn--outline" disabled={busy} onClick={removeErp}>
                Αποσύνδεση
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Υπολογιστής</h3>
        <p className="settings-block__desc">
          {hasElectronBrain()
            ? 'Σε αυτό το desktop app ο βοηθός μπορεί να ανοίξει, να γράψει και να συμπληρώσει μέσα στους φακέλους που έχεις επιτρέψει. Αποστολή, πληρωμή, διαγραφή και δέσμευση σε πελάτη σταματούν για ναι.'
            : 'Εδώ μόνο ανάγνωση. Άνοιγμα, εγγραφή, συμπλήρωση και αποστολή από τον υπολογιστή υπάρχουν μόνο στο desktop app.'}
        </p>
      </div>
      {error ? <p className="settings-block__desc">{error}</p> : null}
    </>
  );
}
