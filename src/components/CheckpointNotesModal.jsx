import { useCallback, useEffect, useRef, useState } from 'react';
import { matchInsertShortcut } from '../utils/canvasInsertShortcuts';
import { generateId } from '../data/templates';

function createCheckpointNote(text = '') {
  return {
    id: `cp-note-${generateId()}`,
    text,
    createdAt: new Date().toISOString(),
  };
}

function resizeTextarea(el, minHeight = 80) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
}

export function CheckpointNotesModal({
  open,
  stageId,
  checkpointId,
  stages = [],
  onUpdateCheckpoint,
  onClose,
}) {
  const stage = stages.find((s) => s.id === stageId) || null;
  const checkpoint = stage?.checkpoints?.find((cp) => cp.id === checkpointId) || null;
  const notes = checkpoint?.notesStickies || [];

  const [descDraft, setDescDraft] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [focusNoteId, setFocusNoteId] = useState(null);

  const checkpointRef = useRef(checkpoint);
  const descDraftRef = useRef(descDraft);
  const noteDraftsRef = useRef(noteDrafts);
  const descRef = useRef(null);
  const noteRefs = useRef(new Map());

  checkpointRef.current = checkpoint;
  descDraftRef.current = descDraft;
  noteDraftsRef.current = noteDrafts;

  const patchCheckpoint = useCallback(
    (updates) => {
      if (!stageId || !checkpointId) return;
      onUpdateCheckpoint?.(stageId, checkpointId, updates);
    },
    [stageId, checkpointId, onUpdateCheckpoint]
  );

  const flushDrafts = useCallback(() => {
    const current = checkpointRef.current;
    if (!current) return;

    const nextDesc = descDraftRef.current;
    const updates = {};
    if (nextDesc !== (current.description || '')) {
      updates.description = nextDesc;
    }

    const existing = current.notesStickies || [];
    let notesChanged = false;
    const nextNotes = existing.map((note) => {
      if (!(note.id in noteDraftsRef.current)) return note;
      const text = noteDraftsRef.current[note.id];
      if (text === (note.text || '')) return note;
      notesChanged = true;
      return { ...note, text };
    });
    if (notesChanged) updates.notesStickies = nextNotes;

    if (Object.keys(updates).length) patchCheckpoint(updates);
  }, [patchCheckpoint]);

  const openedKeyRef = useRef('');
  useEffect(() => {
    const key = open && checkpointId ? `${stageId}:${checkpointId}` : '';
    if (!key) {
      openedKeyRef.current = '';
      return;
    }
    if (openedKeyRef.current === key) return;
    openedKeyRef.current = key;
    setDescDraft(checkpoint?.description || '');
    const drafts = {};
    for (const note of checkpoint?.notesStickies || []) {
      drafts[note.id] = note.text || '';
    }
    setNoteDrafts(drafts);
    setFocusNoteId(null);
  }, [open, stageId, checkpointId, checkpoint]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      resizeTextarea(descRef.current, 220);
      noteRefs.current.forEach((el) => resizeTextarea(el, 80));
    });
    return () => cancelAnimationFrame(frame);
  }, [open, descDraft, noteDrafts, notes.length]);

  const handleAddNote = useCallback(() => {
    const current = checkpointRef.current;
    if (!current) return;
    const note = createCheckpointNote();
    const existing = current.notesStickies || [];
    const nextNotes = existing.map((item) => {
      if (!(item.id in noteDraftsRef.current)) return item;
      const text = noteDraftsRef.current[item.id];
      return text === (item.text || '') ? item : { ...item, text };
    });
    const updates = { notesStickies: [...nextNotes, note] };
    const nextDesc = descDraftRef.current;
    if (nextDesc !== (current.description || '')) {
      updates.description = nextDesc;
    }
    patchCheckpoint(updates);
    setNoteDrafts((prev) => ({ ...prev, [note.id]: '' }));
    setFocusNoteId(note.id);
  }, [patchCheckpoint]);

  useEffect(() => {
    if (!focusNoteId) return;
    const el = noteRefs.current.get(focusNoteId);
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    resizeTextarea(el, 80);
    setFocusNoteId(null);
  }, [focusNoteId, notes]);

  const handleClose = useCallback(() => {
    flushDrafts();
    onClose?.();
  }, [flushDrafts, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (matchInsertShortcut(e.key) !== 'note') return;
      e.preventDefault();
      e.stopPropagation();
      handleAddNote();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, handleClose, handleAddNote]);

  const handleDescChange = (e) => {
    setDescDraft(e.target.value);
    resizeTextarea(e.target, 220);
  };

  const handleNoteChange = (noteId, e) => {
    const text = e.target.value;
    setNoteDrafts((prev) => ({ ...prev, [noteId]: text }));
    resizeTextarea(e.target, 80);
  };

  const handleRemoveNote = (noteId) => {
    const current = checkpointRef.current;
    if (!current) return;
    patchCheckpoint({
      notesStickies: (current.notesStickies || []).filter((note) => note.id !== noteId),
    });
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
  };

  if (!open || !checkpoint || !stage) return null;

  return (
    <div
      className="checkpoint-notes-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkpoint-notes-modal-title"
    >
      <button
        type="button"
        className="checkpoint-notes-modal__backdrop"
        onClick={handleClose}
        aria-label="Κλείσιμο"
      />
      <div className="checkpoint-notes-modal__panel">
        <header className="checkpoint-notes-modal__header">
          <div className="checkpoint-notes-modal__meta">
            <span className="checkpoint-notes-modal__phase">{stage.title}</span>
            <h2 id="checkpoint-notes-modal-title" className="checkpoint-notes-modal__title">
              {checkpoint.title}
            </h2>
          </div>
          <div className="checkpoint-notes-modal__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={handleAddNote}>
              + Σημείωση
              <kbd className="checkpoint-notes-modal__kbd">N</kbd>
            </button>
            <button
              type="button"
              className="checkpoint-notes-modal__close"
              onClick={handleClose}
              aria-label="Κλείσιμο"
            >
              ×
            </button>
          </div>
        </header>

        <div className="checkpoint-notes-modal__body">
          <label className="checkpoint-notes-modal__page" htmlFor="checkpoint-notes-main">
            <textarea
              id="checkpoint-notes-main"
              ref={descRef}
              className="checkpoint-notes-modal__editor"
              value={descDraft}
              onChange={handleDescChange}
              onBlur={flushDrafts}
              placeholder="Γράψε σημείωση…"
              aria-label="Σημειώσεις checkpoint"
            />
          </label>

          {notes.map((note, index) => (
            <article key={note.id} className="checkpoint-notes-modal__card">
              <div className="checkpoint-notes-modal__card-bar">
                <span className="checkpoint-notes-modal__card-label">Σημείωση {index + 1}</span>
                <button
                  type="button"
                  className="checkpoint-notes-modal__card-delete"
                  onClick={() => handleRemoveNote(note.id)}
                  aria-label={`Διαγραφή σημείωσης ${index + 1}`}
                  title="Διαγραφή"
                >
                  ×
                </button>
              </div>
              {note.imageSrc ? (
                <img
                  className="checkpoint-notes-modal__card-image"
                  src={note.imageSrc}
                  alt=""
                />
              ) : null}
              <textarea
                ref={(el) => {
                  if (el) noteRefs.current.set(note.id, el);
                  else noteRefs.current.delete(note.id);
                }}
                className="checkpoint-notes-modal__card-editor"
                value={noteDrafts[note.id] ?? note.text ?? ''}
                onChange={(e) => handleNoteChange(note.id, e)}
                onBlur={flushDrafts}
                placeholder="Γράψε σημείωση…"
                aria-label={`Σημείωση ${index + 1}`}
              />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
