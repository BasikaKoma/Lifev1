import { useEffect, useRef, useState } from 'react';
import { createEmptyBlockAction, createEmptyBlockResource, createEmptyNoteSketch, goalColorStyle, sortBlockActions } from '../../lib/path/schema';
import { blockActionProgress, blockLinkedProject, blockStatusAt, defaultBlockDoneAt, formatBlockClock, formatBlockStatusStamp, formatBlockWindow, formatDuration, fromDatetimeLocalValue, reorderBlockActions, tasksForBlockProject, toDatetimeLocalValue } from '../../lib/path/logic';
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { formatClock } from '../../lib/workTimer';
import { PathNoteInkModal } from './PathNoteInkModal';

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

function formatPageDate(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function NoteSketch({ sketch, onCommit, onDelete }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const frameState = useRef(null);
  const placed = {
    x: Number.isFinite(Number(sketch.x)) ? Number(sketch.x) : 16,
    y: Number.isFinite(Number(sketch.y)) ? Number(sketch.y) : 48,
    width: Number.isFinite(Number(sketch.width)) ? Number(sketch.width) : 220,
  };
  const [frame, setFrame] = useState(placed);
  frameState.current = frame;

  const applyFrame = (next) => {
    frameState.current = next;
    setFrame(next);
  };

  useEffect(() => {
    setFrame({
      x: Number.isFinite(Number(sketch.x)) ? Number(sketch.x) : 16,
      y: Number.isFinite(Number(sketch.y)) ? Number(sketch.y) : 48,
      width: Number.isFinite(Number(sketch.width)) ? Number(sketch.width) : 220,
    });
  }, [sketch.id, sketch.x, sketch.y, sketch.width]);

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    frameRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      mode: event.target.closest('[data-resize]') ? 'resize' : 'move',
      startX: event.clientX,
      startY: event.clientY,
      x: frameState.current.x,
      y: frameState.current.y,
      width: frameState.current.width,
    };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === 'resize') {
      applyFrame({ ...frameState.current, width: Math.min(960, Math.max(96, drag.width + dx)) });
      return;
    }
    applyFrame({
      x: Math.max(0, drag.x + dx),
      y: Math.max(0, drag.y + dy),
      width: drag.width,
    });
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const current = frameState.current;
    onCommit({ x: current.x, y: current.y, width: current.width });
  };

  return (
    <div
      ref={frameRef}
      className="path-workspace__sketch"
      style={{ left: frame.x, top: frame.y, width: frame.width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src={sketch.image} alt="Χειρόγραφη σημείωση" draggable={false} />
      <button type="button" aria-label="Αφαίρεση χειρόγραφης σημείωσης" onClick={onDelete}>✕</button>
      <span data-resize className="path-workspace__sketch-resize" aria-label="Αλλαγή μεγέθους" />
    </div>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function ActionRow({
  action,
  isOver,
  onToggle,
  onTime,
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
      {action.completed ? (
        <input
          type="datetime-local"
          className="path-workspace__action-time"
          aria-label={`Ώρα ολοκλήρωσης · ${action.text || 'action'}`}
          value={toDatetimeLocalValue(action.completedAt)}
          onChange={(event) => onTime?.(action.id, event.target.value)}
        />
      ) : null}
      <button type="button" className="path-workspace__action-delete" onClick={() => onDelete(action.id)} aria-label="Διαγραφή βήματος">
        ✕
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
  onDelete,
  onClose,
  onStatus,
  onDoneAt,
}) {
  const timer = useWorkTimer();
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [overActionId, setOverActionId] = useState(null);
  const [inkOpen, setInkOpen] = useState(false);
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

  const subtitle = [
    goal?.title,
    block.blockType,
    formatPageDate(block.date),
    formatBlockWindow(block.startTime, block.duration),
  ].filter(Boolean).join(' · ');
  const timing = timer.session?.blockId === block.id;
  const stampLabel = block.status === 'Skipped' ? 'Skipped' : block.status === 'Moved' ? 'Moved' : 'Ενημέρωση';

  return (
    <div className="path-workspace">
      <header className="path-workspace__top">
        <div className="path-workspace__identity">
          <button type="button" className="path-workspace__back" onClick={() => { applyPatch(); onClose(); }}>
            ← Εβδομάδα
          </button>
          <h2 id="path-workspace-title" className="path-workspace__title">{block.title || 'Χωρίς τίτλο'}</h2>
          {subtitle ? <p className="path-workspace__sub">{subtitle}</p> : null}
        </div>
        <div className="path-workspace__tools">
          <span className="path-workspace__save">{saving ? 'Αποθήκευση…' : 'Αποθηκεύτηκε'}</span>
          <button type="button" className="path-workspace__tool" onClick={() => { applyPatch(); onEdit(block); }}>Επεξεργασία</button>
          <button type="button" className="path-workspace__tool path-workspace__tool--danger" onClick={() => { applyPatch(); onDelete?.(block); }}>Διαγραφή</button>
        </div>
      </header>

      <div className="path-workspace__sheet">
        <div className="path-workspace__main">
          <section className="path-workspace__card path-workspace__card--outcome" style={goalColorStyle(goal?.color)}>
            <h3>Τι πρέπει να κάνω</h3>
            <textarea
              className="path-workspace__write"
              rows={4}
              value={textDraft.desiredOutcome}
              onChange={(event) => patchText('desiredOutcome', event.target.value)}
              onBlur={() => applyPatch()}
              placeholder="Γράψε το αποτέλεσμα που πρέπει να έχει αυτό το block όταν τελειώσει."
            />
          </section>

          <section className="path-workspace__card">
            <div className="path-workspace__section-head">
              <h3>Βήματα</h3>
              {progress ? <span className="path-workspace__count">{progress.done}/{progress.total}</span> : null}
              <button type="button" className="path-workspace__add" onClick={addAction}>+ Βήμα</button>
            </div>
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
                            completedAt: completed ? (item.completedAt || defaultBlockDoneAt(block)) : null,
                            updatedAt: new Date().toISOString(),
                          }
                        : item
                    )))}
                    onTime={(id, value) => {
                      const at = fromDatetimeLocalValue(value);
                      if (!at) return;
                      patchActions(actions.map((item) => (
                        item.id === id
                          ? { ...item, completedAt: at, updatedAt: new Date().toISOString() }
                          : item
                      )));
                    }}
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
              <p className="path-workspace__empty">Κανένα βήμα ακόμα.</p>
            )}
          </section>

          <section className="path-workspace__card">
            <h3>Αποτέλεσμα</h3>
            <div className="path-workspace__result">
              <label className="path-workspace__field path-workspace__field--done">
                <span>Τι έγινε</span>
                <textarea
                  className="path-workspace__write path-workspace__write--short"
                  rows={3}
                  value={textDraft.resultSummary}
                  onChange={(event) => patchText('resultSummary', event.target.value)}
                  onBlur={() => applyPatch()}
                  placeholder="Τι ολοκληρώθηκε"
                />
              </label>
              <label className="path-workspace__field path-workspace__field--left">
                <span>Τι έμεινε</span>
                <textarea
                  className="path-workspace__write path-workspace__write--short"
                  rows={3}
                  value={textDraft.remaining}
                  onChange={(event) => patchText('remaining', event.target.value)}
                  onBlur={() => applyPatch()}
                  placeholder="Τι έμεινε ανοιχτό"
                />
              </label>
              <label className="path-workspace__field path-workspace__field--next">
                <span>Επόμενο</span>
                <textarea
                  className="path-workspace__write path-workspace__write--short"
                  rows={3}
                  value={textDraft.nextStep}
                  onChange={(event) => patchText('nextStep', event.target.value)}
                  onBlur={() => applyPatch()}
                  placeholder="Το επόμενο βήμα"
                />
              </label>
            </div>
          </section>

          <section className="path-workspace__card path-workspace__card--notes">
            <div className="path-workspace__section-head">
              <h3>Σημειώσεις</h3>
              <button type="button" className="path-workspace__add" onClick={() => setInkOpen(true)}>Γραφίτης</button>
            </div>
            <textarea
              className="path-workspace__write path-workspace__write--notes"
              rows={8}
              value={textDraft.notes}
              onChange={(event) => patchText('notes', event.target.value)}
              onBlur={() => applyPatch()}
              placeholder="Σκέψεις, οδηγίες, πρόχειρες σημειώσεις."
            />
            {block.noteSketches?.length ? block.noteSketches.map((sketch) => (
              <NoteSketch
                key={sketch.id}
                sketch={sketch}
                onCommit={(patch) => applyPatch({
                  noteSketches: (block.noteSketches || []).map((item) => (
                    item.id === sketch.id ? { ...item, ...patch } : item
                  )),
                })}
                onDelete={() => applyPatch({
                  noteSketches: (block.noteSketches || []).filter((item) => item.id !== sketch.id),
                })}
              />
            )) : null}
          </section>
        </div>

        <aside className="path-workspace__side">
          <section className="path-workspace__card">
            <h3>Χρόνος</h3>
            <dl className="path-workspace__facts">
              <Fact label="Στόχος" value={goal?.title} />
              <Fact label="Τύπος" value={block.blockType} />
              <Fact label="Ημέρα" value={formatPageDate(block.date)} />
              <Fact label="Ώρα" value={formatBlockWindow(block.startTime, block.duration)} />
              <Fact label="Διάρκεια" value={formatDuration(block.duration)} />
              <Fact label="Tracked" value={formatDuration(block.workedMinutes)} />
              <Fact label="Κατάσταση" value={block.status} />
            </dl>
            {block.status !== 'Done' && block.status !== 'Skipped' ? (
              <button
                type="button"
                className={`path-workspace__start${block.blockType === 'Deep Work' ? ' path-workspace__start--deep' : ''}${timing ? ' path-workspace__start--live' : ''}`}
                onClick={() => {
                  if (!timing) timer.startBlock(block);
                }}
              >
                {timing ? formatClock(timer.elapsedMs) : (block.blockType === 'Deep Work' ? 'Deep Work' : 'Έναρξη')}
              </button>
            ) : null}
            <div className="path-workspace__status">
              {block.status !== 'Done' ? <button type="button" onClick={() => { applyPatch(); onStatus(block, 'Done'); }}>Done</button> : null}
              {block.status !== 'Moved' ? <button type="button" onClick={() => { applyPatch(); onStatus(block, 'Moved'); }}>Moved</button> : null}
              {block.status !== 'Skipped' ? <button type="button" onClick={() => { applyPatch(); onStatus(block, 'Skipped'); }}>Skipped</button> : null}
              {block.status !== 'Planned' ? <button type="button" onClick={() => { applyPatch(); onStatus(block, 'Planned'); }}>Plan</button> : null}
            </div>
            {block.status === 'Done' ? (
              <label className="path-workspace__done-at">
                <span>Ολοκληρώθηκε</span>
                <input
                  type="datetime-local"
                  aria-label="Ώρα ολοκλήρωσης"
                  value={toDatetimeLocalValue(blockStatusAt(block))}
                  onChange={(event) => onDoneAt?.(event.target.value)}
                />
              </label>
            ) : formatBlockStatusStamp(block) ? (
              <p className="path-workspace__stamp">{stampLabel} · {formatBlockStatusStamp(block)}</p>
            ) : null}
            {block.statusHistory?.length ? (
              <p className="path-workspace__stamp">
                {block.statusHistory.map((event) => `${event.status} ${formatBlockClock(event.at)}`).join(' → ')}
              </p>
            ) : null}
          </section>

          <section className="path-workspace__card">
            <h3>Σύνδεσμοι</h3>
            {block.resources?.length ? (
              <ul className="path-workspace__links">
                {block.resources.map((resource) => (
                  <li key={resource.id}>
                    <a href={resource.url} target="_blank" rel="noreferrer">
                      {resource.title || resource.url}
                    </a>
                    <button
                      type="button"
                      aria-label="Αφαίρεση συνδέσμου"
                      onClick={() => applyPatch({
                        resources: (block.resources || []).filter((item) => item.id !== resource.id),
                      })}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="path-workspace__empty">Κανένας σύνδεσμος.</p>
            )}
            <input
              className="input"
              value={resourceTitle}
              onChange={(event) => setResourceTitle(event.target.value)}
              placeholder="Τίτλος"
              aria-label="Τίτλος συνδέσμου"
            />
            <input
              className="input"
              value={resourceUrl}
              onChange={(event) => setResourceUrl(event.target.value)}
              placeholder="https://"
              aria-label="URL"
            />
            <button type="button" className="path-workspace__add" onClick={addResource} disabled={!resourceUrl.trim()}>
              Προσθήκη
            </button>
          </section>

          <section className="path-workspace__card">
            <h3>Εργασία</h3>
            <select
              className="input"
              aria-label="Συνδεδεμένο task"
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
              <option value="">Κανένα</option>
              {projectTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
            {!projectId && !projectTasks.length ? (
              <p className="path-workspace__empty">Χωρίς project, δεν υπάρχουν tasks.</p>
            ) : null}
            {linkedTask?.title ? <p className="path-workspace__stamp">{linkedTask.title}</p> : null}
          </section>
        </aside>
      </div>
      <PathNoteInkModal
        open={inkOpen}
        onClose={() => setInkOpen(false)}
        onSave={(image) => {
          const count = block.noteSketches?.length || 0;
          const sketch = createEmptyNoteSketch({
            image,
            x: 16 + (count % 3) * 36,
            y: 52 + (count % 4) * 36,
            width: 220,
          });
          if (!sketch) return;
          applyPatch({ noteSketches: [...(block.noteSketches || []), sketch] });
          setInkOpen(false);
        }}
      />
    </div>
  );
}
