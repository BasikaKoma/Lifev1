import { useState } from 'react';
import { APP_NAME, LOGO_SRC } from '../constants/branding';
import { consumeSessionTakenMessage, SESSION_TAKEN_MESSAGE } from '../lib/singleSession';

export function AuthView({
  onSignIn,
  onSignUp,
  onAuthSuccess,
  currentUser,
  onContinue,
  onSignOutExisting,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    consumeSessionTakenMessage() ? SESSION_TAKEN_MESSAGE : ''
  );
  const [info, setInfo] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Συμπλήρωσε email και κωδικό.');
      return;
    }

    if (password.length < 6) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const user = await onSignUp(trimmedEmail, password, displayName.trim() || undefined);
        if (!user) {
          setInfo('Στείλαμε email επιβεβαίωσης. Έλεγξε τα εισερχόμενά σου και μετά σύνδεσου.');
          setMode('signin');
          return;
        }
        onAuthSuccess?.();
      } else {
        await onSignIn(trimmedEmail, password);
        onAuthSuccess?.();
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-card__brand">
          <img src={LOGO_SRC} alt={APP_NAME} className="auth-card__logo-full" draggable={false} />
          <p className="auth-card__subtitle">
            {mode === 'signup'
              ? 'Δημιούργησε λογαριασμό για να αποθηκεύονται τα projects σου στο cloud.'
              : 'Σύνδεσου για να δεις τα projects σου.'}
          </p>
        </div>

        {currentUser && (
          <div className="auth-card__existing">
            <p className="auth-form__info">
              Είσαι ήδη συνδεδεμένος ως <strong>{currentUser.email}</strong>.
            </p>
            <div className="auth-card__existing-actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={onContinue}>
                Άνοιγμα εφαρμογής
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={async () => {
                  setError('');
                  setLoading(true);
                  try {
                    await onSignOutExisting?.();
                  } catch (err) {
                    setError(formatAuthError(err));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Αποσύνδεση για άλλο λογαριασμό
              </button>
            </div>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label className="settings-label" htmlFor="auth-display-name">
                Όνομα (προαιρετικό)
              </label>
              <input
                id="auth-display-name"
                type="text"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="π.χ. Basika"
                autoComplete="name"
              />
            </>
          )}

          <label className="settings-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className="settings-label" htmlFor="auth-password">
            Κωδικός
          </label>
          <input
            id="auth-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />

          {error && <p className="auth-form__error">{error}</p>}
          {info && <p className="auth-form__info">{info}</p>}

          <button type="submit" className="btn btn--primary auth-form__submit" disabled={loading}>
            {loading ? 'Παρακαλώ περίμενε…' : mode === 'signup' ? 'Δημιουργία λογαριασμού' : 'Σύνδεση'}
          </button>
        </form>

        <p className="auth-card__switch">
          {mode === 'signup' ? (
            <>
              Έχεις ήδη λογαριασμό;{' '}
              <button type="button" className="btn btn--text" onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>
                Σύνδεση
              </button>
            </>
          ) : (
            <>
              Δεν έχεις λογαριασμό;{' '}
              <button type="button" className="btn btn--text" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>
                Εγγραφή
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function formatAuthError(err) {
  const message = err?.message || 'Κάτι πήγε στραβά.';

  if (/invalid login credentials/i.test(message)) {
    return 'Λάθος email ή κωδικός.';
  }
  if (/user already registered/i.test(message)) {
    return 'Υπάρχει ήδη λογαριασμός με αυτό το email.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Επιβεβαίωσε πρώτα το email σου από το link που σου στείλαμε.';
  }
  if (/password/i.test(message) && /short|least/i.test(message)) {
    return 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.';
  }
  if (/secret api key|service_role|forbidden use of secret/i.test(message)) {
    return 'Λάθος Supabase key στο build. Χρειάζεται το anon public key, όχι το service_role.';
  }

  return message;
}
