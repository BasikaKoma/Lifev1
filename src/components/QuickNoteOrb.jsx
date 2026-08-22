import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadAllProjectsOverview } from '../utils/supabaseDb';
import {
  CAPTURE_TYPE_LABELS,
  CAPTURE_TYPES,
  classifyCapture,
  describeCapture,
} from '../utils/smartCapture';

const TOAST_MS = 7000;

function buildCatalog(projectList, currentProjectId, stages, remoteCatalog) {
  const map = new Map();
  if (currentProjectId) {
    map.set(currentProjectId, stages || []);
  }
  for (const item of remoteCatalog || []) {
    if (item?.id) map.set(item.id, item.stages || []);
  }
  return [...map.entries()].map(([id, projectStages]) => {
    const listed = (projectList || []).find((p) => p.id === id);
    return { id, title: listed?.title || itemTitle(remoteCatalog, id), stages: projectStages };
  });
}

function itemTitle(catalog, id) {
  return (catalog || []).find((item) => item.id === id)?.title || '';
}

export function QuickNoteOrb({
  stages = [],
  projectList = [],
  currentProjectId,
  currentProjectTitle,
  lifelineProjectId,
  onCapture,
  onOpenProject,
  onUndoCapture,
  placement = 'global',
  docked = false,
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [overrideType, setOverrideType] = useState(null);
  const [overrideProjectId, setOverrideProjectId] = useState(null);
  const [remoteCatalog, setRemoteCatalog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const panelRef = useRef(null);
  const orbRef = useRef(null);
  const inputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [overlayStyle, setOverlayStyle] = useState(null);

  const catalog = useMemo(
    () => buildCatalog(projectList, currentProjectId, stages, remoteCatalog),
    [projectList, currentProjectId, stages, remoteCatalog]
  );

  const destinations = useMemo(() => {
    const list = [...(projectList || [])];
    if (lifelineProjectId && !list.some((p) => p.id === lifelineProjectId)) {
      list.push({ id: lifelineProjectId, title: 'Lifeline' });
    }
    if (currentProjectId && !list.some((p) => p.id === currentProjectId)) {
      list.push({ id: currentProjectId, title: currentProjectTitle || 'Project' });
    }
    return list;
  }, [projectList, lifelineProjectId, currentProjectId, currentProjectTitle]);

  const preview = useMemo(() => {
    const targetId = overrideProjectId || currentProjectId;
    const targetTitle =
      destinations.find((p) => p.id === targetId)?.title || currentProjectTitle || '';
    const ctx = {
      projectList: overrideProjectId
        ? destinations.filter((p) => p.id === overrideProjectId)
        : destinations,
      currentProjectId: targetId,
      currentProjectTitle: targetTitle,
      lifelineProjectId,
      stages: catalog.find((item) => item.id === targetId)?.stages || stages,
      catalog,
    };
    const result = classifyCapture(body, ctx);
    const projectId = overrideProjectId || result.projectId;
    const projectTitle =
      destinations.find((p) => p.id === projectId)?.title ||
      catalog.find((item) => item.id === projectId)?.title ||
      result.projectTitle;
    const type = overrideType || result.type;
    return {
      ...result,
      type,
      projectId,
      projectTitle,
      needsTriage: overrideType || overrideProjectId ? false : result.needsTriage,
    };
  }, [
    body,
    overrideProjectId,
    overrideType,
    currentProjectId,
    currentProjectTitle,
    destinations,
    lifelineProjectId,
    catalog,
    stages,
  ]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    loadAllProjectsOverview()
      .then((data) => {
        if (!cancelled) setRemoteCatalog(data || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e) => {
      if (panelRef.current?.contains(e.target) || orbRef.current?.contains(e.target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open && !toast) {
      setOverlayStyle(null);
      return undefined;
    }

    const update = () => {
      const rect = orbRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 12;
      if (placement === 'sidebar') {
        setOverlayStyle({
          top: Math.min(Math.max(24, rect.top + rect.height / 2), window.innerHeight - 24),
          left: Math.min(rect.right + gap, window.innerWidth - 24),
        });
        return;
      }
      setOverlayStyle({
        right: Math.max(12, window.innerWidth - rect.right),
        bottom: Math.max(12, window.innerHeight - rect.top + gap),
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, toast, placement]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'n' && e.code !== 'KeyN') return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (next) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  const handleSave = async () => {
    const trimmed = body.trim();
    if (!trimmed || !onCapture) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onCapture(preview);
      setBody('');
      setOverrideType(null);
      setOverrideProjectId(null);
      setOpen(false);
      showToast({
        message: saved?.message || `Αποθηκεύτηκε: ${describeCapture(preview)}`,
        projectId: saved?.projectId || preview.projectId,
        remote: Boolean(saved?.remote),
        itemId: saved?.itemId,
        type: saved?.type || preview.type,
        stageId: saved?.stageId || preview.stageId || null,
        date: saved?.date || null,
        previousNotes: saved?.previousNotes,
      });
    } catch (err) {
      setError(err.message || 'Δεν αποθηκεύτηκε.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') setOpen(false);
  };

  const className = [
    'quick-note-orb',
    placement === 'sidebar' ? 'quick-note-orb--sidebar' : '',
    placement === 'global' ? 'quick-note-orb--global' : '',
    docked ? 'quick-note-orb--dock' : '',
  ].filter(Boolean).join(' ');

  const overlay = (open || toast) && overlayStyle && typeof document !== 'undefined'
    ? createPortal(
        <div
          className={`quick-note-orb-overlay quick-note-orb-overlay--${placement}`}
          style={overlayStyle}
        >
          {open && (
            <div className="quick-note-orb__panel" ref={panelRef}>
              <div className="quick-note-orb__panel-header">
                <span>Γρήγορη σημείωση</span>
                <span className="quick-note-orb__phase">{describeCapture(preview)}</span>
              </div>
              <textarea
                ref={inputRef}
                className="input textarea quick-note-orb__input"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ιδέα, σημείωση, σκέψη…"
              />
              <div className="quick-note-orb__route">
                <select
                  className="input quick-note-orb__select"
                  value={preview.type}
                  onChange={(e) => setOverrideType(e.target.value)}
                  aria-label="Τύπος"
                >
                  {CAPTURE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CAPTURE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <select
                  className="input quick-note-orb__select"
                  value={preview.projectId || ''}
                  onChange={(e) => setOverrideProjectId(e.target.value || null)}
                  aria-label="Project"
                >
                  {destinations.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </div>
              {preview.stageTitle && (
                <p className="quick-note-orb__stage-hint">Milestone: {preview.stageTitle}</p>
              )}
              {error && <p className="quick-note-orb__error">{error}</p>}
              <div className="quick-note-orb__actions">
                <span className="quick-note-orb__hint">Ctrl+Enter · Ctrl+Shift+N</span>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleSave}
                  disabled={!body.trim() || saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {toast && (
            <div className="quick-note-orb__toast" role="status">
              <span>{toast.message}</span>
              <div className="quick-note-orb__toast-actions">
                {toast.remote && toast.projectId && onOpenProject && (
                  <button
                    type="button"
                    className="btn btn--text btn--sm"
                    onClick={() => {
                      onOpenProject(toast.projectId);
                      setToast(null);
                    }}
                  >
                    Άνοιξε
                  </button>
                )}
                {toast.itemId && onUndoCapture && (
                  <button
                    type="button"
                    className="btn btn--text btn--sm"
                    onClick={async () => {
                      await onUndoCapture(toast);
                      setToast(null);
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className={className}>
      {overlay}
      <button
        ref={orbRef}
        type="button"
        className={`quick-note-orb__btn ${open ? 'quick-note-orb__btn--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick note"
        title="Quick note (Ctrl+Shift+N)"
      >
        <span className="quick-note-orb__glow" aria-hidden="true" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
  );
}
