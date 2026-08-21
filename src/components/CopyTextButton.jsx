import { useState } from 'react';
import { copyTextToClipboard } from '../utils/copyText';

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CopyTextButton({
  text,
  className = '',
  title = 'Αντιγραφή',
  ariaLabel = 'Αντιγραφή',
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      className={className}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={handleCopy}
      onClick={(e) => e.stopPropagation()}
      title={copied ? 'Αντιγράφηκε!' : title}
      aria-label={copied ? 'Αντιγράφηκε' : ariaLabel}
    >
      {copied ? '✓' : <CopyIcon />}
    </button>
  );
}
