import { useState, useEffect } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  isOpenAiConfigured,
  saveOpenAiKey,
  clearOpenAiKey,
} from '../lib/openai';
import { CANVAS_INSERT_SHORTCUTS } from '../utils/canvasInsertShortcuts';
import { platform } from '../platform';
import { ShareProjectPanel } from './ShareProjectPanel';

export function SettingsView({
  focusMode,
  onFocusModeToggle,
  onClearAllData,
  onFlushSave,
  projectId,
  isLifeline,
  user,
  onSignOut,
  ouraStatus,
  onOpenOuraModal,
  onOpenScaleModal,
  onOpenCamerasModal,
  onOpenCamerasView,
  camerasConnected = false,
  cameraCount = 0,
  scaleConnected = false,
  scalePaired = false,
  selfDisplayName = '',
  onSelfDisplayNameChange,
  onSaveSelfDisplayName,
  savingSelfDisplayName = false,
  selfDisplayNameError = null,
}) {
  const [activeTab, setActiveTab] = useState('account');
  const [openAiKey, setOpenAiKey] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [appVersion, setAppVersion] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (!platform.hasAutoUpdate()) return undefined;

    platform.updater.getInfo().then((info) => {
      if (info?.version) setAppVersion(info.version);
    });

    return platform.updater.onStatus((status) => {
      setUpdateStatus(status);
      if (status?.state !== 'checking') {
        setCheckingUpdate(false);
      }
    });
  }, []);

  const handleCheckForUpdates = async () => {
    if (!platform.hasAutoUpdate()) return;
    setCheckingUpdate(true);
    setUpdateStatus({ state: 'checking', message: 'Έλεγχος για ενημέρωση…' });
    const result = await platform.updater.checkForUpdates();
    if (result?.ok === false) {
      setCheckingUpdate(false);
      setUpdateStatus({ state: 'error', message: result.error || 'Αποτυχία ελέγχου.' });
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('Αποσύνδεση; Τα projects σου μένουν στο cloud.')) return;
    setSigningOut(true);
    try {
      const saved = await onFlushSave?.();
      if (saved === false) {
        window.alert('Δεν ολοκληρώθηκε η αποθήκευση. Δοκίμασε ξανά πριν την αποσύνδεση.');
        setSigningOut(false);
        return;
      }
      await onSignOut?.();
    } catch (err) {
      window.alert(err.message || 'Αποτυχία αποσύνδεσης.');
      setSigningOut(false);
    }
  };

  const handleClearData = async () => {
    if (window.confirm('Clear all data? This cannot be undone.')) {
      await onClearAllData();
    }
  };

  const handleDisconnectOpenAi = () => {
    if (!window.confirm('Remove OpenAI key? Voice input will stop working.')) return;
    clearOpenAiKey();
    window.location.reload();
  };

  return (
    <section className="section view-section settings-view">
      <h2 className="view-section__title">Settings</h2>
      <p className="view-section__desc">Configure your account and preferences.</p>

      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tabs__tab${activeTab === 'account' ? ' settings-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          Ο λογαριασμός μου
        </button>
        <button
          type="button"
          className={`settings-tabs__tab${activeTab === 'connections' ? ' settings-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          Διασυνδέσεις
        </button>
      </div>

      {activeTab === 'account' && (
        <div className="settings-blocks">
          {user ? (
            <div className="settings-block">
              <h3 className="settings-block__title">Στοιχεία χρήστη</h3>
              <p className="settings-block__desc settings-block__desc--ok">Συνδεδεμένος</p>
              <p className="settings-meta">
                Email: <code>{user.email}</code>
              </p>
              <label className="settings-label" htmlFor="settings-display-name">
                Όνομα χρήστη (Self)
              </label>
              <input
                id="settings-display-name"
                type="text"
                className="input"
                value={selfDisplayName}
                onChange={(e) => onSelfDisplayNameChange?.(e.target.value)}
                placeholder="Το όνομά σου"
                maxLength={48}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSaveSelfDisplayName}
                disabled={savingSelfDisplayName || !onSaveSelfDisplayName}
              >
                {savingSelfDisplayName ? 'Αποθήκευση…' : 'Αποθήκευση ονόματος'}
              </button>
              {selfDisplayNameError && (
                <p className="settings-error">{selfDisplayNameError}</p>
              )}
              <button
                type="button"
                className="btn btn--outline"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Αποσύνδεση…' : 'Αποσύνδεση'}
              </button>
            </div>
          ) : isSupabaseConfigured() ? (
            <div className="settings-block">
              <h3 className="settings-block__title">Στοιχεία χρήστη</h3>
              <p className="settings-block__desc">Δεν είσαι συνδεδεμένος.</p>
            </div>
          ) : null}

          {projectId && isSupabaseConfigured() && (
            <ShareProjectPanel projectId={projectId} isLifeline={isLifeline} />
          )}

          {platform.hasAutoUpdate() && (
            <div className="settings-block">
              <h3 className="settings-block__title">Desktop app</h3>
              {appVersion && (
                <p className="settings-meta">
                  Έκδοση: <code>{appVersion}</code>
                </p>
              )}
              <p className="settings-block__desc">
                Οι ενημερώσεις ελέγχονται αυτόματα κάθε 5 λεπτά. Μετά το κατέβασμα, πάτα «Επανεκκίνηση τώρα».
              </p>
              {updateStatus?.message && (
                <p
                  className={
                    updateStatus.state === 'error' ? 'settings-error' : 'settings-meta'
                  }
                >
                  {updateStatus.message}
                </p>
              )}
              <button
                type="button"
                className="btn btn--outline"
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
              >
                {checkingUpdate ? 'Έλεγχος…' : 'Έλεγχος για ενημέρωση'}
              </button>
            </div>
          )}

          <div className="settings-block">
            <h3 className="settings-block__title">Voice (Whisper)</h3>
            {isOpenAiConfigured() ? (
              <>
                <p className="settings-block__desc settings-block__desc--ok">OpenAI connected — voice works</p>
                <button type="button" className="btn btn--outline btn--danger" onClick={handleDisconnectOpenAi}>
                  Remove OpenAI key
                </button>
              </>
            ) : (
              <>
                <p className="settings-block__desc">
                  Paste your OpenAI API key to enable voice in the Assistant (Whisper transcription).
                </p>
                <p className="settings-meta">
                  Get a key from{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                    platform.openai.com/api-keys
                  </a>
                </p>
                <label className="settings-label" htmlFor="settings-openai-key">
                  OpenAI API key
                </label>
                <input
                  id="settings-openai-key"
                  type="password"
                  className="input"
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    const trimmed = openAiKey.trim();
                    if (!trimmed) return;
                    saveOpenAiKey(trimmed);
                    window.location.reload();
                  }}
                  disabled={!openAiKey.trim()}
                >
                  Save key
                </button>
              </>
            )}
          </div>

          <div className="settings-block">
            <h3 className="settings-block__title">Focus</h3>
            <p className="settings-block__desc">Hide everything except what matters right now.</p>
            <button
              type="button"
              className={`btn ${focusMode ? 'btn--primary' : 'btn--outline'}`}
              onClick={() => onFocusModeToggle(!focusMode)}
            >
              {focusMode ? 'Exit Focus Mode' : 'Enable Focus Mode'}
            </button>
          </div>

          <div className="settings-block">
            <h3 className="settings-block__title">Shortcuts</h3>
            <p className="settings-block__desc">
              Πλήκτρα για γρήγορη εισαγωγή στο canvas (όταν δεν γράφεις σε πεδίο κειμένου).
            </p>
            <ul className="settings-shortcuts">
              {CANVAS_INSERT_SHORTCUTS.map(({ key, label }) => (
                <li key={key} className="settings-shortcuts__row">
                  <kbd className="settings-shortcuts__key">{key}</kbd>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {!isLifeline && (
            <div className="settings-block settings-block--danger">
              <h3 className="settings-block__title">Data</h3>
              <p className="settings-block__desc">Remove all saved progress and reset phases.</p>
              <button type="button" className="btn btn--outline btn--danger" onClick={handleClearData}>
                Clear All Data
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'connections' && (
        <div className="settings-blocks">
          {isSupabaseConfigured() && user ? (
            <>
              <div className="settings-block">
                <h3 className="settings-block__title">Smart Scale (QN-Scale)</h3>
                <p className="settings-block__desc">
                  {platform.isIosWeb
                    ? (scaleConnected
                      ? 'Τα κιλά συγχρονίζονται από το Android (η ζυγαριά μένει συνδεδεμένη εκεί). Στο Safari του iPhone δεν γίνεται Bluetooth pairing.'
                      : 'Στο iPhone Safari δεν γίνεται σύνδεση Bluetooth. Άφησε το Android με την εφαρμογή κοντά στη ζυγαριά και τον ίδιο λογαριασμό — μετά τα κιλά φαίνονται και εδώ.')
                    : (scaleConnected
                      ? 'Συνδεδεμένη ζυγαριά — βάρος συγχρονίζεται στο Self και Lifeline.'
                      : 'Σύνδεσε ACME SC101 (QN-Scale) μέσω Bluetooth για αυτόματη καταγραφή βάρους.')}
                </p>
                <button type="button" className="btn btn--primary" onClick={onOpenScaleModal}>
                  {scaleConnected ? 'Διαχείριση Scale' : 'Connect Scale'}
                </button>
              </div>

              <div className="settings-block">
                <h3 className="settings-block__title">Κάμερες Dahua (DMSS)</h3>
                <p className="settings-block__desc">
                  {camerasConnected
                    ? `${cameraCount} κάμερ${cameraCount === 1 ? 'α' : 'ες'} στο τοπικό δίκτυο — snapshots στο Next Move.`
                    : 'Σύνδεσε τις κάμερες Dahua / NVR με LAN IP, χρήστη και κωδικό. Χρειάζεται το ίδιο Wi‑Fi.'}
                </p>
                <div className="settings-inline-actions">
                  <button type="button" className="btn btn--primary" onClick={onOpenCamerasModal}>
                    {camerasConnected ? 'Διαχείριση καμερών' : 'Connect Cameras'}
                  </button>
                  {camerasConnected && (
                    <button type="button" className="btn btn--outline" onClick={onOpenCamerasView}>
                      Άνοιγμα
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-block">
                <h3 className="settings-block__title">Oura Ring</h3>
                <p className="settings-block__desc">
                  {ouraStatus?.connected
                    ? 'Συνδεδεμένο — sleep, readiness και activity στο Self view.'
                    : 'Σύνδεσε το Oura Ring σου για health metrics στο Self dashboard.'}
                </p>
                <button type="button" className="btn btn--primary" onClick={onOpenOuraModal}>
                  {ouraStatus?.connected ? 'Διαχείριση Oura' : 'Connect Oura'}
                </button>
              </div>
            </>
          ) : (
            <div className="settings-block">
              <p className="settings-block__desc">Συνδέσου για να διαχειριστείς τις διασυνδέσεις σου.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
