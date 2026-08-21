import { useState } from 'react';
import { INK_CONVERT_TYPES } from '../utils/inkSelection';

export function InkConvertModal({
  open,
  loading,
  error,
  text = '',
  convertType = 'sticky',
  previewUrl,
  onTextChange,
  onTypeChange,
  onConfirm,
  onClose,
  removeInk = true,
  onRemoveInkChange,
}) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  };

  const disabled = loading || busy || !text.trim();

  return (
    <div className="ink-convert-modal" role="dialog" aria-modal="true" aria-labelledby="ink-convert-title">
      <button type="button" className="ink-convert-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="ink-convert-modal__panel">
        <h2 id="ink-convert-title" className="ink-convert-modal__title">
          Αναγνώριση γραφής
        </h2>

        {loading && <p className="ink-convert-modal__status">Διαβάζω τη γραφή…</p>}
        {error && <p className="ink-convert-modal__error">{error}</p>}

        {!loading && (
          <>
            {previewUrl && (
              <img src={previewUrl} alt="Handwriting preview" className="ink-convert-modal__preview" />
            )}

            <label className="ink-convert-modal__field">
              <span>Κείμενο</span>
              <textarea
                className="input textarea"
                rows={5}
                value={text}
                onChange={(e) => onTextChange?.(e.target.value)}
                placeholder="Αναγνωρισμένο κείμενο…"
              />
            </label>

            <label className="ink-convert-modal__field">
              <span>Δημιούργησε ως</span>
              <select
                className="input"
                value={convertType}
                onChange={(e) => onTypeChange?.(e.target.value)}
              >
                {INK_CONVERT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="ink-convert-modal__check">
              <input
                type="checkbox"
                checked={removeInk}
                onChange={(e) => onRemoveInkChange?.(e.target.checked)}
              />
              Αφαίρεση γραφής μετά τη μετατροπή
            </label>
          </>
        )}

        <div className="ink-convert-modal__actions">
          <button type="button" className="ink-convert-modal__btn" onClick={onClose} disabled={busy}>
            Ακύρωση
          </button>
          <button
            type="button"
            className="ink-convert-modal__btn ink-convert-modal__btn--primary"
            onClick={handleConfirm}
            disabled={disabled}
          >
            {busy ? 'Δημιουργία…' : 'Δημιούργησε'}
          </button>
        </div>
      </div>
    </div>
  );
}
