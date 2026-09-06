import { useEffect, useRef, useState } from 'react';
import { formatPlanFileSize, getPlanFileBlob, loadPdfDocument } from '../../lib/path/planFile';

export function PathPlanFileButton({ sourceFile, label, className = 'btn' }) {
  const [open, setOpen] = useState(false);
  if (!sourceFile?.id && !sourceFile?.name) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        title={sourceFile.name || 'Original plan PDF'}
        onClick={() => setOpen(true)}
      >
        {label || 'Open original PDF'}
      </button>
      <PathPlanFileViewer open={open} sourceFile={sourceFile} onClose={() => setOpen(false)} />
    </>
  );
}

export function PathPlanFileViewer({ open, sourceFile, onClose }) {
  const pagesRef = useRef(null);
  const [status, setStatus] = useState('Loading PDF…');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const container = pagesRef.current;
    let cancelled = false;
    let pdf = null;
    setError('');
    setStatus('Loading PDF…');

    (async () => {
      try {
        const blob = await getPlanFileBlob(sourceFile);
        if (cancelled) return;
        if (!blob) {
          setStatus('');
          setError('The original PDF is not available on this device yet.');
          return;
        }
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        pdf = await loadPdfDocument(data);
        if (cancelled) return;
        if (container) container.replaceChildren();
        const width = Math.max(320, (container?.clientWidth || 720) - 8);
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          if (cancelled) return;
          const unscaled = page.getViewport({ scale: 1 });
          const ratio = window.devicePixelRatio || 1;
          const cssScale = Math.min(1.6, width / unscaled.width);
          const viewport = page.getViewport({ scale: cssScale * ratio });
          const canvas = document.createElement('canvas');
          canvas.className = 'path-pdf-page';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / ratio}px`;
          canvas.style.height = `${viewport.height / ratio}px`;
          container?.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        if (!cancelled) setStatus('');
      } catch (err) {
        if (!cancelled) {
          setStatus('');
          setError(err.message || 'Could not open the PDF.');
        }
      }
    })();

    return () => {
      cancelled = true;
      pdf?.destroy?.();
      container?.replaceChildren();
    };
  }, [open, sourceFile]);

  if (!open) return null;

  const sizeLabel = formatPlanFileSize(sourceFile?.size);
  const title = sourceFile?.name || 'Original plan PDF';

  return (
    <div className="path-modal path-pdf-modal" role="dialog" aria-modal="true" aria-labelledby="path-pdf-title">
      <button type="button" className="path-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="path-modal__panel path-pdf-modal__panel">
        <div className="path-pdf-modal__head">
          <div>
            <h2 id="path-pdf-title">{title}</h2>
            {sizeLabel ? <p className="path-empty">{sizeLabel}</p> : null}
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        {error ? <p className="path-error">{error}</p> : null}
        {status ? <p className="path-empty">{status}</p> : null}
        <div ref={pagesRef} className="path-pdf-pages" />
      </div>
    </div>
  );
}
