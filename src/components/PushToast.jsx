import { useEffect } from 'react';

const AUTO_HIDE_MS = 8000;

/** Android does not show FCM notifications while the app is open, so they appear here. */
export function PushToast({ notice, onOpen, onDismiss }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  return (
    <div
      className="push-toast"
      role="status"
      onClick={() => {
        onOpen?.(notice.url);
        onDismiss();
      }}
    >
      <div className="push-toast__text">
        <p className="push-toast__title">{notice.title || 'lifev1'}</p>
        {notice.body && <p className="push-toast__body">{notice.body}</p>}
      </div>
      <button
        type="button"
        className="push-toast__close"
        aria-label="Κλείσιμο"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}
