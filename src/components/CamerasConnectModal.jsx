import { useEffect, useMemo, useRef, useState } from 'react';
import { createCameraId, normalizeCamera, parseCameraHostInput } from '../lib/cameras/store';
import './OuraConnectModal.css';

const EMPTY_FORM = {
  id: '',
  name: '',
  host: '',
  port: 80,
  protocol: 'http',
  username: 'admin',
  password: '',
  channel: 1,
};

function cameraToForm(camera) {
  if (!camera) return { ...EMPTY_FORM, id: createCameraId() };
  return {
    id: camera.id,
    name: camera.name || '',
    host: camera.host || '',
    port: camera.port || 80,
    protocol: camera.protocol || 'http',
    username: camera.username || 'admin',
    password: camera.password || '',
    channel: camera.channel || 1,
  };
}

export function CamerasConnectModal({
  open,
  onClose,
  cameras = [],
  frames = {},
  supported = false,
  testingId = null,
  onSave,
  onDelete,
  onTest,
  onOpenView,
}) {
  const [form, setForm] = useState(() => cameraToForm(null));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const selected = useMemo(
    () => cameras.find((item) => item.id === form.id) || null,
    [cameras, form.id],
  );

  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setError('');
      setMessage('');
      setPreview(null);
      setForm(cameraToForm(cameras[0] || null));
    }
    wasOpen.current = open;
  }, [open, cameras]);

  if (!open) return null;

  const patch = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setMessage('');
  };

  const handleHostBlur = () => {
    const parsed = parseCameraHostInput(form.host);
    if (!parsed.host) return;
    setForm((prev) => ({
      ...prev,
      host: parsed.host,
      port: String(form.host).includes(':') ? parsed.port : prev.port || parsed.port,
      protocol: parsed.protocol || prev.protocol,
    }));
  };

  const handleNew = () => {
    setForm(cameraToForm(null));
    setPreview(null);
    setError('');
    setMessage('Νέα κάμερα — συμπλήρωσε IP, χρήστη και κωδικό.');
  };

  const handleCloneChannel = () => {
    const nextChannel = Number(form.channel || 1) + 1;
    setForm((prev) => ({
      ...prev,
      id: createCameraId(),
      name: prev.name ? `${prev.name.replace(/\s+\d+$/, '')} ${nextChannel}` : `Κάμερα ${nextChannel}`,
      channel: nextChannel,
    }));
    setPreview(null);
    setMessage(`Νέο κανάλι ${nextChannel} στο ίδιο NVR.`);
  };

  const draftCamera = () =>
    normalizeCamera({
      ...form,
      name: form.name || `Κάμερα ${form.channel || 1}`,
    });

  const handleSave = () => {
    try {
      onSave?.(draftCamera());
      setMessage('Αποθηκεύτηκε τοπικά σε αυτή τη συσκευή.');
    } catch (err) {
      setError(err?.message || 'Δεν αποθηκεύτηκε.');
    }
  };

  const handleTest = async () => {
    setError('');
    setMessage('');
    const result = await onTest?.(draftCamera());
    if (result?.ok) {
      setPreview(result.dataUrl);
      setMessage('Σύνδεση OK — πήραμε snapshot.');
    } else {
      setPreview(null);
      setError(result?.error || 'Αποτυχία σύνδεσης.');
    }
  };

  return (
    <div className="oura-modal" role="dialog" aria-modal="true" aria-labelledby="cameras-modal-title">
      <button type="button" className="oura-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="oura-modal__panel">
        <header className="oura-modal__header">
          <div>
            <h2 id="cameras-modal-title" className="oura-modal__title">
              Κάμερες Dahua
            </h2>
            <p className="oura-modal__subtitle">
              Τοπική σύνδεση στο NVR/κάμερα (CGI snapshot). Όχι μέσω DMSS cloud.
            </p>
          </div>
          <span
            className={`oura-modal__badge ${cameras.length ? 'oura-modal__badge--connected' : 'oura-modal__badge--disconnected'}`}
          >
            {cameras.length ? `${cameras.length} συνδεδεμένες` : 'Καμία'}
          </span>
        </header>

        {!supported && (
          <p className="oura-modal__hint">
            Άνοιξε την εφαρμογή Windows ή Android στο ίδιο Wi‑Fi με τις κάμερες. Ο browser δεν μπορεί να μιλήσει στο NVR.
          </p>
        )}

        {supported && (
          <p className="oura-modal__hint">
            Στο DMSS: συσκευή → πληροφορίες → LAN IP. Default χρήστης συνήθως <strong>admin</strong>. Κανάλι 1 = πρώτη κάμερα του NVR.
          </p>
        )}

        {cameras.length > 0 && (
          <section className="oura-modal__section">
            <h3 className="oura-modal__section-title">Αποθηκευμένες</h3>
            <div className="oura-modal__data-list">
              {cameras.map((camera) => (
                <button
                  key={camera.id}
                  type="button"
                  className="oura-modal__data-item"
                  onClick={() => {
                    setForm(cameraToForm(camera));
                    setPreview(frames[camera.id]?.dataUrl || null);
                    setError('');
                    setMessage('');
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderColor: form.id === camera.id ? 'rgba(125, 211, 252, 0.45)' : undefined,
                  }}
                >
                  <span className="oura-modal__data-label">{camera.name}</span>
                  <span className="oura-modal__data-desc">
                    {camera.host}:{camera.port} · κανάλι {camera.channel}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="oura-modal__section">
          <h3 className="oura-modal__section-title">{selected ? 'Επεξεργασία' : 'Νέα κάμερα'}</h3>
          <label className="oura-modal__metric">
            <span className="oura-modal__metric-label">Όνομα</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              placeholder="Είσοδος"
            />
          </label>
          <label className="oura-modal__metric">
            <span className="oura-modal__metric-label">IP / host</span>
            <input
              className="input"
              value={form.host}
              onChange={(e) => patch('host', e.target.value)}
              onBlur={handleHostBlur}
              placeholder="192.168.1.108"
              autoComplete="off"
            />
          </label>
          <div className="oura-modal__metrics-grid">
            <label className="oura-modal__metric">
              <span className="oura-modal__metric-label">Port</span>
              <input
                className="input"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => patch('port', e.target.value)}
              />
            </label>
            <label className="oura-modal__metric">
              <span className="oura-modal__metric-label">Κανάλι</span>
              <input
                className="input"
                type="number"
                min={1}
                max={64}
                value={form.channel}
                onChange={(e) => patch('channel', e.target.value)}
              />
            </label>
          </div>
          <label className="oura-modal__metric">
            <span className="oura-modal__metric-label">Χρήστης</span>
            <input
              className="input"
              value={form.username}
              onChange={(e) => patch('username', e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="oura-modal__metric">
            <span className="oura-modal__metric-label">Κωδικός</span>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => patch('password', e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </section>

        {error && <p className="oura-modal__error">{error}</p>}
        {message && !error && <p className="oura-modal__hint">{message}</p>}

        {(preview || frames[form.id]?.dataUrl) && (
          <img
            src={preview || frames[form.id].dataUrl}
            alt="Camera snapshot"
            style={{
              width: '100%',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: '#020617',
              aspectRatio: '16 / 9',
              objectFit: 'cover',
            }}
          />
        )}

        <footer className="oura-modal__actions">
          <button type="button" className="oura-modal__btn" onClick={onClose}>
            Κλείσιμο
          </button>
          <button type="button" className="oura-modal__btn oura-modal__btn--ghost" onClick={handleNew}>
            Νέα
          </button>
          {form.host ? (
            <button type="button" className="oura-modal__btn oura-modal__btn--ghost" onClick={handleCloneChannel}>
              + Κανάλι
            </button>
          ) : null}
          {selected ? (
            <button
              type="button"
              className="oura-modal__btn oura-modal__btn--danger"
              onClick={() => {
                onDelete?.(selected.id);
                setForm(cameraToForm(null));
                setPreview(null);
                setMessage('Διαγράφηκε από αυτή τη συσκευή.');
              }}
            >
              Διαγραφή
            </button>
          ) : null}
          <button
            type="button"
            className="oura-modal__btn oura-modal__btn--ghost"
            onClick={handleTest}
            disabled={!supported || !form.host || Boolean(testingId)}
          >
            {testingId ? 'Δοκιμή…' : 'Δοκιμή'}
          </button>
          <button type="button" className="oura-modal__btn oura-modal__btn--primary" onClick={handleSave} disabled={!form.host}>
            Αποθήκευση
          </button>
          {cameras.length > 0 && (
            <button
              type="button"
              className="oura-modal__btn oura-modal__btn--primary"
              onClick={() => {
                onClose?.();
                onOpenView?.();
              }}
            >
              Άνοιγμα
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
