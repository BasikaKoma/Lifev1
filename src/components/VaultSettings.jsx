import { useEffect, useState } from 'react';
import {
  canUseFolderVault,
  connectFolderVault,
  disconnectFolderVault,
  folderVaultUnavailableReason,
  getVaultConfig,
  refreshVaultConnection,
  revealVaultFolder,
  subscribeVaultConfig,
} from '../lib/vault';

export function VaultSettings({ onFlushSave }) {
  const [config, setConfig] = useState(getVaultConfig);
  const [status, setStatus] = useState({ connected: false, ready: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pickingFolder, setPickingFolder] = useState(false);

  useEffect(() => subscribeVaultConfig(setConfig), []);

  useEffect(() => {
    let cancelled = false;
    refreshVaultConnection()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config.enabled, config.displayPath]);

  const canReveal = typeof window !== 'undefined' && Boolean(window.electronVault);
  const available = canUseFolderVault();
  const folderActive = config.enabled && (status.connected || status.ready);
  const pathLabel = config.displayPath || config.displayName || status.path || '';
  const mode = folderActive ? 'folder' : 'cloud';
  const showFolderPicker = available && (folderActive || pickingFolder);

  const handleSelectCloud = async () => {
    setError(null);
    if (pickingFolder && !folderActive) {
      setPickingFolder(false);
      return;
    }
    if (!config.enabled) return;
    if (!window.confirm('Η αποθήκευση θα γίνει ξανά στο cloud. Τα αρχεία στον φάκελο μένουν όπως είναι.')) {
      return;
    }
    setBusy(true);
    try {
      await disconnectFolderVault();
      setStatus(await refreshVaultConnection());
    } catch (err) {
      setError(err?.message || 'Αποτυχία αλλαγής αποθήκευσης');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectFolder = () => {
    setError(null);
    if (!available) return;
    setPickingFolder(true);
  };

  const handlePickFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!window.confirm('Με την επιλογή φακέλου, τα νέα δεδομένα γράφονται μόνο εκεί. Η αποθήκευση στο cloud σταματά.')) {
        return;
      }
      if (onFlushSave) await onFlushSave();
      const before = getVaultConfig();
      const after = await connectFolderVault();
      if (after.enabled && after.displayPath && after.displayPath !== before.displayPath) {
        window.location.reload();
        return;
      }
      setPickingFolder(false);
      setStatus(await refreshVaultConnection());
    } catch (err) {
      setError(err?.message || 'Αποτυχία φακέλου');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      if (onFlushSave) await onFlushSave();
      const before = getVaultConfig();
      const after = await connectFolderVault();
      if (after.enabled && after.displayPath && after.displayPath !== before.displayPath) {
        window.location.reload();
        return;
      }
      setStatus(await refreshVaultConnection());
    } catch (err) {
      setError(err?.message || 'Αποτυχία φακέλου');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    setBusy(true);
    setError(null);
    try {
      await revealVaultFolder();
    } catch (err) {
      setError(err?.message || 'Αποτυχία ανοίγματος φακέλου');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-block">
      <h3 className="settings-block__title">Πού αποθηκεύονται τα δεδομένα</h3>
      <p className="settings-block__desc">
        Διάλεξε ένα από τα δύο. Δεν γίνεται και στα δύο μαζί.
      </p>

      <div className="settings-choice" role="radiogroup" aria-label="Τόπος αποθήκευσης">
        <label className={`settings-choice__option${mode === 'cloud' && !pickingFolder ? ' settings-choice__option--active' : ''}`}>
          <input
            type="radio"
            name="storage-destination"
            checked={mode === 'cloud' && !pickingFolder}
            onChange={handleSelectCloud}
            disabled={busy}
          />
          <span>
            <strong>Αποθήκευση στο cloud</strong>
            <span className="settings-choice__hint">
              Τα δεδομένα ανεβαίνουν στον λογαριασμό σου. Τα βλέπεις από κάθε συσκευή.
            </span>
          </span>
        </label>

        <label className={`settings-choice__option${showFolderPicker ? ' settings-choice__option--active' : ''}${!available ? ' settings-choice__option--disabled' : ''}`}>
          <input
            type="radio"
            name="storage-destination"
            checked={showFolderPicker}
            onChange={handleSelectFolder}
            disabled={busy || !available}
          />
          <span>
            <strong>Αποθήκευση σε φάκελο</strong>
            <span className="settings-choice__hint">
              Τα δεδομένα γράφονται ως αρχεία στον υπολογιστή σου. Το cloud σταματά.
            </span>
          </span>
        </label>
      </div>

      {mode === 'cloud' && !pickingFolder && (
        <p className="settings-block__desc settings-block__desc--ok">
          Τώρα αποθηκεύεται στο cloud.
        </p>
      )}

      {!available && (
        <p className="settings-meta">{folderVaultUnavailableReason()}</p>
      )}

      {showFolderPicker && (
        <div className="settings-choice__folder">
          {folderActive ? (
            <>
              <p className="settings-block__desc settings-block__desc--ok">
                Τώρα αποθηκεύεται μόνο στον φάκελο. Το cloud δεν παίρνει νέες αλλαγές.
              </p>
              {pathLabel ? (
                <p className="settings-meta">
                  Φάκελος: <code>{pathLabel}</code>
                </p>
              ) : null}
              {config.enabled && !status.connected && (
                <p className="settings-meta">
                  Ο φάκελος δεν είναι διαθέσιμος σε αυτό το παράθυρο. Ξαναδιάλεξέ τον.
                </p>
              )}
              <div className="settings-inline-actions">
                {canReveal && (
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={handleReveal}
                    disabled={busy}
                  >
                    Άνοιγμα φακέλου
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleChangeFolder}
                  disabled={busy}
                >
                  {busy ? 'Εργασία…' : 'Αλλαγή φακέλου'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-meta">
                Διάλεξε τον φάκελο όπου θα γράφονται τα αρχεία. Μπορεί να είναι μέσα σε Dropbox, iCloud ή Syncthing.
              </p>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handlePickFolder}
                  disabled={busy}
                >
                  {busy ? 'Σύνδεση…' : 'Επιλογή φακέλου'}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setPickingFolder(false);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Άκυρο
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="settings-error">{error}</p>}
    </div>
  );
}
