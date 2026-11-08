import { useEffect, useState } from 'react';
import {
  disconnectErp,
  getErpStatus,
  listSymphonOrgs,
  selectSymphonOrg,
  startSymphonConnect,
} from '../lib/assistant/erp';
import { hasElectronBrain } from '../platform/brain';

export function AssistantConnections() {
  const [erp, setErp] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const erpStatus = await getErpStatus().catch(() => null);
    setErp(erpStatus);
    if (erpStatus?.needs_org) {
      const nextOrgs = await listSymphonOrgs().catch(() => []);
      setOrgs(nextOrgs);
      setOrgId((current) => current || nextOrgs[0]?.org_id || '');
    } else {
      setOrgs([]);
      setOrgId('');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('erp');
    if (flag) {
      params.delete('erp');
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
      if (flag === 'error') setError('Η σύνδεση με το Symphon δεν ολοκληρώθηκε.');
      if (flag === 'no-org') setError('Ο λογαριασμός Symphon δεν έχει οργανισμό.');
    }
    reload();
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const connectSymphon = async () => {
    setBusy(true);
    setError('');
    try {
      await startSymphonConnect();
    } catch (err) {
      const message = err.message || '';
      if (message.includes('Missing Symphon OAuth configuration')) {
        setError('Λείπουν τα SYMPHON_CLIENT_ID και SYMPHON_CLIENT_SECRET στον server.');
      } else {
        setError(message || 'Δεν άνοιξε η σύνδεση Symphon.');
      }
    } finally {
      setBusy(false);
    }
  };

  const chooseOrg = async () => {
    if (!orgId) return;
    setBusy(true);
    setError('');
    try {
      await selectSymphonOrg(orgId);
      await reload();
    } catch (err) {
      setError(err.message || 'Ο οργανισμός δεν επιλέχθηκε.');
    } finally {
      setBusy(false);
    }
  };

  const removeErp = async () => {
    if (!window.confirm('Αποσύνδεση Symphon; Το token σβήνεται από τον server.')) return;
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
        <h3 className="settings-block__title">ERP</h3>
        <p className="settings-block__desc">
          {erp?.needs_org
            ? 'Διάλεξε τον οργανισμό του Symphon. Το token μένει στον server.'
            : erp?.connected
              ? `Συνδεδεμένο${erp.label ? ` — ${erp.label}` : ''}. Ο βοηθός παίρνει τις χθεσινές πωλήσεις. Το token μένει στον server.`
              : 'Σύνδεση με τον λογαριασμό Symphon. Το token μένει στον server και δεν φτάνει στο μοντέλο.'}
        </p>
        <div className="settings-inline-actions">
          {erp?.needs_org ? (
            <>
              <select className="input" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
                {orgs.map((org) => (
                  <option key={org.org_id} value={org.org_id}>{org.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn--primary" disabled={busy || !orgId} onClick={chooseOrg}>
                Επιλογή οργανισμού
              </button>
            </>
          ) : erp?.connected ? null : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={connectSymphon}>
              Σύνδεση με Symphon
            </button>
          )}
          {erp?.connected ? (
            <button type="button" className="btn btn--outline" disabled={busy} onClick={removeErp}>
              Αποσύνδεση
            </button>
          ) : null}
        </div>
      </div>

      <div className="settings-block">
        <h3 className="settings-block__title">Υπολογιστής</h3>
        <p className="settings-block__desc">
          {hasElectronBrain()
            ? 'Σε αυτό το desktop app ο βοηθός μπορεί να ανοίξει, να γράψει και να συμπληρώσει μέσα στους φακέλους που έχεις επιτρέψει. Πληρωμή, διαγραφή και δέσμευση σε πελάτη σταματούν για ναι.'
            : 'Εδώ μόνο ανάγνωση. Άνοιγμα, εγγραφή και συμπλήρωση στον υπολογιστή υπάρχουν μόνο στο desktop app.'}
        </p>
      </div>
      {error ? <p className="settings-block__desc">{error}</p> : null}
    </>
  );
}
