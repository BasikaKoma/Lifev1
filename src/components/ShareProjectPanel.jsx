import { useCallback, useEffect, useState } from 'react';
import {
  getProjectSharingInfo,
  inviteProjectByEmail,
  createShareLink,
  removeProjectMember,
  leaveSharedProject,
  MAX_PROJECT_COLLABORATORS,
} from '../utils/projectSharing';

function memberLabel(member) {
  return member.displayName || member.email || 'Collaborator';
}

export function ShareProjectPanel({ projectId, isLifeline }) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!projectId || isLifeline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectSharingInfo(projectId);
      setInfo(data);
    } catch (err) {
      setError(err.message || 'Failed to load sharing settings');
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, isLifeline]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (isLifeline) {
    return (
      <div className="settings-block">
        <h3 className="settings-block__title">Κοινή χρήση</h3>
        <p className="settings-block__desc">
          Το Lifeline είναι πάντα προσωπικό και δεν μοιράζεται με άλλους.
        </p>
      </div>
    );
  }

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteProjectByEmail(projectId, trimmed);
      if (result.status === 'added') {
        setMessage(`Προστέθηκε ο/η ${trimmed} ως συνεργάτης.`);
      } else {
        setMessage(`Στάλθηκε πρόσκληση στο ${trimmed}. Μοιράσου και το link αν χρειάζεται.`);
      }
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err.message || 'Αποτυχία πρόσκλησης');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createShareLink(projectId);
      await navigator.clipboard.writeText(url);
      setMessage('Το link αντιγράφηκε στο clipboard.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Αποτυχία δημιουργίας link');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!window.confirm('Αφαίρεση συνεργάτη από το project;')) return;
    setBusy(true);
    setError(null);
    try {
      await removeProjectMember(projectId, userId);
      setMessage('Ο συνεργάτης αφαιρέθηκε.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Αποτυχία αφαίρεσης');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Αποχώρηση από αυτό το κοινό project;')) return;
    setBusy(true);
    setError(null);
    try {
      await leaveSharedProject(projectId);
      setMessage('Αποχώρησες από το project. Κάνε refresh ή άλλαξε project.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Αποτυχία αποχώρησης');
    } finally {
      setBusy(false);
    }
  };

  const slotsLeft = info ? Math.max(0, MAX_PROJECT_COLLABORATORS - info.memberCount) : 0;
  const canInvite = info?.isOwner && slotsLeft > 0;

  return (
    <div className="settings-block">
      <h3 className="settings-block__title">Κοινή χρήση</h3>
      <p className="settings-block__desc">
        Πρόσκλησε έως {MAX_PROJECT_COLLABORATORS} συνεργάτες. Όλοι έχουν δικαιώματα επεξεργασίας.
        Οι αλλαγές συγχρονίζονται live — μην επεξεργάζεστε ταυτόχρονα το ίδιο project.
      </p>

      {loading && <p className="settings-meta">Φόρτωση…</p>}
      {error && <p className="settings-error">{error}</p>}
      {message && <p className="settings-block__desc settings-block__desc--ok">{message}</p>}

      {!loading && info && (
        <>
          <p className="settings-meta">
            {info.isOwner ? 'Είσαι ιδιοκτήτης' : `Κοινό project · ιδιοκτήτης: ${memberLabel(info.owner)}`}
            {' · '}
            {info.memberCount}/{MAX_PROJECT_COLLABORATORS} συνεργάτες
          </p>

          {(info.members.length > 0 || info.isOwner) && (
            <ul className="share-members">
              <li className="share-members__row">
                <span className="share-members__name">{memberLabel(info.owner)}</span>
                <span className="share-members__role">Owner</span>
              </li>
              {info.members.map((member) => (
                <li key={member.userId} className="share-members__row">
                  <span className="share-members__name">{memberLabel(member)}</span>
                  {info.isOwner ? (
                    <button
                      type="button"
                      className="btn btn--text btn--sm share-members__remove"
                      onClick={() => handleRemove(member.userId)}
                      disabled={busy}
                    >
                      Αφαίρεση
                    </button>
                  ) : (
                    <span className="share-members__role">Editor</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {info.isOwner && canInvite && (
            <>
              <label className="settings-label" htmlFor="share-email">
                Πρόσκληση με email
              </label>
              <div className="share-invite-row">
                <input
                  id="share-email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="συνεργάτης@email.com"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleInvite();
                  }}
                />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleInvite}
                  disabled={busy || !email.trim()}
                >
                  Πρόσκληση
                </button>
              </div>

              <p className="settings-meta share-link-meta">
                Ή μοιράσου link: {info.shareLink ? <code>{info.shareLink}</code> : '—'}
              </p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={handleCopyLink}
                disabled={busy}
              >
                Αντιγραφή link πρόσκλησης
              </button>
            </>
          )}

          {info.isOwner && !canInvite && (
            <p className="settings-meta">Έχεις φτάσει το όριο των {MAX_PROJECT_COLLABORATORS} συνεργατών.</p>
          )}

          {!info.isOwner && (
            <button
              type="button"
              className="btn btn--outline btn--danger"
              onClick={handleLeave}
              disabled={busy}
            >
              Αποχώρηση από project
            </button>
          )}
        </>
      )}
    </div>
  );
}
