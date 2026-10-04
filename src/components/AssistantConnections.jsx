import { useEffect, useState } from 'react';
import {
  assignMailToProject,
  disconnectMail,
  listMailConnections,
  listMailProjects,
  startMailConnect,
  syncMail,
  ZOHO_REGIONS,
} from '../lib/assistant/mail';
import {
  disconnectErp,
  getErpStatus,
  listSymphonOrgs,
  selectSymphonOrg,
  startSymphonConnect,
} from '../lib/assistant/erp';
import { hasElectronBrain } from '../platform/brain';

export function AssistantConnections() {
  const [mailboxes, setMailboxes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignProjectId, setAssignProjectId] = useState('');
  const [erp, setErp] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zohoRegion, setZohoRegion] = useState('eu');

  const reload = async () => {
    const [nextMailboxes, nextProjects, erpStatus] = await Promise.all([
      listMailConnections().catch(() => []),
      listMailProjects().catch(() => []),
      getErpStatus().catch(() => null),
    ]);
    setMailboxes(nextMailboxes);
    setProjects(nextProjects);
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

  const connectMail = async (projectId) => {
    setBusy(true);
    setError('');
    try {
      await startMailConnect({ provider: 'zoho', region: zohoRegion, projectId });
    } catch (err) {
      const message = err.message || '';
      if (message.includes('Missing Zoho OAuth configuration')) {
        setError('Λείπουν τα ZOHO_CLIENT_ID και ZOHO_CLIENT_SECRET στον server.');
      } else {
        setError(message || 'Δεν άνοιξε η σύνδεση mail.');
      }
    } finally {
      setBusy(false);
    }
  };

  const refreshMail = async (projectId) => {
    setBusy(true);
    setError('');
    try {
      await syncMail(projectId);
      await reload();
    } catch (err) {
      setError(err.message || 'Το mail δεν συγχρονίστηκε.');
    } finally {
      setBusy(false);
    }
  };

  const removeMail = async (projectId, email) => {
    const label = email || 'αυτό το mail';
    if (!window.confirm(`Αποσύνδεση ${label}; Το token σβήνεται από τον server.`)) return;
    setBusy(true);
    setError('');
    try {
      await disconnectMail(projectId);
      await reload();
    } catch (err) {
      setError(err.message || 'Δεν αποσυνδέθηκε το mail.');
    } finally {
      setBusy(false);
    }
  };

  const moveUnassignedMail = async () => {
    if (!assignProjectId) return;
    setBusy(true);
    setError('');
    try {
      await assignMailToProject(assignProjectId);
      setAssignProjectId('');
      await reload();
    } catch (err) {
      setError(err.message || 'Το mail δεν μεταφέρθηκε στο project.');
    } finally {
      setBusy(false);
    }
  };

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

  const mailboxByProject = new Map(
    mailboxes.filter((item) => item.project_id).map((item) => [item.project_id, item]),
  );
  const unassignedMail = mailboxes.find((item) => !item.project_id) || null;

  return (
    <>
      <div className="settings-block">
        <h3 className="settings-block__title">Mail</h3>
        <p className="settings-block__desc">
          Κάθε project έχει το δικό του Zoho. Ο βοηθός διαβάζει το mail αυτού του project και στέλνει μόνο μετά από ναι.
        </p>
        <select
          className="input"
          value={zohoRegion}
          disabled={busy}
          onChange={(event) => setZohoRegion(event.target.value)}
          aria-label="Περιοχή Zoho"
        >
          {ZOHO_REGIONS.map((region) => (
            <option key={region.id} value={region.id}>{region.label}</option>
          ))}
        </select>
        {unassignedMail ? (
          <div className="settings-mail-project">
            <span className="settings-mail-project__name">Χωρίς project</span>
            <span className="settings-mail-project__email">{unassignedMail.email}</span>
            <select
              className="input"
              value={assignProjectId}
              disabled={busy}
              onChange={(event) => setAssignProjectId(event.target.value)}
              aria-label="Project για το mail"
            >
              <option value="">Διάλεξε project</option>
              {projects.filter((project) => !mailboxByProject.has(project.id)).map((project) => (
                <option key={project.id} value={project.id}>{project.title || 'Project'}</option>
              ))}
            </select>
            <button type="button" className="btn btn--primary" disabled={busy || !assignProjectId} onClick={moveUnassignedMail}>
              Μεταφορά
            </button>
            <button type="button" className="btn btn--outline" disabled={busy} onClick={() => removeMail(null, unassignedMail.email)}>
              Αποσύνδεση
            </button>
          </div>
        ) : null}
        {projects.map((project) => {
          const mailbox = mailboxByProject.get(project.id);
          return (
            <div className="settings-mail-project" key={project.id}>
              <span className="settings-mail-project__name">{project.title || 'Project'}</span>
              {mailbox?.email ? <span className="settings-mail-project__email">{mailbox.email}</span> : null}
              <div className="settings-inline-actions">
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => connectMail(project.id)}>
                  {mailbox ? 'Σύνδεση Zoho ξανά' : 'Σύνδεση Zoho'}
                </button>
                {mailbox ? (
                  <>
                    <button type="button" className="btn btn--outline" disabled={busy} onClick={() => refreshMail(project.id)}>
                      Συγχρονισμός
                    </button>
                    <button type="button" className="btn btn--outline" disabled={busy} onClick={() => removeMail(project.id, mailbox.email)}>
                      Αποσύνδεση
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

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
            ? 'Σε αυτό το desktop app ο βοηθός μπορεί να ανοίξει, να γράψει και να συμπληρώσει μέσα στους φακέλους που έχεις επιτρέψει. Αποστολή, πληρωμή, διαγραφή και δέσμευση σε πελάτη σταματούν για ναι.'
            : 'Εδώ μόνο ανάγνωση. Άνοιγμα, εγγραφή, συμπλήρωση και αποστολή από τον υπολογιστή υπάρχουν μόνο στο desktop app.'}
        </p>
      </div>
      {error ? <p className="settings-block__desc">{error}</p> : null}
    </>
  );
}
