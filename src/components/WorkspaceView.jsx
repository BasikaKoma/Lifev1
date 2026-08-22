import { useEffect, useMemo, useState } from 'react';
import { generateId } from '../data/templates';
import {
  stagesAsChapters,
  getChapterStatusLabel,
  getChapterCheckpointProgress,
} from '../utils/workspaceChapters';
import {
  buildToggleCompletePatch,
  formatArchiveDate,
  isItemDone,
  partitionOpenDone,
} from '../utils/archive';
import { collectProjectCategories } from '../utils/categories';
import { formatNoteClock } from '../utils/lifelineDays';
import {
  getStickiesForStage,
  getUnlinkedStickies,
  stickyAsWorkspaceNote,
} from '../utils/milestoneNotes';
import { CategorySelect, CategoryBadge } from './CategorySelect';
import { PriorityBadge } from './PrioritySelect';
import { ArchiveCelebration } from './ArchiveCelebration';
import { CheckpointLinkBadges, CheckpointLinkSelect } from './CheckpointLinkSelect';
import {
  getNoteSettledAt,
  isNoteSettled,
  isNoteSettledByCheckpoints,
} from '../utils/noteSettle';
import { ProjectBriefPanel } from './ProjectBriefPanel';

function chapterStatusClass(status) {
  switch (status) {
    case 'Done':
      return 'chapter-status--done';
    case 'Current':
      return 'chapter-status--current';
    case 'Next':
      return 'chapter-status--next';
    default:
      return 'chapter-status--locked';
  }
}

function isCanvasTaskDone(task) {
  return task?.status === 'Done';
}

function partitionCanvasTasks(tasks = []) {
  const open = [];
  const done = [];
  tasks.forEach((task) => {
    if (isCanvasTaskDone(task)) done.push(task);
    else open.push(task);
  });
  done.sort(
    (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
  );
  return { open, done };
}

function getTasksForStage(stageId, stages, canvasTasks = []) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return [];
  const checkpointIds = new Set((stage.checkpoints || []).map((cp) => cp.id));
  return canvasTasks.filter((task) =>
    (task.linkedCheckpointIds || []).some((id) => checkpointIds.has(id))
  );
}

function TaskListItem({
  task,
  stages,
  categoryOptions,
  onUpdateTask,
  onToggleComplete,
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [category, setCategory] = useState(task.category || '');
  const [linkedCheckpointIds, setLinkedCheckpointIds] = useState(task.linkedCheckpointIds || []);
  const done = isCanvasTaskDone(task);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setCategory(task.category || '');
    setLinkedCheckpointIds(task.linkedCheckpointIds || []);
  }, [task.id, task.title, task.description, task.category, task.linkedCheckpointIds]);

  const save = () => {
    if (!title.trim()) return;
    onUpdateTask?.(task.id, {
      title: title.trim(),
      description: description.trim(),
      category: category || '',
      linkedCheckpointIds,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="workspace-list__item workspace-list__item--canvas-task card workspace-list__item--editing">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Τίτλος task"
        />
        <textarea
          className="input textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Περιγραφή…"
        />
        <div className="workspace-list__item-meta">
          <CategorySelect value={category} onChange={setCategory} options={categoryOptions} />
        </div>
        <CheckpointLinkSelect
          stages={stages}
          value={linkedCheckpointIds}
          onChange={setLinkedCheckpointIds}
        />
        <div className="workspace-list__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Αποθήκευση
          </button>
          <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`workspace-list__item workspace-list__item--canvas-task workspace-list__item--task card ${done ? 'workspace-list__item--done' : ''}`}
    >
      <div className="workspace-note__row">
        <label className="workspace-note__check">
          <input
            type="checkbox"
            checked={done}
            onChange={() => onToggleComplete?.(task)}
            aria-label={done ? `Αναίρεση: ${task.title}` : `Ολοκλήρωση: ${task.title}`}
          />
        </label>
        <div className="workspace-note__content">
          <div className="workspace-note__head">
            <strong>{task.title}</strong>
            <span className="workspace-note__task-badge">Task</span>
            <CategoryBadge category={task.category} />
            {done && <span className="badge badge--done">Εκτελεσμένο</span>}
            {done && task.completedAt && (
              <span className="workspace-note__archive-date">
                {formatArchiveDate(task.completedAt)}
              </span>
            )}
          </div>
          {task.description && <p>{task.description}</p>}
          <CheckpointLinkBadges ids={task.linkedCheckpointIds} stages={stages} />
          <div className="workspace-list__actions">
            <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(true)}>
              Επεξεργασία
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function CanvasTasksSection({
  tasks,
  stages,
  categoryOptions,
  onAddTask,
  onUpdateTask,
  onToggleTaskComplete,
  title = 'Tasks',
  description = 'Canvas tasks από το Roadmap',
  emptyMessage = 'Δεν υπάρχουν tasks ακόμα — πρόσθεσέ τα από το Roadmap ή εδώ.',
}) {
  const { open, done } = partitionCanvasTasks(tasks);

  return (
    <div className="workspace-block workspace-block--canvas-tasks card">
      <div className="chapter-detail__section-head" style={{ marginTop: 0 }}>
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        {onAddTask && (
          <button
            type="button"
            className="btn btn--outline btn--sm workspace-btn--task"
            onClick={() => onAddTask({ title: 'New task' })}
          >
            + Task
          </button>
        )}
      </div>

      {open.length === 0 && done.length === 0 ? (
        <p className="chapter-detail__notes-empty">{emptyMessage}</p>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="workspace-list">
              {open.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  stages={stages}
                  categoryOptions={categoryOptions}
                  onUpdateTask={onUpdateTask}
                  onToggleComplete={onToggleTaskComplete}
                />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <div className="workspace-block workspace-block--archived-section">
              <h4 className="workspace-block__label">
                Ολοκληρωμένα tasks
                <span className="workspace-archive__count">{done.length}</span>
              </h4>
              <ul className="workspace-list">
                {done.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    stages={stages}
                    categoryOptions={categoryOptions}
                    onUpdateTask={onUpdateTask}
                    onToggleComplete={onToggleTaskComplete}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoteListItem({
  note,
  stages,
  categoryOptions,
  onUpdateNote,
  onUpdateSticky,
  onToggleComplete,
  showLinkSelect = false,
  canvasConnections = [],
}) {
  const isSticky = note.source === 'sticky';
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body || '');
  const [stageId, setStageId] = useState(note.relatedStageId || '');
  const [linkedCheckpointIds, setLinkedCheckpointIds] = useState(note.linkedCheckpointIds || []);
  const [category, setCategory] = useState(note.category || '');
  const done = isNoteSettled(note, stages, canvasConnections);
  const settledByCheckpoints = isNoteSettledByCheckpoints(note, stages, canvasConnections);
  const settledAt = getNoteSettledAt(note, stages, canvasConnections);
  const compact = done && !expanded;

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body || '');
    setStageId(note.relatedStageId || '');
    setLinkedCheckpointIds(note.linkedCheckpointIds || []);
    setCategory(note.category || '');
  }, [note.id, note.title, note.body, note.relatedStageId, note.linkedCheckpointIds, note.category]);

  const save = () => {
    if (isSticky) {
      const text = body.trim() || title.trim();
      if (!text) return;
      onUpdateSticky?.(note.id, {
        text,
        relatedStageId: stageId || null,
        linkedCheckpointIds,
        category: category || '',
      });
      setEditing(false);
      return;
    }
    if (!title.trim()) return;
    onUpdateNote?.(note.id, {
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
      <li className="workspace-list__item workspace-list__item--note card workspace-list__item--editing">
        {!isSticky && (
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Τίτλος"
          />
        )}
        <textarea
          className="input textarea"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isSticky ? 'Κείμενο sticky…' : 'Σημείωση…'}
        />
        <div className="workspace-list__item-meta">
          <CategorySelect value={category} onChange={setCategory} options={categoryOptions} />
          {showLinkSelect && (
            <select className="input input--sm" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">Χωρίς σύνδεση (ανεξάρτητη)</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </div>
        {showLinkSelect && (
          <CheckpointLinkSelect
            stages={stages}
            value={linkedCheckpointIds}
            onChange={setLinkedCheckpointIds}
          />
        )}
        {isSticky && (
          <p className="workspace-note__source-hint">Από Roadmap sticky</p>
        )}
        <div className="workspace-list__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Αποθήκευση
          </button>
          <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`workspace-list__item workspace-list__item--note card ${done ? 'workspace-list__item--done' : ''}${compact ? ' workspace-list__item--compact' : ''}`}
      onClick={() => {
        if (done) setExpanded((open) => !open);
      }}
    >
      <div className="workspace-note__row">
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
        <div className="workspace-note__content">
          <div className="workspace-note__head">
            <strong>{note.title}</strong>
            <CategoryBadge category={note.category} />
            {isSticky && <span className="workspace-note__sticky-badge">Sticky</span>}
            {note.createdAt && (
              <span className="workspace-note__archive-date">
                {formatNoteClock(note.createdAt)}
              </span>
            )}
            {done && (
              <span className="badge badge--done">Εκτελεσμένο</span>
            )}
            {done && settledAt && (
              <span className="workspace-note__archive-date">
                {formatArchiveDate(settledAt)}
              </span>
            )}
          </div>
          {!compact && (
            <>
              <p>{note.body || '—'}</p>
              <CheckpointLinkBadges ids={note.linkedCheckpointIds} stages={stages} />
              <div className="workspace-list__actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(true)}>
                  Επεξεργασία
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function ChapterTable({ chapters, onSelectChapter }) {
  return (
    <div className="chapter-table card">
      <div className="chapter-table__head">
        <span>Κεφάλαιο</span>
        <span>Στόχος</span>
        <span>Κατάσταση</span>
      </div>
      <ul className="chapter-table__body">
        {chapters.map((chapter) => {
          const progress = getChapterCheckpointProgress(chapter.stage);
          return (
            <li key={chapter.id}>
              <button type="button" className="chapter-table__row" onClick={() => onSelectChapter(chapter.id)}>
                <span className="chapter-table__chapter">
                  <strong>
                    {chapter.number} — {chapter.title}
                  </strong>
                  <span className="chapter-table__meta-row">
                    {chapter.stage.category && <CategoryBadge category={chapter.stage.category} />}
                    {progress.total > 0 && (
                      <span className="chapter-table__meta">
                        {progress.done}/{progress.total} checkpoints
                      </span>
                    )}
                  </span>
                </span>
                <span className="chapter-table__goal">{chapter.goal}</span>
                <span className={`chapter-status ${chapterStatusClass(chapter.status)}`}>
                  {getChapterStatusLabel(chapter.status)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChapterDetail({
  chapter,
  stages,
  goals,
  notes,
  backlog,
  canvasStickies,
  canvasConnections,
  canvasTasks,
  categoryOptions,
  onBack,
  onSelectStage,
  onAddNote,
  onUpdateNote,
  onUpdateSticky,
  onUpdateStage,
  onUpdateCheckpoint,
  onAddTask,
  onUpdateTask,
  onToggleTaskComplete,
  onToggleNoteComplete,
  onToggleCheckpointComplete,
}) {
  const stage = chapter.stage;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage.title);

  useEffect(() => {
    setTitleDraft(stage.title);
    setEditingTitle(false);
  }, [stage.id, stage.title]);

  const checkpoints = stage.checkpoints || [];
  const { open: openCheckpoints, done: doneCheckpoints } = partitionOpenDone(checkpoints);
  const ideas = [
    ...(stage.ideas || []).filter((idea) => idea.canvasX != null || idea.title?.trim()),
    ...(backlog || []).filter((idea) => idea.linkedStageId === stage.id),
  ];
  const linkedStickies = getStickiesForStage(stage.id, canvasStickies, canvasConnections).map(
    (s) => stickyAsWorkspaceNote(s, stage.id)
  );
  const stageCheckpointIds = new Set((stage.checkpoints || []).map((cp) => cp.id));
  const notesViaCheckpoint = notes.filter(
    (n) =>
      n.relatedStageId !== stage.id &&
      (n.linkedCheckpointIds || []).some((id) => stageCheckpointIds.has(id))
  );
  const stickyIdsLinked = new Set(linkedStickies.map((s) => s.id));
  const stickiesViaCheckpoint = (canvasStickies || [])
    .filter(
      (s) =>
        !stickyIdsLinked.has(s.id) &&
        (s.linkedCheckpointIds || []).some((id) => stageCheckpointIds.has(id))
    )
    .map((s) => stickyAsWorkspaceNote(s, stage.id));
  const stageNotesAll = [
    ...notes.filter((n) => n.relatedStageId === stage.id),
    ...notesViaCheckpoint,
    ...linkedStickies,
    ...stickiesViaCheckpoint,
  ];
  const { open: openNotes, done: doneNotes } = partitionOpenDone(stageNotesAll);
  const stageGoals = goals.filter((g) => g.relatedStageId === stage.id);
  const stageTasks = getTasksForStage(stage.id, stages, canvasTasks);

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== stage.title) {
      onUpdateStage?.(stage.id, { title: next });
    } else {
      setTitleDraft(stage.title);
    }
    setEditingTitle(false);
  };

  return (
    <div className="chapter-detail">
      <button type="button" className="chapter-detail__back btn btn--text" onClick={onBack}>
        ← Όλα τα κεφάλαια
      </button>

      <header className="chapter-detail__header">
        <div>
          <p className="chapter-detail__eyebrow">Κεφάλαιο {chapter.number}</p>
          {editingTitle ? (
            <div className="chapter-detail__title-edit">
              <input
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                  }
                  if (e.key === 'Escape') {
                    setTitleDraft(stage.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
              />
              <button type="button" className="btn btn--primary btn--sm" onClick={saveTitle}>
                Αποθήκευση
              </button>
            </div>
          ) : (
            <button type="button" className="chapter-detail__title-btn" onClick={() => setEditingTitle(true)}>
              <h3 className="chapter-detail__title">{chapter.title}</h3>
              <span className="chapter-detail__title-hint">Επεξεργασία τίτλου</span>
            </button>
          )}
          <p className="chapter-detail__goal">{chapter.goal}</p>
          <div className="chapter-detail__meta">
            <CategorySelect
              value={stage.category || ''}
              onChange={(category) => onUpdateStage?.(stage.id, { category })}
              options={categoryOptions}
            />
          </div>
        </div>
        <span className={`chapter-status ${chapterStatusClass(chapter.status)}`}>
          {getChapterStatusLabel(chapter.status)}
        </span>
      </header>

      <div className="chapter-detail__sections">
        <div className="chapter-detail__section-head">
          <h4>Checkpoints</h4>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => onSelectStage(stage.id)}>
            Επεξεργασία στο Roadmap
          </button>
        </div>

        {openCheckpoints.length === 0 && doneCheckpoints.length === 0 ? (
          <p className="chapter-detail__notes-empty">Δεν υπάρχουν checkpoints ακόμα — πρόσθεσέ τα στο Roadmap.</p>
        ) : openCheckpoints.length === 0 ? (
          <p className="chapter-detail__notes-empty">Όλα τα checkpoints είναι στο Archived κάτω.</p>
        ) : (
          <ul className="workspace-list">
            {openCheckpoints.map((cp) => (
              <li key={cp.id} className="workspace-list__item workspace-list__item--task card">
                <label className="workspace-note__check">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onToggleCheckpointComplete?.(stage.id, cp)}
                    aria-label={`Ολοκλήρωση: ${cp.title}`}
                  />
                </label>
                <span>{cp.title}</span>
                <CategoryBadge category={cp.category} />
                <PriorityBadge priority={cp.priority} />
              </li>
            ))}
          </ul>
        )}

        {doneCheckpoints.length > 0 && (
          <div className="workspace-block workspace-block--archived-section">
            <h4 className="workspace-block__label">
              Archived
              <span className="workspace-archive__count">{doneCheckpoints.length}</span>
            </h4>
            <p className="workspace-block__hint">Checked checkpoints αυτού του milestone</p>
            <ul className="workspace-list">
              {doneCheckpoints.map((cp) => {
                const doneDate = formatArchiveDate(cp.completedAt || cp.archivedAt);
                return (
                  <li
                    key={cp.id}
                    className="workspace-list__item workspace-list__item--task workspace-list__item--done card"
                  >
                    <label className="workspace-note__check">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => onToggleCheckpointComplete?.(stage.id, cp)}
                        aria-label={`Αναίρεση: ${cp.title}`}
                      />
                    </label>
                    <span>{cp.title}</span>
                    <CategoryBadge category={cp.category} />
                    <span className="badge badge--done">Εκτελεσμένο</span>
                    {doneDate && (
                      <span className="workspace-note__archive-date">{doneDate}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {stageGoals.length > 0 && (
          <div className="workspace-block">
            <h4 className="workspace-block__label">Στόχοι</h4>
            <ul className="workspace-list">
              {stageGoals.map((goal) => (
                <li key={goal.id} className="workspace-list__item card">
                  <strong>{goal.title}</strong>
                  {goal.description && <p>{goal.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ideas.length > 0 && (
          <div className="workspace-block">
            <h4 className="workspace-block__label">Ιδέες</h4>
            <ul className="workspace-list">
              {ideas.map((idea) => (
                <li key={idea.id} className="workspace-list__item card">
                  <div className="workspace-note__head">
                    <strong>{idea.title || 'Untitled idea'}</strong>
                    <CategoryBadge category={idea.category} />
                  </div>
                  {idea.description && <p>{idea.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stageTasks.length > 0 && (
          <CanvasTasksSection
            tasks={stageTasks}
            stages={stages}
            categoryOptions={categoryOptions}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onToggleTaskComplete={onToggleTaskComplete}
            title="Tasks κεφαλαίου"
            description="Tasks συνδεδεμένα με checkpoints αυτού του milestone"
            emptyMessage="Δεν υπάρχουν tasks για αυτό το κεφάλαιο."
          />
        )}

        <div className="chapter-detail__section-head">
          <div>
            <h4>Σημειώσεις milestone</h4>
            <p>Notes συνδεδεμένα με αυτό το κεφάλαιο</p>
          </div>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => {
              const now = new Date().toISOString();
              onAddNote({
                id: generateId(),
                title: 'Νέα σημείωση',
                body: '',
                relatedStageId: stage.id,
                category: stage.category || '',
                createdAt: now,
                updatedAt: now,
                archived: false,
                archivedAt: null,
                done: false,
              });
            }}
          >
            + Σημείωση
          </button>
        </div>

        {openNotes.length === 0 ? (
          <p className="chapter-detail__notes-empty">
            {doneNotes.length > 0
              ? 'Οι σημειώσεις είναι στο Archived κάτω.'
              : 'Καμία ενεργή σημείωση για αυτό το κεφάλαιο.'}
          </p>
        ) : (
          <ul className="workspace-list">
            {openNotes.map((note) => (
              <NoteListItem
                key={`${note.source || 'note'}-${note.id}`}
                note={note}
                stages={stages}
                categoryOptions={categoryOptions}
                onUpdateNote={onUpdateNote}
                onUpdateSticky={onUpdateSticky}
                onToggleComplete={onToggleNoteComplete}
                showLinkSelect
                canvasConnections={canvasConnections}
              />
            ))}
          </ul>
        )}

        {doneNotes.length > 0 && (
          <div className="workspace-block workspace-block--archived-section">
            <h4 className="workspace-block__label">
              Archived σημειώσεις
              <span className="workspace-archive__count">{doneNotes.length}</span>
            </h4>
            <p className="workspace-block__hint">Checked notes αυτού του milestone</p>
            <ul className="workspace-list">
              {doneNotes.map((note) => (
                <NoteListItem
                  key={`${note.source || 'note'}-${note.id}`}
                  note={note}
                  stages={stages}
                  categoryOptions={categoryOptions}
                  onUpdateNote={onUpdateNote}
                  onUpdateSticky={onUpdateSticky}
                  onToggleComplete={onToggleNoteComplete}
                  showLinkSelect
                  canvasConnections={canvasConnections}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function IndependentNotesChapter({
  notes,
  stages,
  categoryOptions,
  onAddNote,
  onUpdateNote,
  onUpdateSticky,
  onToggleNoteComplete,
  canvasConnections = [],
}) {
  const { open, done } = partitionOpenDone(notes);
  const active = [...open, ...done];

  return (
    <div className="workspace-block workspace-block--independent card">
      <div className="chapter-detail__section-head" style={{ marginTop: 0 }}>
        <div>
          <h4>Ανεξάρτητες σημειώσεις</h4>
          <p>Notes χωρίς σύνδεση σε milestone — ξεχωριστό κεφάλαιο</p>
        </div>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={() => {
            const now = new Date().toISOString();
            onAddNote({
              id: generateId(),
              title: 'Νέα σημείωση',
              body: '',
              relatedStageId: null,
              category: '',
              createdAt: now,
              updatedAt: now,
              archived: false,
              archivedAt: null,
              done: false,
            });
          }}
        >
          + Σημείωση
        </button>
      </div>

      {active.length === 0 ? (
        <p className="chapter-detail__notes-empty">Δεν υπάρχουν ανεξάρτητες σημειώσεις.</p>
      ) : (
        <ul className="workspace-list">
          {active.map((note) => (
            <NoteListItem
              key={`${note.source || 'note'}-${note.id}`}
              note={note}
              stages={stages}
              categoryOptions={categoryOptions}
              onUpdateNote={onUpdateNote}
              onUpdateSticky={onUpdateSticky}
              onToggleComplete={onToggleNoteComplete}
              showLinkSelect
              canvasConnections={canvasConnections}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function collectWorkspaceArchive(stages = [], notes = [], canvasTasks = []) {
  const checkpoints = stages.flatMap((stage) =>
    (stage.checkpoints || [])
      .filter((cp) => isItemDone(cp))
      .map((cp) => ({
        kind: 'checkpoint',
        id: `cp-${stage.id}-${cp.id}`,
        title: cp.title,
        category: cp.category,
        stageId: stage.id,
        stageTitle: stage.title,
        archivedAt: cp.completedAt || cp.archivedAt,
      }))
  );

  const archivedNotes = notes
    .filter((n) => isItemDone(n))
    .map((note) => {
      const stage = stages.find((s) => s.id === note.relatedStageId);
      return {
        kind: 'note',
        id: `note-${note.id}`,
        title: note.title,
        body: note.body,
        category: note.category,
        stageId: note.relatedStageId || null,
        stageTitle: stage?.title || null,
        archivedAt: note.completedAt || note.archivedAt || note.updatedAt,
      };
    });

  const doneTasks = (canvasTasks || [])
    .filter((task) => isCanvasTaskDone(task))
    .map((task) => {
      const linkedStage = stages.find((stage) =>
        (stage.checkpoints || []).some((cp) => (task.linkedCheckpointIds || []).includes(cp.id))
      );
      return {
        kind: 'task',
        id: `task-${task.id}`,
        title: task.title,
        body: task.description,
        category: task.category,
        stageId: linkedStage?.id || null,
        stageTitle: linkedStage?.title || null,
        archivedAt: task.completedAt,
      };
    });

  return [...checkpoints, ...archivedNotes, ...doneTasks].sort(
    (a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0)
  );
}

function WorkspaceArchive({ stages, notes, canvasTasks, onSelectChapter }) {
  const [filter, setFilter] = useState('all');
  const items = useMemo(
    () => collectWorkspaceArchive(stages, notes, canvasTasks),
    [stages, notes, canvasTasks]
  );
  const filtered = items.filter((item) => {
    if (filter === 'checkpoints') return item.kind === 'checkpoint';
    if (filter === 'notes') return item.kind === 'note';
    if (filter === 'tasks') return item.kind === 'task';
    return true;
  });
  const checkpointCount = items.filter((i) => i.kind === 'checkpoint').length;
  const noteCount = items.filter((i) => i.kind === 'note').length;
  const taskCount = items.filter((i) => i.kind === 'task').length;

  return (
    <div id="workspace-archive" className="workspace-block workspace-block--archive card">
      <div className="chapter-detail__section-head" style={{ marginTop: 0 }}>
        <div>
          <h4>Ολοκληρωμένα</h4>
          <p>Ιστορικό εκτελεσμένων checkpoints και σημειώσεων, με ημερομηνία</p>
        </div>
        <span className="workspace-archive__count">{items.length}</span>
      </div>

      <div className="workspace-archive__filters">
        <button
          type="button"
          className={`btn btn--sm ${filter === 'all' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setFilter('all')}
        >
          Όλα ({items.length})
        </button>
        <button
          type="button"
          className={`btn btn--sm ${filter === 'checkpoints' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setFilter('checkpoints')}
        >
          Checkpoints ({checkpointCount})
        </button>
        <button
          type="button"
          className={`btn btn--sm ${filter === 'notes' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setFilter('notes')}
        >
          Notes ({noteCount})
        </button>
        <button
          type="button"
          className={`btn btn--sm ${filter === 'tasks' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setFilter('tasks')}
        >
          Tasks ({taskCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="chapter-detail__notes-empty">
          Δεν υπάρχουν ακόμα ολοκληρωμένα. Κάνε check ένα checkpoint ή σημείωση — μένει ορατό ως εκτελεσμένο.
        </p>
      ) : (
        <ul className="workspace-list workspace-archive__list">
          {filtered.map((item) => (
            <li key={item.id} className="workspace-list__item workspace-list__item--done card">
              <div className="workspace-archive__item-head">
                <span className={`workspace-archive__kind workspace-archive__kind--${item.kind}`}>
                  {item.kind === 'checkpoint' ? 'Checkpoint' : item.kind === 'task' ? 'Task' : 'Note'}
                </span>
                <CategoryBadge category={item.category} />
                <span className="workspace-note__archive-date">
                  {formatArchiveDate(item.archivedAt) || '—'}
                </span>
              </div>
              <strong>{item.title}</strong>
              {item.kind === 'note' && item.body ? <p>{item.body}</p> : null}
              {item.kind === 'task' && item.body ? <p>{item.body}</p> : null}
              {item.stageTitle ? (
                <button
                  type="button"
                  className="btn btn--text btn--sm workspace-archive__stage-link"
                  onClick={() => onSelectChapter?.(item.stageId)}
                >
                  από: {item.stageTitle}
                </button>
              ) : (
                <span className="workspace-archive__stage-muted">Ανεξάρτητη σημείωση</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkspaceView({
  stages,
  goals,
  notes,
  backlog,
  canvasStickies,
  canvasConnections,
  canvasObstacles,
  canvasResources,
  canvasTasks = [],
  projectTitle = '',
  onTitleChange,
  projectBrief,
  onBriefChange,
  onSelectStage,
  onAddNote,
  onUpdateNote,
  onUpdateSticky,
  onUpdateStage,
  onUpdateCheckpoint,
  onAddTask,
  onUpdateTask,
  onBack,
}) {
  const [workspaceTab, setWorkspaceTab] = useState('chapters');
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const chapters = stagesAsChapters(stages);
  const selectedChapter = chapters.find((c) => c.id === selectedChapterId) || null;
  const unlinkedNotes = [
    ...notes.filter((n) => !n.relatedStageId && !(n.linkedCheckpointIds || []).length),
    ...getUnlinkedStickies(canvasStickies, canvasConnections)
      .filter((s) => !(s.linkedCheckpointIds || []).length)
      .map((s) => stickyAsWorkspaceNote(s, null)),
  ];

  const categoryOptions = useMemo(
    () =>
      collectProjectCategories({
        stages,
        notes,
        goals,
        backlog,
        canvasStickies,
        canvasObstacles,
        canvasResources,
        canvasTasks,
      }),
    [stages, notes, goals, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks]
  );

  const handleToggleNoteComplete = (note) => {
    const wasDone = isItemDone(note);
    const patch = buildToggleCompletePatch(note);
    if (note.source === 'sticky') {
      onUpdateSticky?.(note.id, patch);
    } else {
      onUpdateNote?.(note.id, { ...patch, updatedAt: patch.completedAt || new Date().toISOString() });
    }
    if (!wasDone) {
      setCelebration({
        title: note.title,
        subtitle: note.source === 'sticky' ? 'Sticky' : 'Note',
        completedAt: patch.completedAt,
      });
    }
  };

  const handleToggleCheckpointComplete = (stageId, checkpoint) => {
    const wasDone = isItemDone(checkpoint);
    const patch = buildToggleCompletePatch(checkpoint);
    onUpdateCheckpoint?.(stageId, checkpoint.id, patch);
    if (!wasDone) {
      setCelebration({
        title: checkpoint.title,
        subtitle: 'Checkpoint',
        completedAt: patch.completedAt,
      });
    }
  };

  const handleToggleTaskComplete = (task) => {
    const wasDone = isCanvasTaskDone(task);
    const now = new Date().toISOString();
    const patch = wasDone
      ? { status: 'Todo', completedAt: null }
      : { status: 'Done', completedAt: now };
    onUpdateTask?.(task.id, patch);
    if (!wasDone) {
      setCelebration({
        title: task.title,
        subtitle: 'Task',
        completedAt: now,
      });
    }
  };

  return (
    <section className="section view-section workspace-view">
      {celebration && (
        <ArchiveCelebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          completedAt={celebration.completedAt}
          archivedAt={celebration.archivedAt}
          onDone={() => setCelebration(null)}
        />
      )}

      {onBack && (
        <button type="button" className="workspace-view__back btn btn--text" onClick={onBack}>
          ← Roadmap
        </button>
      )}

      <div className="workspace-header">
        <div>
          <h2 className="view-section__title">Workspace</h2>
          <p className="view-section__desc">
            {workspaceTab === 'brief'
              ? 'Τα χαρακτηριστικά του project — τι είναι, τι κάνει, brand και οδηγίες για τον agent.'
              : 'Τα milestones ως κεφάλαια. Οι συνδεδεμένες σημειώσεις εμφανίζονται στο milestone· οι ασύνδετες στο ξεχωριστό κεφάλαιο κάτω. Με check μένουν ορατά ως εκτελεσμένα.'}
          </p>
        </div>
        {workspaceTab === 'chapters' && !selectedChapter && (
          <a className="btn btn--outline btn--sm" href="#workspace-archive">
            Ολοκληρωμένα
          </a>
        )}
      </div>

      <div className="workspace-tabs" role="tablist" aria-label="Workspace">
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === 'chapters'}
          className={`workspace-tabs__tab${workspaceTab === 'chapters' ? ' workspace-tabs__tab--active' : ''}`}
          onClick={() => setWorkspaceTab('chapters')}
        >
          Κεφάλαια
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === 'brief'}
          className={`workspace-tabs__tab${workspaceTab === 'brief' ? ' workspace-tabs__tab--active' : ''}`}
          onClick={() => setWorkspaceTab('brief')}
        >
          Χαρακτηριστικά
        </button>
      </div>

      {workspaceTab === 'brief' ? (
        <div className="workspace-brief">
          <div className="settings-block">
            <h3 className="settings-block__title">Όνομα</h3>
            <p className="settings-block__desc">
              Το όνομα φαίνεται στο sidebar και περνάει στον agent μαζί με το brief.
            </p>
            <label className="settings-label" htmlFor="workspace-project-name">
              Business name
            </label>
            <input
              id="workspace-project-name"
              type="text"
              className="input"
              value={projectTitle}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder="Your business name"
            />
          </div>
          <ProjectBriefPanel
            projectTitle={projectTitle}
            brief={projectBrief}
            onChange={onBriefChange}
          />
        </div>
      ) : chapters.length === 0 && !selectedChapter ? (
        <>
          <div className="empty-state">
            Πρόσθεσε milestones στο Roadmap — θα εμφανιστούν εδώ ως κεφάλαια.
          </div>
          <IndependentNotesChapter
            notes={unlinkedNotes}
            stages={stages}
            categoryOptions={categoryOptions}
            onAddNote={onAddNote}
            onUpdateNote={onUpdateNote}
            onUpdateSticky={onUpdateSticky}
            onToggleNoteComplete={handleToggleNoteComplete}
            canvasConnections={canvasConnections}
          />
          <CanvasTasksSection
            tasks={canvasTasks}
            stages={stages}
            categoryOptions={categoryOptions}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onToggleTaskComplete={handleToggleTaskComplete}
          />
          <WorkspaceArchive
            stages={stages}
            notes={notes}
            canvasTasks={canvasTasks}
            onSelectChapter={(stageId) => stageId && setSelectedChapterId(stageId)}
          />
        </>
      ) : selectedChapter ? (
        <ChapterDetail
          chapter={selectedChapter}
          stages={stages}
          goals={goals}
          notes={notes}
          backlog={backlog}
          canvasStickies={canvasStickies}
          canvasConnections={canvasConnections}
          canvasTasks={canvasTasks}
          categoryOptions={categoryOptions}
          onBack={() => setSelectedChapterId(null)}
          onSelectStage={onSelectStage}
          onAddNote={onAddNote}
          onUpdateNote={onUpdateNote}
          onUpdateSticky={onUpdateSticky}
          onUpdateStage={onUpdateStage}
          onUpdateCheckpoint={onUpdateCheckpoint}
          onAddTask={onAddTask}
          onUpdateTask={onUpdateTask}
          onToggleTaskComplete={handleToggleTaskComplete}
          onToggleNoteComplete={handleToggleNoteComplete}
          onToggleCheckpointComplete={handleToggleCheckpointComplete}
        />
      ) : (
        <>
          <ChapterTable chapters={chapters} onSelectChapter={setSelectedChapterId} />
          <IndependentNotesChapter
            notes={unlinkedNotes}
            stages={stages}
            categoryOptions={categoryOptions}
            onAddNote={onAddNote}
            onUpdateNote={onUpdateNote}
            onUpdateSticky={onUpdateSticky}
            onToggleNoteComplete={handleToggleNoteComplete}
            canvasConnections={canvasConnections}
          />
          <CanvasTasksSection
            tasks={canvasTasks}
            stages={stages}
            categoryOptions={categoryOptions}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onToggleTaskComplete={handleToggleTaskComplete}
          />
          <WorkspaceArchive
            stages={stages}
            notes={notes}
            canvasTasks={canvasTasks}
            onSelectChapter={(stageId) => stageId && setSelectedChapterId(stageId)}
          />
        </>
      )}
    </section>
  );
}
