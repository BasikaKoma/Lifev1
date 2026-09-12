import { useEffect, useRef, useState } from 'react';
import { createEmptyBlockAction, createEmptyBlockResource, goalColorStyle, sortBlockActions } from '../../lib/path/schema';
import { blockActionProgress, blockLinkedProject, formatBlockClock, formatBlockStatusStamp, formatDuration, reorderBlockActions, tasksForBlockProject } from '../../lib/path/logic';

const TEXT_SAVE_MS = 700;

function textDraftFromBlock(block) {
  return {
    desiredOutcome: block?.desiredOutcome || '',
    notes: block?.notes || '',
    resultSummary: block?.resultSummary || '',
    remaining: block?.remaining || '',
    nextStep: block?.nextStep || '',
  };
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function MetaItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="path-workspace__meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionRow({
  action,
  isOver,
  onToggle,
  onText,
  onDelete,
  onDragOverAction,
  onDropOnAction,
}) {
  return (
    <li
      className={`path-workspace__action${isOver ? ' path-workspace__action--over' : ''}${action.completed ? ' path-workspace__action--done' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDragOverAction?.(action);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData('text/plain');
        if (id) onDropOnAction?.(id, action.id);
      }}
    >
      <button
        type="button"
        className="path-workspace__drag"
        draggable
        aria-label="Reorder action"
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', action.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
      >
        ⋮⋮
      </button>
      <input
        type="checkbox"
        checked={Boolean(action.completed)}
        onChange={(event) => onToggle(action.id, event.target.checked)}
        aria-label="Complete action"
      />
      <input
        className="input"
        value={action.text}
        onChange={(event) => onText(action.id, event.target.value)}
        placeholder="Action"
      />
      {action.completed && formatBlockClock(action.completedAt) ? (
        <span className="path-workspace__action-time">{formatBlockClock(action.completedAt)}</span>
      ) : null}
      <button type="button" className="path-day__add" onClick={() => onDelete(action.id)}>
        Delete
      </button>
    </li>
  );
}

export function PathBlockWorkspace({
  block,
  goal,
  tasks = [],
  saving = false,
  onPatch,
  onEdit,
  onClose,
  onStatus,
}) {
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [overActionId, setOverActionId] = useState(null);
  const [textDraft, setTextDraft] = useState(() => textDraftFromBlock(block));
  const pendingTextRef = useRef({});
  const textTimerRef = useRef(null);
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  const consumePendingText = () => {
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    const pending = pendingTextRef.current;
    pendingTextRef.current = {};
    return pending;
  };

  const applyPatch = (patch) => {
    const pending = consumePendingText();
    if (!Object.keys(pending).length && !patch) return;
    onPatchRef.current({ ...pending, ...patch });
  };

  useEffect(() => {
    setTextDraft(textDraftFromBlock(block));
    pendingTextRef.current = {};
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
  }, [block?.id]);

  useEffect(() => () => {
    const pending = pendingTextRef.current;
    pendingTextRef.current = {};
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    if (Object.keys(pending).length) onPatchRef.current(pending);
  }, []);

  if (!block) return null;

  const actions = sortBlockActions(block.actions);
  const progress = blockActionProgress(block);
  const projectTasks = tasksForBlockProject(tasks, block, goal);
  const { projectId } = blockLinkedProject(block, goal);
  const linkedTask = projectTasks.find((task) => task.id === block.taskId) || (
    block.taskId ? { id: block.taskId, title: block.taskTitle, source: block.taskSource } : null
  );

  const patchText = (key, value) => {
    setTextDraft((prev) => ({ ...prev, [key]: value }));
    pendingTextRef.current = { ...pendingTextRef.current, [key]: value || null };
    if (textTimerRef.current) clearTimeout(textTimerRef.current);
    textTimerRef.current = setTimeout(() => {
      textTimerRef.current = null;
      const pending = pendingTextRef.current;
      pendingTextRef.current = {};
      if (Object.keys(pending).length) onPatchRef.current(pending);
    }, TEXT_SAVE_MS);
  };

  const patchActions = (nextActions) => applyPatch({ actions: nextActions });

  const addAction = () => {
    patchActions([
      ...actions,
      createEmptyBlockAction({
        text: '',
        position: actions.length,
      }),
    ]);
  };

  const addResource = () => {
    const url = normalizeUrl(resourceUrl);
    if (!url) return;
    applyPatch({
      resources: [
        ...(block.resources || []),
        createEmptyBlockResource({ title: resourceTitle || null, url }),
      ],
    });
    setResourceTitle('');
    setResourceUrl('');
  };

  return (
    <div className="path-workspace" role="dialog" aria-modal="true" aria-labelledby="path-workspace-title">
      <button type="button" className="path-modal__backdrop" onClick={() => { applyPatch(); onClose(); }} aria-label="Close" />
      <aside className={`path-workspace__panel${goal?.color ? ' path-card--goal' : ''}`} style={goalColorStyle(goal?.color)}>
        <header className="path-workspace__head">
          <div>
            <p className="path-card__meta">Block details</p>
            <h2 id="path-workspace-title">{block.title || 'Untitled block'}</h2>
          </div>
          <div className="path-view__actions">
            <span className="path-workspace__save">{saving ? 'Saving…' : 'Saved'}</span>
            <button type="button" className="btn" onClick={() => { applyPatch(); onEdit(block); }}>Edit</button>
            <button type="button" className="btn" onClick={() => { applyPatch(); onClose(); }}>Close</button>
          </div>
        </header>

        <div className="path-workspace__meta">
          <MetaItem label="Goal" value={goal?.title} />
          <MetaItem label="Type" value={block.blockType} />
          <MetaItem label="Date" value={block.date} />
          <MetaItem label="Start" value={block.startTime} />
          <MetaItem label="Duration" value={formatDuration(block.duration)} />
          <MetaItem label="Status" value={block.status} />
          <MetaItem
            label={block.status === 'Done' ? 'Done at' : block.status === 'Skipped' ? 'Skipped at' : block.status === 'Moved' ? 'Moved at' : 'Updated'}
            value={formatBlockStatusStamp(block)}
          />
        </div>

        <div className="path-workspace__status">
          {block.status !== 'Done' ? <button type="button" className="btn" onClick={() => { applyPatch(); onStatus(block, 'Done'); }}>Done</button> : null}
          {block.status !== 'Moved' ? <button type="button" className="btn" onClick={() => { applyPatch(); onStatus(block, 'Moved'); }}>Moved</button> : null}
          {block.status !== 'Skipped' ? <button type="button" className="btn" onClick={() => { applyPatch(); onStatus(block, 'Skipped'); }}>Skipped</button> : null}
          {block.status !== 'Planned' ? <button type="button" className="btn" onClick={() => { applyPatch(); onStatus(block, 'Planned'); }}>Plan</button> : null}
        </div>
        {block.statusHistory?.length ? (
          <p className="path-card__meta">
            {block.statusHistory.map((event) => `${event.status} ${formatBlockClock(event.at)}`).join(' → ')}
          </p>
        ) : null}

        <section className="path-workspace__section">
          <h3>Desired outcome</h3>
          <textarea
            className="input path-workspace__notes"
            rows={3}
            value={textDraft.desiredOutcome}
            onChange={(event) => patchText('desiredOutcome', event.target.value)}
            onBlur={() => applyPatch()}
            placeholder="Τι πρέπει να έχει ολοκληρωθεί όταν τελειώσει αυτό το block;"
          />
        </section>

        <section className="path-workspace__section">
          <div className="path-workspace__section-head">
            <h3>Actions</h3>
            {progress ? <span className="path-card__meta">{progress.done}/{progress.total}</span> : null}
          </div>
          <p className="path-empty">Checking an action does not mark the whole block done.</p>
          {actions.length ? (
            <ul className="path-workspace__actions">
              {actions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  isOver={overActionId === action.id}
                  onToggle={(id, completed) => patchActions(actions.map((item) => (
                    item.id === id
                      ? {
                          ...item,
                          completed,
                          completedAt: completed ? new Date().toISOString() : null,
                          updatedAt: new Date().toISOString(),
                        }
                      : item
                  )))}
                  onText={(id, text) => patchActions(actions.map((item) => (
                    item.id === id ? { ...item, text, updatedAt: new Date().toISOString() } : item
                  )))}
                  onDelete={(id) => patchActions(actions.filter((item) => item.id !== id).map((item, index) => ({
                    ...item,
                    position: index,
                  })))}
                  onDragOverAction={(item) => setOverActionId(item.id)}
                  onDropOnAction={(id, beforeId) => {
                    patchActions(reorderBlockActions(actions, id, beforeId));
                    setOverActionId(null);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="path-empty">No actions yet.</p>
          )}
          <button type="button" className="path-day__add" onClick={addAction}>+ Action</button>
        </section>

        <section className="path-workspace__section">
          <h3>Notes</h3>
          <textarea
            className="input path-workspace__notes path-workspace__notes--large"
            rows={8}
            value={textDraft.notes}
            onChange={(event) => patchText('notes', event.target.value)}
            onBlur={() => applyPatch()}
            placeholder="Πληροφορίες, σκέψεις, οδηγίες, πρόχειρες σημειώσεις"
          />
        </section>

        <section className="path-workspace__section">
          <h3>Links / Resources</h3>
          {block.resources?.length ? (
            <ul className="path-side-list">
              {block.resources.map((resource) => (
                <li key={resource.id} className="path-workspace__resource">
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    {resource.title || resource.url}
                  </a>
                  <button
                    type="button"
                    className="path-day__add"
                    onClick={() => applyPatch({
                      resources: (block.resources || []).filter((item) => item.id !== resource.id),
                    })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="path-empty">No links yet.</p>
          )}
          <div className="path-form" style={{ marginTop: 10 }}>
            <label className="path-field">
              <span>Title</span>
              <input className="input" value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} placeholder="Optional" />
            </label>
            <label className="path-field">
              <span>URL</span>
              <input className="input" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://" />
            </label>
          </div>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={addResource} disabled={!resourceUrl.trim()}>
            Add link
          </button>
        </section>

        <section className="path-workspace__section">
          <h3>Linked tasks</h3>
          <p className="path-empty">Linking or unlinking a task does not complete this block. Only tasks from this block’s project are listed.</p>
          <label className="path-field" style={{ marginTop: 10 }}>
            <span>Task</span>
            <select
              className="input"
              value={block.taskId || ''}
              onChange={(event) => {
                const task = projectTasks.find((item) => item.id === event.target.value);
                applyPatch({
                  taskId: task?.id || null,
                  taskTitle: task?.title || null,
                  taskSource: task?.source || null,
                  completeLinkedTask: false,
                });
              }}
            >
              <option value="">None — time commitment only</option>
              {projectTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </label>
          {!projectId && !projectTasks.length ? (
            <p className="path-empty">This block isn’t linked to a project, so there are no project tasks to choose.</p>
          ) : projectId && !projectTasks.length ? (
            <p className="path-empty">No open tasks in this project.</p>
          ) : null}
          {linkedTask ? (
            <p className="path-card__meta" style={{ marginTop: 8 }}>
              Linked: {linkedTask.title}
            </p>
          ) : null}
        </section>

        <section className="path-workspace__section">
          <h3>Session result</h3>
          {block.status !== 'Done' ? (
            <p className="path-empty">Fill this when the block is done — or capture it as you go.</p>
          ) : null}
          <label className="path-field path-field--wide" style={{ marginTop: 10 }}>
            <span>What got done</span>
            <textarea
              className="input path-workspace__notes"
              rows={3}
              value={textDraft.resultSummary}
              onChange={(event) => patchText('resultSummary', event.target.value)}
              onBlur={() => applyPatch()}
              placeholder="Τι ολοκληρώθηκε"
            />
          </label>
          <label className="path-field path-field--wide">
            <span>What remains</span>
            <textarea
              className="input path-workspace__notes"
              rows={3}
              value={textDraft.remaining}
              onChange={(event) => patchText('remaining', event.target.value)}
              onBlur={() => applyPatch()}
              placeholder="Τι έμεινε"
            />
          </label>
          <label className="path-field path-field--wide">
            <span>Next step</span>
            <textarea
              className="input path-workspace__notes"
              rows={2}
              value={textDraft.nextStep}
              onChange={(event) => patchText('nextStep', event.target.value)}
              onBlur={() => applyPatch()}
              placeholder="Ποιο είναι το επόμενο βήμα"
            />
          </label>
        </section>
      </aside>
    </div>
  );
}
