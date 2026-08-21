import { useLayoutEffect, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeAnchorStyle(anchorRect, panelSize) {
  if (!anchorRect) return null;

  const margin = 12;
  const gap = 10;
  let top = anchorRect.top - panelSize.height - gap;
  let left = anchorRect.left + anchorRect.width / 2 - panelSize.width / 2;

  if (top < margin) {
    top = anchorRect.bottom + gap;
  }

  left = clamp(left, margin, window.innerWidth - panelSize.width - margin);
  top = clamp(top, margin, window.innerHeight - panelSize.height - margin);

  return { top, left, width: panelSize.width };
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Διαγραφή',
  cancelLabel = 'Ακύρωση',
  onConfirm,
  onCancel,
  danger = true,
  anchorRect = null,
}) {
  const [panelStyle, setPanelStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }

    const panelSize = { width: 300, height: 168 };
    const update = () => setPanelStyle(computeAnchorStyle(anchorRect, panelSize));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRect]);

  if (!open) return null;

  const anchored = Boolean(anchorRect && panelStyle);

  return (
    <div
      className={`confirm-dialog${anchored ? ' confirm-dialog--anchored' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <button type="button" className="confirm-dialog__backdrop" onClick={onCancel} aria-label="Close" />
      <div
        className="confirm-dialog__panel"
        style={anchored ? panelStyle : undefined}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        {message && <p className="confirm-dialog__message">{message}</p>}
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn${danger ? ' confirm-dialog__btn--danger' : ' confirm-dialog__btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
