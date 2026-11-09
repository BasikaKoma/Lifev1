import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createEmptyBlockResource, createEmptyNoteSketch, goalColorStyle, sortBlockActions } from '../../lib/path/schema';
import { blockActionProgress, blockLinkedProject, blockStatusAt, defaultBlockDoneAt, formatBlockClock, formatBlockStatusStamp, formatBlockWindow, formatDuration, fromDatetimeLocalValue, reorderBlockActions, tasksForBlockProject, toDatetimeLocalValue } from '../../lib/path/logic';
import { appendBlockActions, blockCarryOver, blockResultDraft, captureLineCount, carriedActionTargets, carryOverItems, parseCaptureLine, soleUrl, splitCaptureText, taskTextKey } from '../../lib/path/blockCapture';
import { organizeBlockTasks } from '../../lib/path/organizeTasks';
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { formatClock } from '../../lib/workTimer';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import { PathNoteInkModal } from './PathNoteInkModal';

const TEXT_SAVE_MS = 700;
const NOTICE_MS = 8000;
const RESULT_KEYS = ['resultSummary', 'remaining', 'nextStep'];
const PROJECT_PREVIEW = 6;

function textDraftFromBlock(block) {
  return {
    desiredOutcome: block?.desiredOutcome || '',
    notes: block?.notes || '',
    resultSummary: block?.resultSummary || '',
    remaining: block?.remaining || '',
    nextStep: block?.nextStep || '',
  };
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

function formatShortDay(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = new Intl.DateTimeFormat('el-GR', { weekday: 'short' }).format(date);
  return `${weekday} ${date.getDate()}/${date.getMonth() + 1}`;
}

function countLabel(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

/** A textarea that grows with its text, so short fields stay one line until they need more. */
const GrowText = forwardRef(function GrowText({ value, className, ...props }, outerRef) {
  const innerRef = useRef(null);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
  }, [value]);

  return (
    <textarea
      rows={1}
      {...props}
      ref={(node) => {
        innerRef.current = node;
        if (typeof outerRef === 'function') outerRef(node);
        else if (outerRef) outerRef.current = node;
      }}
      className={className}
      value={value}
    />
  );
});

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

function TaskRow({
  action,
  carriedTo,
  isOver,
  onToggle,
  onTime,
  onText,
  onLink,
  onDelete,
  onEnter,
  onEmptyBackspace,
  onDragOverAction,
  onDropOnAction,
}) {
  const [editingTime, setEditingTime] = useState(false);

  return (
    <li
      className={`path-tasks__row${isOver ? ' path-tasks__row--over' : ''}${action.completed ? ' path-tasks__row--done' : ''}`}
      data-action-id={action.id}
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
        className="path-tasks__drag"
        draggable
        aria-label="Μετακίνηση εργασίας"
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', action.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={Boolean(action.completed)}
        aria-label={`Ολοκλήρωση · ${action.text || 'εργασία'}`}
        className="path-tasks__box"
        onClick={() => onToggle(action.id, !action.completed)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </button>
      <input
        className="path-tasks__text"
        value={action.text}
        onChange={(event) => onText(action.id, event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnter(action.id);
          } else if (event.key === 'Backspace' && !action.text) {
            event.preventDefault();
            onEmptyBackspace(action.id);
          }
        }}
        onPaste={(event) => {
          const url = soleUrl(event.clipboardData?.getData('text/plain'));
          if (!url) return;
          event.preventDefault();
          onLink(action.id, url);
        }}
        placeholder="Εργασία"
        aria-label="Εργασία"
      />
      <span className="path-tasks__meta">
        {action.url ? (
          <a className="path-tasks__link" href={action.url} target="_blank" rel="noreferrer" title={action.url} aria-label="Άνοιγμα συνδέσμου">↗</a>
        ) : null}
        {action.taskId ? <span className="path-tasks__tag" title="Task του project">Project</span> : null}
        {action.carriedFrom ? <span className="path-tasks__tag" title="Από το προηγούμενο block">↻</span> : null}
        {carriedTo && !action.completed ? (
          <span className="path-tasks__tag path-tasks__tag--next" title="Συνεχίζει σε επόμενο block">→ {formatShortDay(carriedTo.date)}</span>
        ) : null}
        {action.completed ? (
          editingTime ? (
            <input
              type="datetime-local"
              className="path-workspace__action-time"
              aria-label={`Ώρα ολοκλήρωσης · ${action.text || 'εργασία'}`}
              autoFocus
              value={toDatetimeLocalValue(action.completedAt)}
              onChange={(event) => onTime(action.id, event.target.value)}
              onBlur={() => setEditingTime(false)}
            />
          ) : (
            <button type="button" className="path-tasks__time" title="Αλλαγή ώρας ολοκλήρωσης" onClick={() => setEditingTime(true)}>
              {formatBlockClock(action.completedAt) || '—'}
            </button>
          )
        ) : null}
      </span>
      <button type="button" className="path-tasks__delete" onClick={() => onDelete(action.id)} aria-label="Διαγραφή εργασίας">
        ✕
      </button>
    </li>
  );
}

export function PathBlockWorkspace({
  block,
  blocks = [],
  goal,
  tasks = [],
  saving = false,
  onPatch,
  onEdit,
  onDelete,
  onClose,
  onStatus,
  onDoneAt,
  onCompleteTask,
}) {
  const timer = useWorkTimer();
  const [linkDraft, setLinkDraft] = useState('');
  const [overActionId, setOverActionId] = useState(null);
  const [inkOpen, setInkOpen] = useState(false);
  const [textDraft, setTextDraft] = useState(() => textDraftFromBlock(block));
  const [capture, setCapture] = useState('');
  const [closing, setClosing] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [showAllProject, setShowAllProject] = useState(false);
  const [organize, setOrganize] = useState(null);
  const [notice, setNotice] = useState(null);
  const [skipProjectTasks, setSkipProjectTasks] = useState(() => new Set());
  const pendingTextRef = useRef({});
  const textTimerRef = useRef(null);
  const autoResultRef = useRef(null);
  const organizeAbortRef = useRef(null);
  const captureRef = useRef(null);
  const listRef = useRef(null);
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
    if (!Object.keys(pending).length && !(patch && Object.keys(patch).length)) return;
    onPatchRef.current({ ...pending, ...patch });
  };

  useEffect(() => {
    setTextDraft(textDraftFromBlock(block));
    pendingTextRef.current = {};
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    organizeAbortRef.current?.abort();
    autoResultRef.current = null;
    setCapture('');
    setClosing(false);
    setOutcomeOpen(false);
    setShowAllProject(false);
    setOrganize(null);
    setNotice(null);
    setSkipProjectTasks(new Set());
  }, [block?.id]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => () => {
    organizeAbortRef.current?.abort();
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
  const { projectId, projectTitle } = blockLinkedProject(block, goal);
  const inBlockTaskIds = new Set(actions.map((action) => action.taskId).filter(Boolean));
  const pickable = projectTasks.filter((task) => !inBlockTaskIds.has(task.id));
  const visiblePickable = showAllProject ? pickable : pickable.slice(0, PROJECT_PREVIEW);
  const openTaskIds = new Set((tasks || []).map((task) => task.id));
  const projectDone = actions.filter((action) => action.completed && action.taskId && openTaskIds.has(action.taskId));
  const carry = blockCarryOver(blocks, block);
  const carriedTargets = carriedActionTargets(blocks);
  const mode = closing || block.status === 'Done' ? 'close' : 'work';
  const isToday = block.date === localTodayIsoDate();
  const captureQuery = capture.trim().toLowerCase();
  const suggestions = captureQuery.length >= 2 && !capture.includes('\n')
    ? pickable.filter((task) => String(task.title || '').toLowerCase().includes(captureQuery)).slice(0, 3)
    : [];
  const canOrganize = wordCount(capture) >= 6 || captureLineCount(capture) >= 2;
  const showOutcome = Boolean(textDraft.desiredOutcome) || outcomeOpen;
  // A "next" written outside the close step (e.g. a thought sent to Path) stays in view while working.
  const looseNext = mode === 'work' && textDraft.nextStep.trim()
    && !actions.some((action) => taskTextKey(action.text) === taskTextKey(textDraft.nextStep))
    ? textDraft.nextStep.trim()
    : null;
  const sketchSpace = (block.noteSketches || []).reduce(
    (max, sketch) => Math.max(max, (Number(sketch.y) || 0) + (Number(sketch.width) || 220) * 0.62 + 24),
    0,
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

  /** While closing, result fields the user has not rewritten follow the checklist. */
  const patchActions = (nextActions, extra = {}) => {
    const patch = { ...extra, actions: nextActions };
    if (mode === 'close' && autoResultRef.current) {
      const nextAuto = blockResultDraft({ actions: nextActions });
      const follow = {};
      for (const key of RESULT_KEYS) {
        if ((textDraft[key] || '') === (autoResultRef.current[key] || '')) {
          patch[key] = nextAuto[key] || null;
          follow[key] = nextAuto[key] || '';
        }
      }
      autoResultRef.current = nextAuto;
      if (Object.keys(follow).length) setTextDraft((prev) => ({ ...prev, ...follow }));
    }
    applyPatch(patch);
  };

  const fillResults = ({ force = false } = {}) => {
    const auto = blockResultDraft(block);
    const patch = {};
    for (const key of RESULT_KEYS) {
      if (force || !String(textDraft[key] || '').trim()) patch[key] = auto[key] || null;
    }
    autoResultRef.current = auto;
    setTextDraft((prev) => ({
      ...prev,
      ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value || ''])),
    }));
    return patch;
  };

  const focusCapture = () => {
    requestAnimationFrame(() => captureRef.current?.focus());
  };

  const focusRow = (actionId, atEnd = true) => {
    requestAnimationFrame(() => {
      const input = listRef.current?.querySelector(`[data-action-id="${actionId}"] .path-tasks__text`);
      if (!input) return;
      input.focus();
      if (atEnd) {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  };

  const addItems = (items, { announce = false } = {}) => {
    const taskItems = items.filter((item) => item.text);
    const linkItems = items.filter((item) => !item.text && item.url);
    if (!taskItems.length && !linkItems.length) return;
    const resources = linkItems.length
      ? [...(block.resources || []), ...linkItems.map((item) => createEmptyBlockResource({ url: item.url }))]
      : null;
    const extra = resources ? { resources } : {};
    let added = [];
    if (taskItems.length) {
      const next = appendBlockActions(actions, taskItems);
      added = next.added;
      patchActions(next.actions, extra);
    } else {
      applyPatch(extra);
    }
    if (!announce) return;
    const parts = [];
    if (added.length) parts.push(`Προστέθηκαν ${countLabel(added.length, 'εργασία', 'εργασίες')}`);
    if (linkItems.length) parts.push(`${countLabel(linkItems.length, 'σύνδεσμος', 'σύνδεσμοι')} στους Συνδέσμους`);
    setNotice({
      text: parts.join(' · '),
      actionIds: added.map((action) => action.id),
      resourceIds: resources ? resources.slice(-linkItems.length).map((item) => item.id) : [],
    });
  };

  const undoNotice = () => {
    if (!notice) return;
    const actionIds = new Set(notice.actionIds);
    const resourceIds = new Set(notice.resourceIds);
    const extra = resourceIds.size
      ? { resources: (block.resources || []).filter((item) => !resourceIds.has(item.id)) }
      : {};
    if (actionIds.size) {
      patchActions(
        actions.filter((action) => !actionIds.has(action.id)).map((action, index) => ({ ...action, position: index })),
        extra,
      );
    } else {
      applyPatch(extra);
    }
    setNotice(null);
  };

  const submitCapture = () => {
    const items = splitCaptureText(capture);
    if (!items.length) return;
    addItems(items, { announce: items.length > 1 || items.some((item) => !item.text) });
    setCapture('');
    setOrganize(null);
  };

  const addProjectTask = (task) => {
    addItems([{ text: task.title || 'Task', taskId: task.id, taskSource: task.source || null }]);
    setCapture('');
  };

  const runOrganize = async () => {
    const note = capture.trim();
    if (!note || organize?.status === 'loading') return;
    organizeAbortRef.current?.abort();
    const controller = new AbortController();
    organizeAbortRef.current = controller;
    setOrganize({ status: 'loading', items: [], error: null });
    try {
      const list = await organizeBlockTasks(note, {
        blockTitle: block.title,
        goalTitle: goal?.title,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setOrganize({
        status: 'ready',
        items: list.map((text, index) => ({ id: `ai-${index}`, text, keep: true })),
        error: null,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setOrganize({ status: 'error', items: [], error: err?.message || 'Η οργάνωση απέτυχε.' });
    }
  };

  const acceptOrganize = () => {
    const items = (organize?.items || [])
      .filter((item) => item.keep)
      .map((item) => parseCaptureLine(item.text))
      .filter(Boolean);
    if (!items.length) return;
    addItems(items, { announce: true });
    setCapture('');
    setOrganize(null);
    focusCapture();
  };

  const toggleAction = (id, completed) => patchActions(actions.map((item) => (
    item.id === id
      ? {
          ...item,
          completed,
          completedAt: completed ? (item.completedAt || defaultBlockDoneAt(block)) : null,
          updatedAt: new Date().toISOString(),
        }
      : item
  )));

  const updateAction = (id, patch) => patchActions(actions.map((item) => (
    item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
  )));

  const deleteAction = (id) => patchActions(actions.filter((item) => item.id !== id).map((item, index) => ({
    ...item,
    position: index,
  })));

  const addLink = () => {
    const parsed = parseCaptureLine(linkDraft);
    if (!parsed?.url) return;
    applyPatch({
      resources: [
        ...(block.resources || []),
        createEmptyBlockResource({ title: parsed.text || null, url: parsed.url }),
      ],
    });
    setLinkDraft('');
  };

  const startClose = () => {
    applyPatch(fillResults());
    setClosing(true);
  };

  const completeProjectTasks = () => {
    for (const action of projectDone) {
      if (skipProjectTasks.has(action.taskId)) continue;
      onCompleteTask?.({ taskId: action.taskId, taskSource: action.taskSource, taskTitle: action.text });
    }
  };

  const finishBlock = () => {
    completeProjectTasks();
    applyPatch();
    onStatus(block, 'Done');
  };

  const setStatus = (status) => {
    if (status === 'Done') {
      applyPatch(fillResults());
      setClosing(true);
    } else {
      applyPatch();
      setClosing(false);
    }
    onStatus(block, status);
  };

  const subtitle = [
    goal?.title,
    block.blockType,
    formatPageDate(block.date),
    formatBlockWindow(block.startTime, block.duration),
  ].filter(Boolean).join(' · ');
  const timing = timer.session?.blockId === block.id;
  const stampLabel = block.status === 'Skipped' ? 'Skipped' : block.status === 'Moved' ? 'Moved' : 'Ενημέρωση';
  const checklistTitle = block.status === 'Done'
    ? 'Εργασίες'
    : isToday ? 'Τι θα κάνω σήμερα;' : 'Τι θα κάνω;';

  const closeCard = mode === 'close' ? (
    <section className="path-workspace__card path-close">
      <div className="path-workspace__section-head">
        <h3>{block.status === 'Done' ? 'Αποτέλεσμα' : 'Κλείσιμο block'}</h3>
        <button
          type="button"
          className="path-workspace__add"
          title="Ξαναγράφει τα πεδία από τις ολοκληρωμένες και τις ανοιχτές εργασίες"
          onClick={() => applyPatch(fillResults({ force: true }))}
        >
          ↺ Από τις εργασίες
        </button>
      </div>
      <p className="path-close__stats">
        {[
          progress ? `${progress.done} από ${progress.total} εργασίες` : 'Χωρίς εργασίες',
          block.workedMinutes ? `${formatDuration(block.workedMinutes)} δουλειά` : null,
        ].filter(Boolean).join(' · ')}
      </p>
      <div className="path-workspace__result">
        <label className="path-workspace__field path-workspace__field--done">
          <span>Τι έγινε</span>
          <GrowText
            className="path-workspace__write path-workspace__write--short"
            value={textDraft.resultSummary}
            onChange={(event) => patchText('resultSummary', event.target.value)}
            onBlur={() => applyPatch()}
            placeholder="Τι ολοκληρώθηκε"
          />
        </label>
        <label className="path-workspace__field path-workspace__field--left">
          <span>Τι έμεινε</span>
          <GrowText
            className="path-workspace__write path-workspace__write--short"
            value={textDraft.remaining}
            onChange={(event) => patchText('remaining', event.target.value)}
            onBlur={() => applyPatch()}
            placeholder="Τι έμεινε ανοιχτό"
          />
        </label>
        <label className="path-workspace__field path-workspace__field--next">
          <span>Επόμενο</span>
          <GrowText
            className="path-workspace__write path-workspace__write--short"
            value={textDraft.nextStep}
            onChange={(event) => patchText('nextStep', event.target.value)}
            onBlur={() => applyPatch()}
            placeholder="Η επόμενη ενέργεια"
          />
        </label>
      </div>
      {projectDone.length ? (
        <div className="path-close__project">
          <p>
            {projectDone.length === 1
              ? 'Ένα task του project ολοκληρώθηκε εδώ αλλά είναι ακόμα ανοιχτό στο project.'
              : `${projectDone.length} tasks του project ολοκληρώθηκαν εδώ αλλά είναι ακόμα ανοιχτά στο project.`}
          </p>
          <ul>
            {projectDone.map((action) => (
              <li key={action.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!skipProjectTasks.has(action.taskId)}
                    onChange={(event) => setSkipProjectTasks((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.delete(action.taskId);
                      else next.add(action.taskId);
                      return next;
                    })}
                  />
                  <span>{action.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {block.status === 'Done' ? (
            <button
              type="button"
              className="path-close__secondary"
              disabled={projectDone.every((action) => skipProjectTasks.has(action.taskId))}
              onClick={completeProjectTasks}
            >
              Κλείσιμο και στο project
            </button>
          ) : (
            <span className="path-close__hint">Κλείνουν και στο project με την ολοκλήρωση.</span>
          )}
        </div>
      ) : null}
      {block.status !== 'Done' ? (
        <div className="path-close__actions">
          <button
            type="button"
            className="path-close__secondary"
            onClick={() => {
              applyPatch();
              setClosing(false);
            }}
          >
            ← Συνέχεια δουλειάς
          </button>
          <button type="button" className="path-close__primary" onClick={finishBlock}>
            Ολοκλήρωση block
          </button>
        </div>
      ) : null}
    </section>
  ) : null;

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
          {closeCard}

          <section className="path-workspace__card path-tasks" style={goalColorStyle(goal?.color)}>
            <div className="path-workspace__section-head">
              <h3 className="path-tasks__title">{checklistTitle}</h3>
              {!showOutcome ? (
                <button type="button" className="path-workspace__add" onClick={() => setOutcomeOpen(true)}>
                  + Ορισμός αποτελέσματος
                </button>
              ) : null}
            </div>

            {showOutcome ? (
              <label className="path-tasks__outcome">
                <span>Αποτέλεσμα</span>
                <GrowText
                  className="path-tasks__outcome-input"
                  value={textDraft.desiredOutcome}
                  autoFocus={outcomeOpen && !textDraft.desiredOutcome}
                  onChange={(event) => patchText('desiredOutcome', event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      focusCapture();
                    }
                  }}
                  onBlur={() => {
                    applyPatch();
                    if (!textDraft.desiredOutcome.trim()) setOutcomeOpen(false);
                  }}
                  placeholder="Τι πρέπει να ισχύει όταν τελειώσει το block"
                />
              </label>
            ) : null}

            {carry ? (
              <div className="path-carry">
                <span className="path-carry__icon" aria-hidden="true">↻</span>
                <div className="path-carry__body">
                  <strong>
                    {carry.actions.length === 1
                      ? '1 εργασία έμεινε από την προηγούμενη φορά'
                      : `${carry.actions.length} εργασίες έμειναν από την προηγούμενη φορά`}
                  </strong>
                  <span>
                    {[formatPageDate(carry.source.date), carry.actions.map((action) => action.text.trim()).join(' · ')]
                      .filter(Boolean)
                      .join(' — ')}
                  </span>
                </div>
                <div className="path-carry__actions">
                  <button
                    type="button"
                    className="path-carry__take"
                    onClick={() => {
                      const next = appendBlockActions(actions, carryOverItems(carry.actions));
                      patchActions(next.actions, { carryOverDismissedFrom: carry.source.id });
                    }}
                  >
                    Μεταφορά
                  </button>
                  <button
                    type="button"
                    className="path-carry__skip"
                    onClick={() => applyPatch({ carryOverDismissedFrom: carry.source.id })}
                  >
                    Όχι
                  </button>
                </div>
              </div>
            ) : null}

            {actions.length ? (
              <ul className="path-tasks__list" ref={listRef}>
                {actions.map((action, index) => (
                  <TaskRow
                    key={action.id}
                    action={action}
                    carriedTo={carriedTargets.get(action.id) || null}
                    isOver={overActionId === action.id}
                    onToggle={toggleAction}
                    onTime={(id, value) => {
                      const at = fromDatetimeLocalValue(value);
                      if (at) updateAction(id, { completedAt: at });
                    }}
                    onText={(id, text) => updateAction(id, { text })}
                    onLink={(id, url) => updateAction(id, { url })}
                    onDelete={deleteAction}
                    onEnter={() => {
                      const nextAction = actions[index + 1];
                      if (nextAction) focusRow(nextAction.id);
                      else focusCapture();
                    }}
                    onEmptyBackspace={(id) => {
                      const previous = actions[index - 1];
                      deleteAction(id);
                      if (previous) focusRow(previous.id);
                      else focusCapture();
                    }}
                    onDragOverAction={(item) => setOverActionId(item.id)}
                    onDropOnAction={(id, beforeId) => {
                      patchActions(reorderBlockActions(actions, id, beforeId));
                      setOverActionId(null);
                    }}
                  />
                ))}
              </ul>
            ) : null}

            {looseNext ? (
              <div className="path-tasks__next">
                <span>Επόμενο</span>
                <p>{looseNext}</p>
                <button
                  type="button"
                  onClick={() => {
                    setTextDraft((prev) => ({ ...prev, nextStep: '' }));
                    patchActions(appendBlockActions(actions, [{ text: looseNext }]).actions, { nextStep: null });
                  }}
                >
                  + Εργασία
                </button>
              </div>
            ) : null}

            <div className="path-capture">
              <span className="path-capture__plus" aria-hidden="true">+</span>
              <GrowText
                ref={captureRef}
                className="path-capture__input"
                value={capture}
                aria-label="Νέα εργασία"
                placeholder={actions.length ? 'Πρόσθεσε εργασία και πάτα Enter' : 'Γράψε μια εργασία και πάτα Enter. Επικόλλησε λίστα για πολλές μαζί.'}
                onChange={(event) => {
                  setCapture(event.target.value);
                  if (organize?.status === 'error') setOrganize(null);
                }}
                onPaste={(event) => {
                  const text = event.clipboardData?.getData('text/plain') || '';
                  if (captureLineCount(text) < 2) return;
                  event.preventDefault();
                  addItems(splitCaptureText(text), { announce: true });
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitCapture();
                  } else if (event.key === 'Escape') {
                    setOrganize(null);
                  }
                }}
              />
              {canOrganize ? (
                <button
                  type="button"
                  className="path-capture__ai"
                  disabled={organize?.status === 'loading'}
                  title="Χωρίζει το κείμενο σε εργασίες με AI"
                  onClick={runOrganize}
                >
                  {organize?.status === 'loading' ? 'Οργάνωση…' : '✦ Οργάνωση'}
                </button>
              ) : null}
            </div>

            {suggestions.length && !organize ? (
              <div className="path-capture__suggest">
                <span>Από το project</span>
                {suggestions.map((task) => (
                  <button key={task.id} type="button" onClick={() => addProjectTask(task)}>
                    {task.title}
                  </button>
                ))}
              </div>
            ) : null}

            {organize?.status === 'ready' ? (
              <div className="path-organize">
                <p className="path-organize__head">Πρόταση AI · διάλεξε τι κρατάς</p>
                <ul>
                  {organize.items.map((item) => (
                    <li key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.keep}
                          onChange={(event) => setOrganize((prev) => ({
                            ...prev,
                            items: prev.items.map((entry) => (
                              entry.id === item.id ? { ...entry, keep: event.target.checked } : entry
                            )),
                          }))}
                        />
                        <span>{item.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="path-organize__actions">
                  <button type="button" className="path-close__secondary" onClick={() => setOrganize(null)}>Άκυρο</button>
                  <button
                    type="button"
                    className="path-close__primary"
                    disabled={!organize.items.some((item) => item.keep)}
                    onClick={acceptOrganize}
                  >
                    Προσθήκη {organize.items.filter((item) => item.keep).length}
                  </button>
                </div>
              </div>
            ) : null}

            {organize?.status === 'error' ? (
              <p className="path-organize__error">{organize.error}</p>
            ) : null}

            <div className="path-tasks__foot">
              {notice ? (
                <p className="path-tasks__notice">
                  {notice.text}
                  <button type="button" onClick={undoNotice}>Αναίρεση</button>
                </p>
              ) : (
                <div className="path-tasks__progress">
                  <span>{progress ? `${progress.done} από ${progress.total} ολοκληρώθηκαν` : 'Καμία εργασία ακόμα'}</span>
                  {progress ? (
                    <span className="path-tasks__bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                    </span>
                  ) : null}
                </div>
              )}
              {mode === 'work' ? (
                <button type="button" className="path-tasks__close" onClick={startClose}>
                  Κλείσιμο block →
                </button>
              ) : null}
            </div>
          </section>

          <section
            className="path-workspace__card path-workspace__card--notes"
            style={sketchSpace ? { minHeight: Math.ceil(sketchSpace) } : undefined}
          >
            <div className="path-workspace__section-head">
              <h3>Σημειώσεις</h3>
              <button type="button" className="path-workspace__add" onClick={() => setInkOpen(true)}>Γραφίτης</button>
            </div>
            <GrowText
              className="path-workspace__write path-workspace__write--notes"
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
              {block.status !== 'Done' ? <button type="button" onClick={() => setStatus('Done')}>Done</button> : null}
              {block.status !== 'Moved' ? <button type="button" onClick={() => setStatus('Moved')}>Moved</button> : null}
              {block.status !== 'Skipped' ? <button type="button" onClick={() => setStatus('Skipped')}>Skipped</button> : null}
              {block.status !== 'Planned' ? <button type="button" onClick={() => setStatus('Planned')}>Plan</button> : null}
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
            <div className="path-workspace__section-head">
              <h3>Από το project</h3>
              {projectTitle ? <span className="path-workspace__count">{projectTitle}</span> : null}
            </div>
            {pickable.length ? (
              <ul className="path-pick">
                {visiblePickable.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      title={task.id === block.taskId ? 'Το task που είναι συνδεδεμένο με το block' : 'Προσθήκη στις εργασίες του block'}
                      onClick={() => addProjectTask(task)}
                    >
                      <span aria-hidden="true">+</span>
                      {task.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="path-workspace__empty">
                {!projectId && !projectTitle
                  ? 'Χωρίς project, δεν υπάρχουν tasks.'
                  : projectTasks.length
                    ? 'Όλα τα ανοιχτά tasks είναι ήδη στο block.'
                    : 'Κανένα ανοιχτό task στο project.'}
              </p>
            )}
            {pickable.length > PROJECT_PREVIEW ? (
              <button type="button" className="path-workspace__add" onClick={() => setShowAllProject((value) => !value)}>
                {showAllProject ? 'Λιγότερα' : `Όλα (${pickable.length})`}
              </button>
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
              <p className="path-workspace__empty">Επικόλλησε ένα URL πάνω σε εργασία για να δεθεί εκεί, ή εδώ για όλο το block.</p>
            )}
            <input
              className="input"
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addLink();
                }
              }}
              placeholder="Τίτλος https://…"
              aria-label="Νέος σύνδεσμος"
            />
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
