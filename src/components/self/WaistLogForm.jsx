import { useState } from 'react';
import { parseWaistCm, WAIST_MIN_CM, WAIST_MAX_CM } from '../../lib/health/waistReadings';

export function WaistLogForm({ onSave, compact = false, disabled = false }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cm = parseWaistCm(value);
    if (cm == null) {
      setError(`Γράψε εκατοστά (${WAIST_MIN_CM}–${WAIST_MAX_CM})`);
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
      className={`waist-log${compact ? ' waist-log--compact' : ''}`}
      onSubmit={handleSubmit}
    >
      <div className="waist-log__row">
        <input
          className="input waist-log__input"
          type="number"
          inputMode="decimal"
          min={WAIST_MIN_CM}
          max={WAIST_MAX_CM}
          step="0.1"
          placeholder="π.χ. 92"
          value={value}
          disabled={disabled || saving}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Μέση σε εκατοστά"
        />
        <span className="waist-log__unit">cm</span>
        <button
          type="submit"
          className="btn btn--primary btn--sm waist-log__submit"
          disabled={disabled || saving}
        >
          {saving ? '…' : 'Καταγραφή'}
        </button>
      </div>
      {error ? <p className="waist-log__error">{error}</p> : null}
    </form>
  );
}
