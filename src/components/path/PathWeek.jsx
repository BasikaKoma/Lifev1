import { useEffect, useMemo, useRef, useState } from 'react';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import {
  createEmptyBlock,
  createEmptyTemplate,
  WEEKDAYS,
  goalColorStyle,
  shiftWeek,
  startOfWeekMonday,
  weekDates,
} from '../../lib/path/schema';
import { blocksForDate, blockActionProgress, blockStatusAt, defaultBlockDoneAt, formatBlockStatusStamp, formatBlockWindow, formatDuration, formatWeekRange, fromDatetimeLocalValue, toDatetimeLocalValue } from '../../lib/path/logic';
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { formatClock } from '../../lib/workTimer';
import { ConfirmDialog } from '../ConfirmDialog';
import { BlockFields, PathModal, TemplateFields } from './PathFields';
import { PathBlockWorkspace } from './PathBlockWorkspace';

const STATUS_CLASS = {
  Done: 'path-pill--done',
  Moved: 'path-pill--moved',
  Skipped: 'path-pill--skipped',
};

function BlockCard({
  block,
  color,
  isOver,
  canMoveUp,
  canMoveDown,
  timing = false,
  liveClock = null,
  onOpen,
  onEdit,
  onStart,
  onStatus,
  onDoneAt,
  onNudge,
  onDropOnBlock,
  onDragOverBlock,
  onDelete,
}) {
  const dragMoved = useRef(false);
  const progress = blockActionProgress(block);
  const statusStamp = formatBlockStatusStamp(block);
  return (
    <article
      className={`path-block${color ? ' path-block--goal' : ''}${isOver ? ' path-block--over' : ''}${timing ? ' path-block--timing' : ''}${timing && block.blockType === 'Deep Work' ? ' path-block--timing-deep' : ''}`}
      style={goalColorStyle(color)}
      draggable
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(block);
      }}
      onClick={(event) => {
        if (dragMoved.current) return;
        if (event.target.closest('button, input, label, a, select, textarea')) return;
        onOpen(block);
      }}
      onDragStart={(event) => {
        dragMoved.current = true;
        event.dataTransfer.setData('text/plain', block.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          dragMoved.current = false;
        }, 0);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDragOverBlock?.(block);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData('text/plain');
        if (id) onDropOnBlock?.(id, block);
      }}
    >
      <div className="path-block__top">
        <div className="path-block__main">
          <div className="path-block__title">{block.title}</div>
          <div className="path-block__time">
            {[formatBlockWindow(block.startTime, block.duration), block.blockType].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="path-block__reorder" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="path-block__icon"
            aria-label="Edit block"
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.(block);
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="path-block__icon path-block__icon--delete"
            aria-label="Delete block"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.(block);
            }}
          >
            ✕
          </button>
          <button
            type="button"
            aria-label="Move up"
            disabled={!canMoveUp}
            onClick={(event) => {
              event.stopPropagation();
              onNudge?.(block.id, -1);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={!canMoveDown}
            onClick={(event) => {
              event.stopPropagation();
              onNudge?.(block.id, 1);
            }}
          >
            ↓
          </button>
        </div>
      </div>
      {block.desiredOutcome ? (
        <p className="path-block__outcome">{block.desiredOutcome}</p>
      ) : null}
      <div className="path-pills">
        <span className={`path-pill ${STATUS_CLASS[block.status] || ''}`}>
          {block.status}
          {statusStamp ? ` · ${statusStamp}` : ''}
        </span>
        {progress ? <span className="path-pill path-pill--actions">{progress.done}/{progress.total} actions</span> : null}
        {block.workedMinutes ? <span className="path-pill">{formatDuration(block.workedMinutes)} tracked</span> : null}
      </div>
      <div className="path-block__actions">
        {block.status !== 'Done' && block.status !== 'Skipped' ? (
          <button
            type="button"
            className={`path-block__start${block.blockType === 'Deep Work' ? ' path-block__start--deep' : ''}${timing ? ' path-block__start--live' : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!timing) onStart?.(block);
            }}
          >
            {timing ? liveClock : (block.blockType === 'Deep Work' ? 'Deep Work' : 'Start')}
          </button>
        ) : null}
        {block.status !== 'Done' ? <button type="button" onClick={() => onStatus(block, 'Done')}>Done</button> : null}
        {block.status !== 'Moved' ? <button type="button" onClick={() => onStatus(block, 'Moved')}>Moved</button> : null}
        {block.status !== 'Skipped' ? <button type="button" onClick={() => onStatus(block, 'Skipped')}>Skipped</button> : null}
        {block.status !== 'Planned' ? <button type="button" onClick={() => onStatus(block, 'Planned')}>Plan</button> : null}
      </div>
      {block.status === 'Done' ? (
        <label
          className="path-block__done-at"
          draggable={false}
          onMouseDown={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <span>Done</span>
          <input
            type="datetime-local"
            aria-label={`Ώρα ολοκλήρωσης · ${block.title}`}
            value={toDatetimeLocalValue(blockStatusAt(block))}
            onChange={(event) => onDoneAt?.(block, event.target.value)}
          />
        </label>
      ) : null}
    </article>
  );
}

export function PathWeek({ path, tasks = [], weekStart, onWeekStart, onCompleteLinkedTask, onWorkspaceChange }) {
  const [editor, setEditor] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [completePrompt, setCompletePrompt] = useState(null);
  const [overDate, setOverDate] = useState(null);
  const [overBlockId, setOverBlockId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const timer = useWorkTimer();
  const today = localTodayIsoDate();
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  useEffect(() => {
    path.ensureWeek(weekStart);
  }, [weekStart, path.ensureWeek]);

  useEffect(() => {
    if (workspaceId && !path.blocks.some((block) => block.id === workspaceId)) {
      setWorkspaceId(null);
    }
  }, [workspaceId, path.blocks]);

  useEffect(() => {
    onWorkspaceChange?.(Boolean(workspaceId));
    return () => onWorkspaceChange?.(false);
  }, [workspaceId, onWorkspaceChange]);

  const openNew = (date) => {
    setEditor(createEmptyBlock({
      title: '',
      date,
      status: 'Planned',
      blockType: 'Deep Work',
      duration: 60,
    }));
  };

  const saveEditor = () => {
    if (!editor?.title?.trim()) return;
    const saved = path.upsertBlock(editor);
    if (editor.status === 'Done' && editor.completeLinkedTask && saved.taskId) {
      onCompleteLinkedTask?.({
        taskId: saved.taskId,
        taskSource: saved.taskSource,
        taskTitle: saved.taskTitle,
      });
    }
    setEditor(null);
  };

  const requestStatus = (block, status) => {
    const at = status === 'Done' ? defaultBlockDoneAt(block) : undefined;
    if (status === 'Done' && block.taskId) {
      setCompletePrompt({ block, status, at });
      return;
    }
    path.setBlockStatus(block.id, status, { completeLinkedTask: false, at });
  };

  const confirmComplete = (completeLinkedTask) => {
    if (!completePrompt) return;
    const linked = path.setBlockStatus(completePrompt.block.id, completePrompt.status, {
      completeLinkedTask,
      at: completePrompt.at,
    });
    if (completeLinkedTask && linked) onCompleteLinkedTask?.(linked);
    setCompletePrompt(null);
  };

  const workspaceBlock = workspaceId
    ? path.blocks.find((block) => block.id === workspaceId) || null
    : null;

  const confirmDelete = () => {
    if (!pendingDelete) return;
    path.removeBlock(pendingDelete.id);
    if (workspaceId === pendingDelete.id) setWorkspaceId(null);
    if (editor?.id === pendingDelete.id) setEditor(null);
    setPendingDelete(null);
  };

  return (
    <div>
      {workspaceBlock ? (
        <PathBlockWorkspace
          block={workspaceBlock}
          goal={path.goals.find((goal) => goal.id === workspaceBlock.goalId) || null}
          tasks={tasks}
          saving={path.saving}
          onPatch={(patch) => {
            const current = path.blocks.find((item) => item.id === workspaceBlock.id) || workspaceBlock;
            path.upsertBlock({ ...current, ...patch });
          }}
          onEdit={setEditor}
          onDelete={setPendingDelete}
          onClose={() => setWorkspaceId(null)}
          onStatus={requestStatus}
          onDoneAt={(value) => {
            const at = fromDatetimeLocalValue(value);
            if (at) path.setBlockDoneAt(workspaceBlock.id, at);
          }}
        />
      ) : (
      <>
      <div className="path-week-nav">
        <div className="path-view__actions">
          <button type="button" className="btn" onClick={() => onWeekStart(shiftWeek(weekStart, -1))}>Prev</button>
          <button type="button" className="btn" onClick={() => onWeekStart(startOfWeekMonday())}>This week</button>
          <button type="button" className="btn" onClick={() => onWeekStart(shiftWeek(weekStart, 1))}>Next</button>
        </div>
        <h2>{formatWeekRange(weekStart)}</h2>
        <button type="button" className="btn btn--primary" onClick={() => setTemplateEditor(createEmptyTemplate({ title: '' }))}>
          Recurring block
        </button>
      </div>

      <div className="path-week" style={{ marginTop: 16 }}>
        {dates.map((date, index) => {
          const day = WEEKDAYS[index];
          const dayBlocks = blocksForDate(path.blocks, date);
          return (
            <section
              key={date}
              className={`path-day${date === today ? ' path-day--today' : ''}${date < today ? ' path-day--past' : ''}${overDate === date ? ' path-day--over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOverDate(date);
                setOverBlockId(null);
              }}
              onDragLeave={() => setOverDate((prev) => (prev === date ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                if (id) path.moveBlock(id, { date, beforeId: null });
                setOverDate(null);
                setOverBlockId(null);
              }}
            >
              <div className="path-day__head">
                <span>{day.short}</span>
                <span>{date.slice(8)}</span>
              </div>
              {dayBlocks.map((block, blockIndex) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  color={path.goals.find((goal) => goal.id === block.goalId)?.color}
                  isOver={overBlockId === block.id}
                  canMoveUp={blockIndex > 0}
                  canMoveDown={blockIndex < dayBlocks.length - 1}
                  timing={timer.session?.blockId === block.id}
                  liveClock={timer.session?.blockId === block.id ? formatClock(timer.elapsedMs) : null}
                  onOpen={(item) => setWorkspaceId(item.id)}
                  onStart={timer.startBlock}
                  onEdit={setEditor}
                  onDelete={setPendingDelete}
                  onStatus={requestStatus}
                  onDoneAt={(item, value) => {
                    const at = fromDatetimeLocalValue(value);
                    if (at) path.setBlockDoneAt(item.id, at);
                  }}
                  onNudge={path.nudgeBlock}
                  onDragOverBlock={() => {
                    setOverDate(date);
                    setOverBlockId(block.id);
                  }}
                  onDropOnBlock={(id, target) => {
                    path.moveBlock(id, { date: target.date, beforeId: target.id });
                    setOverDate(null);
                    setOverBlockId(null);
                  }}
                />
              ))}
              <button type="button" className="path-day__add" onClick={() => openNew(date)}>
                + Block
              </button>
            </section>
          );
        })}
      </div>

      {path.templates.length ? (
        <section className="path-panel" style={{ marginTop: 18 }}>
          <p className="path-card__meta">Weekly templates</p>
          <ul className="path-side-list">
            {path.templates.map((template) => {
              const templateGoal = path.goals.find((goal) => goal.id === template.goalId);
              return (
              <li key={template.id}>
                <button type="button" className="path-day__add" onClick={() => setTemplateEditor(template)}>
                  {templateGoal?.color ? <span className="path-color-dot" style={{ background: templateGoal.color }} /> : null}
                  {WEEKDAYS.find((day) => day.id === template.weekday)?.label} · {template.title}
                </button>
                {' '}
                <button type="button" className="path-day__add" onClick={() => path.removeTemplate(template.id)}>Remove</button>
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      </>
      )}

      <PathModal open={Boolean(editor)} title={editor && path.blocks.some((block) => block.id === editor.id) ? 'Edit block' : 'New block'} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <p className="path-empty" style={{ marginBottom: 12 }}>
              A block is a time commitment. Completing it does not complete a linked task unless you choose that.
            </p>
            <BlockFields
              block={editor}
              goals={path.goals.filter((goal) => goal.status !== 'Archived')}
              tasks={tasks}
              showCompleteTask={editor.status === 'Done'}
              onChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))}
            />
            <div className="path-modal__actions">
              {path.blocks.some((block) => block.id === editor.id) ? (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setPendingDelete(editor)}
                >
                  Delete
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={saveEditor} disabled={!editor.title?.trim()}>Save block</button>
            </div>
          </>
        ) : null}
      </PathModal>

      <PathModal open={Boolean(templateEditor)} title="Recurring weekly block" onClose={() => setTemplateEditor(null)}>
        {templateEditor ? (
          <>
            <TemplateFields
              template={templateEditor}
              goals={path.goals.filter((goal) => goal.status !== 'Archived')}
              onChange={(patch) => setTemplateEditor((prev) => ({ ...prev, ...patch }))}
            />
            <div className="path-modal__actions">
              <button type="button" className="btn" onClick={() => setTemplateEditor(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  path.upsertTemplate(templateEditor);
                  path.ensureWeek(weekStart);
                  setTemplateEditor(null);
                }}
                disabled={!templateEditor.title?.trim()}
              >
                Save template
              </button>
            </div>
          </>
        ) : null}
      </PathModal>

      <PathModal open={Boolean(completePrompt)} title="Complete block" onClose={() => setCompletePrompt(null)}>
        <p className="path-empty">
          Mark this block done. The linked task stays open unless you complete it here.
        </p>
        <p className="path-card__meta" style={{ marginTop: 10 }}>
          {completePrompt?.block?.taskTitle || 'Linked task'}
        </p>
        <label className="path-block__done-at" style={{ marginTop: 12 }}>
          <span>Done</span>
          <input
            type="datetime-local"
            aria-label="Ώρα ολοκλήρωσης"
            value={toDatetimeLocalValue(completePrompt?.at)}
            onChange={(event) => {
              const at = fromDatetimeLocalValue(event.target.value);
              if (!at) return;
              setCompletePrompt((prev) => (prev ? { ...prev, at } : prev));
            }}
          />
        </label>
        <div className="path-modal__actions">
          <button type="button" className="btn" onClick={() => confirmComplete(false)}>Done — keep task open</button>
          <button type="button" className="btn btn--primary" onClick={() => confirmComplete(true)}>Done + complete task</button>
        </div>
      </PathModal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Διαγραφή block"
        message={pendingDelete?.title ? `Να διαγραφεί το «${pendingDelete.title}»;` : 'Να διαγραφεί αυτό το block;'}
        confirmLabel="Διαγραφή"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
