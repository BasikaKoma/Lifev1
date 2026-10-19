import { useEffect, useMemo, useState } from 'react';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import {
  createEmptyBlock,
  shiftWeek,
  startOfWeekMonday,
  weekDates,
} from '../../lib/path/schema';
import { defaultBlockDoneAt, formatWeekRange, fromDatetimeLocalValue, toDatetimeLocalValue } from '../../lib/path/logic';
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { ConfirmDialog } from '../ConfirmDialog';
import { BlockFields, PathModal } from './PathFields';
import { PathBlockWorkspace } from './PathBlockWorkspace';
import { PathWeekCalendar } from './PathWeekCalendar';
import { PathWeekMobile } from './PathWeekMobile';
import { platform } from '../../platform';

export function PathWeek({ path, tasks = [], weekStart, onWeekStart, onCompleteLinkedTask, onWorkspaceChange }) {
  const [editor, setEditor] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [completePrompt, setCompletePrompt] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const timer = useWorkTimer();
  const today = localTodayIsoDate();
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  useEffect(() => {
    path.ensureWeek(weekStart);
  }, [weekStart, path.ensureWeek, path.templates]);

  useEffect(() => {
    if (workspaceId && !path.blocks.some((block) => block.id === workspaceId)) {
      setWorkspaceId(null);
    }
  }, [workspaceId, path.blocks]);

  useEffect(() => {
    onWorkspaceChange?.(Boolean(workspaceId));
    return () => onWorkspaceChange?.(false);
  }, [workspaceId, onWorkspaceChange]);

  const openNew = (date, startTime = null) => {
    setEditor(createEmptyBlock({
      title: '',
      date,
      startTime,
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
      ) : platform.isMobile ? (
        <PathWeekMobile
          path={path}
          dates={dates}
          today={today}
          weekStart={weekStart}
          timer={timer}
          onWeekStart={onWeekStart}
          onStatus={requestStatus}
          onDoneAt={(item, value) => {
            const at = fromDatetimeLocalValue(value);
            if (at) path.setBlockDoneAt(item.id, at);
          }}
          onOpenBlock={(item) => setWorkspaceId(item.id)}
          onEditBlock={setEditor}
          onDeleteBlock={setPendingDelete}
          onNewBlock={openNew}
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
      </div>

      <div style={{ marginTop: 16 }}>
        <PathWeekCalendar
          path={path}
          dates={dates}
          today={today}
          timer={timer}
          onOpenBlock={(item) => setWorkspaceId(item.id)}
          onEditBlock={setEditor}
          onDeleteBlock={setPendingDelete}
          onStatus={requestStatus}
          onDoneAt={(item, value) => {
            const at = fromDatetimeLocalValue(value);
            if (at) path.setBlockDoneAt(item.id, at);
          }}
          onNewBlock={openNew}
        />
      </div>
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
        message={[
          pendingDelete?.title ? `Να διαγραφεί το «${pendingDelete.title}»;` : 'Να διαγραφεί αυτό το block;',
          pendingDelete?.templateId && path.templates.some((template) => template.id === pendingDelete.templateId)
            ? 'Σβήνεται μόνο αυτή η εβδομάδα· το template συνεχίζει τις επόμενες.'
            : null,
        ].filter(Boolean).join(' ')}
        confirmLabel="Διαγραφή"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
