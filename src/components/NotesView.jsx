import { useMemo, useState } from 'react';
import { generateId } from '../data/templates';
import {
  buildToggleCompletePatch,
  formatArchiveDate,
  isItemDone,
  partitionOpenDone,
} from '../utils/archive';
import { collectProjectCategories } from '../utils/categories';
import { CategorySelect, CategoryBadge } from './CategorySelect';
import { ArchiveCelebration } from './ArchiveCelebration';
import { CheckpointLinkBadges, CheckpointLinkSelect } from './CheckpointLinkSelect';
import {
  getNoteSettledAt,
  isNoteSettled,
  isNoteSettledByCheckpoints,
} from '../utils/noteSettle';

function NoteCard({ note, stages, categoryOptions, onUpdate, onDelete, onToggleComplete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [stageId, setStageId] = useState(note.relatedStageId || '');
  const [linkedCheckpointIds, setLinkedCheckpointIds] = useState(note.linkedCheckpointIds || []);
  const [category, setCategory] = useState(note.category || '');

  const [expanded, setExpanded] = useState(false);
  const stage = stages.find((s) => s.id === note.relatedStageId);
  const done = isNoteSettled(note, stages);
  const settledByCheckpoints = isNoteSettledByCheckpoints(note, stages);
  const settledAt = getNoteSettledAt(note, stages);
  const compact = done && !expanded;

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdate(note.id, {
      title: title.trim(),
      body,
      relatedStageId: stageId || null,
      linkedCheckpointIds,
      category: category || '',
      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="card note-card note-card--editing">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
        />
        <textarea
          className="input textarea"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your note…"
        />
        <CategorySelect value={category} onChange={setCategory} options={categoryOptions} />
        <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">Χωρίς σύνδεση milestone (ανεξάρτητη)</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <CheckpointLinkSelect
          stages={stages}
          value={linkedCheckpointIds}
          onChange={setLinkedCheckpointIds}
        />
        <div className="note-card__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={handleSave}>Save</button>
          <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card note-card ${done ? 'note-card--done' : ''}${compact ? ' note-card--compact' : ''}`}
      onClick={() => {
        if (done) setExpanded((open) => !open);
      }}
    >
      <div className="note-card__header">
        <div className="note-card__title-row">
          <label className="workspace-note__check" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={done}
              disabled={settledByCheckpoints}
              onChange={() => onToggleComplete?.(note)}
              aria-label={
                settledByCheckpoints
                  ? `Ολοκληρώθηκε με το checkpoint: ${note.title}`
                  : done
                    ? `Αναίρεση: ${note.title}`
                    : `Ολοκλήρωση: ${note.title}`
              }
              title={settledByCheckpoints ? 'Ολοκληρώθηκε με το checkpoint' : undefined}
            />
          </label>
          <h4 className="note-card__title">{note.title}</h4>
          <CategoryBadge category={note.category} />
          {done && <span className="badge badge--done">Εκτελεσμένο</span>}
          {done && settledAt && (
            <span className="workspace-note__archive-date">
              {formatArchiveDate(settledAt)}
            </span>
          )}
        </div>
        {!compact && (
          <div className="note-card__actions-inline" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn--text btn--sm"
              onClick={() => {
                setTitle(note.title);
                setBody(note.body);
                setStageId(note.relatedStageId || '');
                setLinkedCheckpointIds(note.linkedCheckpointIds || []);
                setCategory(note.category || '');
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button type="button" className="btn btn--text btn--sm btn--danger-text" onClick={() => onDelete(note.id)}>Delete</button>
          </div>
        )}
      </div>
      {!compact && (
        <>
          {stage && <span className="note-card__phase">{stage.title}</span>}
          {!stage && <span className="note-card__phase">Ανεξάρτητη</span>}
          <CheckpointLinkBadges ids={note.linkedCheckpointIds} stages={stages} />
          <p className="note-card__body">{note.body || <em>No content</em>}</p>
          <span className="note-card__date">
            {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
          </span>
        </>
      )}
    </div>
  );
}

export function NotesView({ notes, stages, onAdd, onUpdate, onDelete, backlog, goals }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [stageId, setStageId] = useState('');
  const [linkedCheckpointIds, setLinkedCheckpointIds] = useState([]);
  const [category, setCategory] = useState('');
  const [celebration, setCelebration] = useState(null);

  const categoryOptions = useMemo(
    () => collectProjectCategories({ stages, notes, backlog, goals }),
    [stages, notes, backlog, goals]
  );

  const { open, done } = partitionOpenDone(notes);
  const sortedNotes = [...open, ...done].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );

  const handleAdd = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    onAdd({
      id: generateId(),
      title: title.trim(),
      body,
      relatedStageId: stageId || null,
      linkedCheckpointIds,
      category: category || '',
      createdAt: now,
      updatedAt: now,
      archived: false,
      archivedAt: null,
      done: false,
    });
    setTitle('');
    setBody('');
    setStageId('');
    setLinkedCheckpointIds([]);
    setCategory('');
    setShowForm(false);
  };

  const handleToggleComplete = (note) => {
    const wasDone = isItemDone(note);
    const patch = buildToggleCompletePatch(note);
    onUpdate(note.id, { ...patch, updatedAt: patch.completedAt || new Date().toISOString() });
    if (!wasDone) {
      setCelebration({
        title: note.title,
        subtitle: 'Note',
        completedAt: patch.completedAt,
      });
    }
  };

  return (
    <section className="section view-section">
      {celebration && (
        <ArchiveCelebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          completedAt={celebration.completedAt}
          onDone={() => setCelebration(null)}
        />
      )}

      <div className="notes-header">
        <div>
          <h2 className="view-section__title">Notes</h2>
          <p className="view-section__desc">Keep thoughts, meeting notes, and decisions for this project.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Note'}
        </button>
      </div>

      {showForm && (
        <form className="note-form card" onSubmit={handleAdd}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
          <textarea className="input textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your note…" />
          <CategorySelect value={category} onChange={setCategory} options={categoryOptions} />
          <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Χωρίς σύνδεση milestone (ανεξάρτητη)</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <CheckpointLinkSelect
            stages={stages}
            value={linkedCheckpointIds}
            onChange={setLinkedCheckpointIds}
          />
          <button type="submit" className="btn btn--primary btn--sm">Save Note</button>
        </form>
      )}

      {sortedNotes.length === 0 ? (
        <div className="empty-state">No notes yet. Capture ideas, meetings, or reflections here.</div>
      ) : (
        <div className="notes-list">
          {sortedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              stages={stages}
              categoryOptions={categoryOptions}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onToggleComplete={handleToggleComplete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
