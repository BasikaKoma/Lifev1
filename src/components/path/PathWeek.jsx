import { useEffect, useMemo, useState } from 'react';
import { localTodayIsoDate } from '../../utils/selfDateUtils';
import {
  createEmptyBlock,
  createEmptyTemplate,
  WEEKDAYS,
  shiftWeek,
  startOfWeekMonday,
  weekDates,
} from '../../lib/path/schema';
import { blocksForDate, formatDuration, formatWeekRange } from '../../lib/path/logic';
import { BlockFields, PathModal, TemplateFields } from './PathFields';

const STATUS_CLASS = {
  Done: 'path-pill--done',
  Moved: 'path-pill--moved',
  Skipped: 'path-pill--skipped',
};

function BlockCard({ block, onOpen, onStatus, onDragStart }) {
  return (
    <article
      className="path-block"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', block.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(block.id);
      }}
    >
      <button type="button" onClick={() => onOpen(block)} style={{ all: 'unset', cursor: 'pointer' }}>
        <div className="path-block__title">{block.title}</div>
        <div className="path-block__time">
          {[block.startTime, formatDuration(block.duration), block.blockType].filter(Boolean).join(' · ')}
        </div>
      </button>
      <div className="path-pills">
        <span className={`path-pill ${STATUS_CLASS[block.status] || ''}`}>{block.status}</span>
      </div>
      <div className="path-block__actions">
        {block.status !== 'Done' ? <button type="button" onClick={() => onStatus(block, 'Done')}>Done</button> : null}
        {block.status !== 'Moved' ? <button type="button" onClick={() => onStatus(block, 'Moved')}>Moved</button> : null}
        {block.status !== 'Skipped' ? <button type="button" onClick={() => onStatus(block, 'Skipped')}>Skipped</button> : null}
        {block.status !== 'Planned' ? <button type="button" onClick={() => onStatus(block, 'Planned')}>Plan</button> : null}
      </div>
    </article>
  );
}

export function PathWeek({ path, tasks = [], weekStart, onWeekStart, onCompleteLinkedTask }) {
  const [editor, setEditor] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [completePrompt, setCompletePrompt] = useState(null);
  const [overDate, setOverDate] = useState(null);
  const today = localTodayIsoDate();
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  useEffect(() => {
    path.ensureWeek(weekStart);
  }, [weekStart, path.ensureWeek]);

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
    if (status === 'Done' && block.taskId) {
      setCompletePrompt({ block, status });
      return;
    }
    path.setBlockStatus(block.id, status, { completeLinkedTask: false });
  };

  const confirmComplete = (completeLinkedTask) => {
    if (!completePrompt) return;
    const linked = path.setBlockStatus(completePrompt.block.id, completePrompt.status, { completeLinkedTask });
    if (completeLinkedTask && linked) onCompleteLinkedTask?.(linked);
    setCompletePrompt(null);
  };

  return (
    <div>
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
              className={`path-day${date === today ? ' path-day--today' : ''}${overDate === date ? ' path-day--over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOverDate(date);
              }}
              onDragLeave={() => setOverDate((prev) => (prev === date ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                if (id) path.moveBlock(id, { date });
                setOverDate(null);
              }}
            >
              <div className="path-day__head">
                <span>{day.short}</span>
                <span>{date.slice(8)}</span>
              </div>
              {dayBlocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  onOpen={setEditor}
                  onStatus={requestStatus}
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
            {path.templates.map((template) => (
              <li key={template.id}>
                <button type="button" className="path-day__add" onClick={() => setTemplateEditor(template)}>
                  {WEEKDAYS.find((day) => day.id === template.weekday)?.label} · {template.title}
                </button>
                {' '}
                <button type="button" className="path-day__add" onClick={() => path.removeTemplate(template.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                <button type="button" className="btn" onClick={() => { path.removeBlock(editor.id); setEditor(null); }}>
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
        <div className="path-modal__actions">
          <button type="button" className="btn" onClick={() => confirmComplete(false)}>Done — keep task open</button>
          <button type="button" className="btn btn--primary" onClick={() => confirmComplete(true)}>Done + complete task</button>
        </div>
      </PathModal>
    </div>
  );
}
