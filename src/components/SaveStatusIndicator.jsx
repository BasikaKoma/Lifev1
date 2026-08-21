export function SaveStatusIndicator({
  syncing,
  hasUnsavedChanges,
  onSave,
  className = '',
  compact = false,
}) {
  let status = 'saved';
  let label = 'Αποθηκεύτηκε';

  if (syncing) {
    status = 'syncing';
    label = 'Αποθήκευση…';
  } else if (hasUnsavedChanges) {
    status = 'pending';
    label = 'Μη αποθηκευμένες αλλαγές';
  }

  const canSave = Boolean(onSave) && hasUnsavedChanges && !syncing;

  return (
    <div className={`save-status-wrap ${className}`.trim()}>
      <div
        className={`save-status save-status--${status}${compact ? ' save-status--compact' : ''}`}
        role="status"
        aria-live="polite"
        title={hasUnsavedChanges ? `${label} · αυτόματο save κάθε 5 λεπτά` : label}
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
    </div>
  );
}
