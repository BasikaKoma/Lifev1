import { useState } from 'react';
import { circumferenceSpec, parseCircumferenceCm } from '../../lib/health/circumferenceReadings';

export function WaistLogForm({
  kind = 'waist',
  onSave,
  compact = false,
  inline = false,
  disabled = false,
  submitLabel = 'Καταγραφή',
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const spec = circumferenceSpec(kind);
    const cm = parseCircumferenceCm(kind, value);
    if (cm == null) {
      setError(spec ? `Γράψε εκατοστά (${spec.min}–${spec.max})` : 'Άκυρη μέτρηση');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const saved = await onSave(cm);
      if (!saved) {
        setError('Δεν αποθηκεύτηκε. Έλεγξε σύνδεση.');
        return;
      }
      setValue('');
    } catch (err) {
      setError(err?.message || 'Δεν αποθηκεύτηκε');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={`waist-log${compact ? ' waist-log--compact' : ''}${inline ? ' waist-log--inline' : ''}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="waist-log__row">
        <input
          className="input waist-log__input"
          type="number"
          inputMode="decimal"
          min={circumferenceSpec(kind)?.min}
          max={circumferenceSpec(kind)?.max}
          step="0.1"
          placeholder={inline ? '—' : 'π.χ. 92'}
          value={value}
          disabled={disabled || saving}
          onChange={(event) => setValue(event.target.value)}
          aria-label={`${circumferenceSpec(kind)?.label || 'Μέτρηση'} σε εκατοστά`}
        />
        <span className="waist-log__unit">cm</span>
        <button
          type="submit"
          className="btn btn--primary btn--sm waist-log__submit"
          disabled={disabled || saving}
          aria-label={`Καταγραφή ${circumferenceSpec(kind)?.label || 'μέτρησης'}`}
        >
          {saving ? '…' : submitLabel}
        </button>
      </div>
      {error ? <p className="waist-log__error">{error}</p> : null}
    </form>
  );
}
