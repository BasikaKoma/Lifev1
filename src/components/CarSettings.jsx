import { useEffect, useState } from 'react';
import { carLogUrl, createCarToken, fetchCarToken, removeCarToken } from '../lib/carLog';
import { CopyTextButton } from './CopyTextButton';

function CarLink({ id, label, url }) {
  return (
    <>
      <label className="settings-label" htmlFor={id}>{label}</label>
      <div className="car-settings__link">
        <input
          id={id}
          type="text"
          className="input"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
        <CopyTextButton text={url} className="btn btn--outline" title="Αντιγραφή συνδέσμου" ariaLabel={`Αντιγραφή: ${label}`} />
      </div>
    </>
  );
}

/** The block itself; `state` is 'loading', 'ready' or 'missing' (the car tables are not in the database yet). */
export function CarSettingsView({ state, token, busy, error, onCreate, onRemove }) {
  return (
    <div className="settings-block">
      <h3 className="settings-block__title">Αυτοκίνητο (iPhone)</h3>
      <p className="settings-block__desc">
        Ο χρόνος στο αμάξι γράφεται μόνος του: το iPhone ειδοποιεί το lifev1 όταν συνδέεται στο αυτοκίνητο και όταν
        αποσυνδέεται, και η διαδρομή μπαίνει στο Path ως block «Οδήγηση».
      </p>

      {state === 'loading' ? <p className="car-settings__note">Φόρτωση…</p> : null}

      {state === 'missing' ? (
        <p className="car-settings__note">Δεν έχει στηθεί ακόμα στη βάση (supabase/053_car_trips.sql).</p>
      ) : null}

      {state === 'ready' && !token ? (
        <button type="button" className="btn btn--primary" onClick={onCreate} disabled={busy}>
          {busy ? 'Δημιουργία…' : 'Δημιουργία συνδέσμων'}
        </button>
      ) : null}

      {state === 'ready' && token ? (
        <>
          <CarLink id="settings-car-connect" label="Σύνδεσμος «Μπαίνω»" url={carLogUrl(token, 'connect')} />
          <CarLink id="settings-car-disconnect" label="Σύνδεσμος «Βγαίνω»" url={carLogUrl(token, 'disconnect')} />
          <ol className="car-settings__steps">
            <li>
              Στο iPhone άνοιξε τις Συντομεύσεις (Shortcuts) → «Αυτοματοποίηση» → νέα προσωπική αυτοματοποίηση.
            </li>
            <li>
              Έναυσμα: CarPlay, ή Bluetooth με συσκευή το αυτοκίνητό σου. Μόνο για τη σύνδεση, με άμεση εκτέλεση
              (Run Immediately).
            </li>
            <li>
              «Προσθήκη ενέργειας» → «Λήψη περιεχομένων URL» (Get Contents of URL) και κόλλησε τον σύνδεσμο «Μπαίνω».
            </li>
            <li>Φτιάξε δεύτερη αυτοματοποίηση για την αποσύνδεση, με τον σύνδεσμο «Βγαίνω».</li>
          </ol>
          <p className="car-settings__note">
            Η διαδρομή φαίνεται στο Path λίγα λεπτά μετά το τέλος της, μόλις ανοίξεις την εφαρμογή. Όποιος έχει τους
            συνδέσμους μπορεί να γράψει διαδρομές· αν τους μοιράστηκες κατά λάθος, φτιάξε νέους.
          </p>
          <div className="settings-inline-actions">
            <button type="button" className="btn btn--outline" onClick={onCreate} disabled={busy}>
              Νέοι σύνδεσμοι
            </button>
            <button type="button" className="btn btn--outline btn--danger" onClick={onRemove} disabled={busy}>
              Κατάργηση
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="settings-error">{error}</p> : null}
    </div>
  );
}

function isMissingTable(error) {
  const message = [error?.message, error?.details, error?.code].filter(Boolean).join(' ');
  return /could not find the table|PGRST205|relation .* does not exist|42P01/i.test(message);
}

export function CarSettings() {
  const [state, setState] = useState('loading');
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCarToken()
      .then((next) => {
        if (cancelled) return;
        setToken(next);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (isMissingTable(err)) {
          setState('missing');
          return;
        }
        setState('ready');
        setError(err?.message || 'Οι σύνδεσμοι δεν φορτώθηκαν.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action, fallback) => {
    setBusy(true);
    setError(null);
    try {
      setToken(await action());
    } catch (err) {
      setError(err?.message || fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    if (token && !window.confirm('Νέοι σύνδεσμοι; Οι τωρινοί θα πάψουν να δουλεύουν και θα πρέπει να τους αλλάξεις στα Shortcuts.')) return;
    run(createCarToken, 'Οι σύνδεσμοι δεν δημιουργήθηκαν.');
  };

  const handleRemove = () => {
    if (!window.confirm('Κατάργηση; Οι σύνδεσμοι θα πάψουν να δουλεύουν. Οι διαδρομές που γράφτηκαν ήδη στο Path μένουν.')) return;
    run(async () => {
      await removeCarToken();
      return null;
    }, 'Οι σύνδεσμοι δεν καταργήθηκαν.');
  };

  return (
    <CarSettingsView
      state={state}
      token={token}
      busy={busy}
      error={error}
      onCreate={handleCreate}
      onRemove={handleRemove}
    />
  );
}
