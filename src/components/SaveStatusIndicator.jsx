export function SaveStatusIndicator({
  syncing,
  hasUnsavedChanges,
  onSave,
  syncError = null,
  syncConflict = false,
  onReloadCloud,
  className = '',
  compact = false,
}) {
  let status = 'saved';
  let label = 'Αποθηκεύτηκε';

  if (syncing) {
    status = 'syncing';
    label = 'Αποθήκευση…';
  } else if (syncConflict) {
    status = 'error';
    label = 'Σύγκρουση με άλλη συσκευή';
  } else if (syncError) {
    status = 'error';
    label = 'Αποτυχία αποθήκευσης';
  } else if (hasUnsavedChanges) {
    status = 'pending';
    label = 'Μη αποθηκευμένες αλλαγές';
  }

  const canSave = Boolean(onSave) && !syncing && !syncConflict;
  const errorText = syncError || (syncConflict
    ? 'Το project άλλαξε αλλού. Φόρτωσε το cloud πριν ξανααποθηκεύσεις.'
    : '');

  return (
    <div className={`save-status-wrap ${className}`.trim()}>
      <div className="save-status-wrap__row">
        <div
          className={`save-status save-status--${status}${compact ? ' save-status--compact' : ''}`}
          role="status"
          aria-live="polite"
          title={errorText || (hasUnsavedChanges ? `${label} · αυτόματο save κάθε 5 λεπτά` : label)}
        >
          <span className="save-status__dot" aria-hidden="true" />
          {!compact && <span className="save-status__label">{label}</span>}
        </div>
        {onSave && (
          <button
            type="button"
            className="save-status__btn"
            onClick={() => onSave()}
            disabled={!canSave}
            title="Αποθήκευση τώρα (Ctrl+S)"
          >
            {compact ? 'Save' : 'Αποθήκευση'}
          </button>
        )}
        {syncConflict && onReloadCloud && (
          <button
            type="button"
            className="save-status__btn save-status__btn--reload"
            onClick={() => onReloadCloud()}
            disabled={syncing}
            title="Φόρτωση της τελευταίας έκδοσης από το cloud"
          >
            {compact ? 'Reload' : 'Φόρτωση cloud'}
          </button>
        )}
      </div>
      {!compact && errorText ? (
        <p className="save-status__error">{errorText}</p>
      ) : null}
    </div>
  );
}
