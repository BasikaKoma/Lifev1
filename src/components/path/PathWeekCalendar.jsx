import { useEffect, useMemo, useRef, useState } from 'react';
import {
  WEEKDAYS,
  blockAccentColor,
  blockKindLabel,
  goalColorStyle,
  isDeepWork,
  isReminder,
  sortBlockActions,
} from '../../lib/path/schema';
import {
  blockActionProgress,
  blockSpanMinutes,
  blockStatusAt,
  blocksForDate,
  formatBlockStatusStamp,
  formatBlockWindow,
  formatDuration,
  layoutDayTimeline,
  minutesToClock,
  plannedDayMinutes,
  timelineHourBounds,
  toDatetimeLocalValue,
} from '../../lib/path/logic';
import { createReminder, remindersForDate } from '../../lib/path/dayReminders';
import { formatClock } from '../../lib/workTimer';
import { PathDropGhost, grabOffsetWithin, hideDragImage } from './PathDropGhost';
import { PathDayReminders, PathReminderAdd, PathReminderItem, ReminderInput } from './PathReminders';
import { useGrowthReport, useTimelinePush } from './useTimelinePush';

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
const SNAP_MINUTES = 15;
const SLOT_MINUTES = 30;
const MIN_VISUAL_MINUTES = 30;

const STATUS_CLASS = {
  Done: 'path-pill--done',
  Moved: 'path-pill--moved',
  Skipped: 'path-pill--skipped',
};

// A finished block fills with its goal or life-area colour; one with neither fills slate.
const NO_GOAL_DONE_COLOR = '#cbd5e1';

function readNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function useNowMinutes() {
  const [minutes, setMinutes] = useState(readNowMinutes);
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(readNowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return minutes;
}

function BlockCard({
  block,
  color,
  variant = 'list',
  placement = null,
  isOver,
  dragging = false,
  canMoveUp,
  canMoveDown,
  timing = false,
  liveClock = null,
  liveMinutes = 0,
  onOpen,
  onEdit,
  onStart,
  onStatus,
  onDoneAt,
  onNudge,
  onDragStartBlock,
  onDragEndBlock,
  onDropOnBlock,
  onDragOverBlock,
  onDelete,
  onGrow,
}) {
  const dragMoved = useRef(false);
  const cardRef = useRef(null);
  const progress = blockActionProgress(block);
  const statusStamp = formatBlockStatusStamp(block);
  const timeline = variant === 'timeline';
  useGrowthReport(cardRef, timeline && placement ? placement.height : null, onGrow);
  const short = timeline && placement && placement.height < 40;
  const meta = [
    timing ? liveClock : null,
    formatBlockWindow(block.startTime, blockSpanMinutes(block, liveMinutes)),
    blockKindLabel(block),
  ].filter(Boolean).join(' · ');
  const reorderTarget = !timeline && onDropOnBlock;
  const tint = color || (block.status === 'Done' ? NO_GOAL_DONE_COLOR : null);
  const tasks = sortBlockActions(block.actions).filter((action) => String(action.text || '').trim());

  return (
    <article
      ref={cardRef}
      className={[
        'path-block',
        `path-block--${variant}`,
        `path-block--${String(block.status || 'Planned').toLowerCase()}`,
        tint ? 'path-block--goal' : '',
        short ? 'path-block--short' : '',
        isOver ? 'path-block--over' : '',
        dragging ? 'path-block--dragging' : '',
        timing ? 'path-block--timing' : '',
        timing && isDeepWork(block) ? 'path-block--timing-deep' : '',
      ].filter(Boolean).join(' ')}
      style={{
        ...goalColorStyle(tint),
        ...(placement ? {
          top: placement.top,
          '--path-block-h': `${placement.height}px`,
          ...(placement.anchorRight
            ? { right: placement.right, width: placement.width }
            : { left: placement.left, width: placement.width }),
          ...(placement.shift ? { transform: `translateY(${placement.shift}px)` } : null),
        } : null),
      }}
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
        hideDragImage(event);
        const rect = event.currentTarget.getBoundingClientRect();
        onDragStartBlock?.(block, timeline ? event.clientY - rect.top : 0);
      }}
      onDragEnd={() => {
        onDragEndBlock?.();
        window.setTimeout(() => {
          dragMoved.current = false;
        }, 0);
      }}
      onDragOver={reorderTarget ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDragOverBlock?.(block);
      } : undefined}
      onDrop={reorderTarget ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData('text/plain');
        if (id) onDropOnBlock(id, block);
      } : undefined}
    >
      <div className="path-block__summary">
        <div className="path-block__title">{block.title}</div>
        {meta ? <div className="path-block__time">{meta}</div> : null}
      </div>
      {/* What was written to do in the block; a card on the hour grid shows as many as its height fits. */}
      {tasks.length ? (
        <ul className="path-block__tasks" aria-label="Να γίνουν">
          {tasks.map((task) => (
            <li key={task.id} className={task.completed ? 'is-done' : undefined}>{task.text}</li>
          ))}
        </ul>
      ) : null}
      <div className="path-block__more">
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
              className={`path-block__start${isDeepWork(block) ? ' path-block__start--deep' : ''}${timing ? ' path-block__start--live' : ''}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (!timing) onStart?.(block);
              }}
            >
              {timing ? liveClock : (isDeepWork(block) ? 'Deep Work' : 'Start')}
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
          {onNudge ? (
            <>
              <button
                type="button"
                aria-label="Move up"
                disabled={!canMoveUp}
                onClick={(event) => {
                  event.stopPropagation();
                  onNudge(block.id, -1);
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
                  onNudge(block.id, 1);
                }}
              >
                ↓
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Shown on the hour that was clicked: a block or a reminder there. Picking the reminder
 * turns it into the field to type it in; Escape or a click elsewhere puts it away.
 */
function SlotChooser({ top, time, alignRight, onBlock, onAddReminder, onClose }) {
  const [typing, setTyping] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // While typing, the field itself saves on leaving and closes.
    if (typing) return undefined;
    const onDown = (event) => {
      if (!panelRef.current?.contains(event.target)) closeRef.current();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [typing]);

  return (
    <div
      ref={panelRef}
      className={`path-cal__pick${alignRight ? ' path-cal__pick--right' : ''}`}
      style={{ top }}
      role="group"
      aria-label={`Νέο στις ${time}`}
    >
      <span className="path-cal__pick-time">{time}</span>
      {typing ? (
        <ReminderInput placeholder="Τι να θυμηθείς;" onSave={onAddReminder} onClose={onClose} />
      ) : (
        <>
          <button type="button" autoFocus onClick={onBlock}>Block</button>
          <button type="button" onClick={() => setTyping(true)}>Υπενθύμιση</button>
        </>
      )}
    </div>
  );
}

/**
 * Desktop week: one column per day on a shared hour grid. Blocks and reminders with a clock
 * sit at their hour; those without one are listed above it.
 */
export function PathWeekCalendar({
  path,
  dates,
  today,
  timer,
  onOpenBlock,
  onEditBlock,
  onDeleteBlock,
  onStatus,
  onDoneAt,
  onNewBlock,
}) {
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [overUntimed, setOverUntimed] = useState(null);
  const [overBlockId, setOverBlockId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  // The hour that was clicked, while it asks what to put there.
  const [slotPick, setSlotPick] = useState(null);
  const nowMinutes = useNowMinutes();
  const push = useTimelinePush();
  const liveBlockId = timer.session?.blockId || null;
  const liveMinutes = liveBlockId ? Math.floor((timer.blockElapsedMs ?? timer.elapsedMs) / 60_000) : 0;

  const colorByGoal = useMemo(
    () => new Map(path.goals.map((goal) => [goal.id, goal.color])),
    [path.goals],
  );

  const days = useMemo(() => dates.map((date) => {
    const blocks = blocksForDate(path.blocks, date);
    const reminders = remindersForDate(path.blocks, date, today);
    // A reminder with a clock sits at its hour beside the blocks; without one it stays on top.
    const timeline = layoutDayTimeline([...blocks, ...reminders], {
      minMinutes: MIN_VISUAL_MINUTES,
      live: liveBlockId ? { blockId: liveBlockId, minutes: liveMinutes } : null,
    });
    const timedIds = new Set(timeline.map((item) => item.block.id));
    return {
      date,
      timeline,
      untimed: blocks.filter((block) => !timedIds.has(block.id)),
      reminders: reminders.filter((block) => !timedIds.has(block.id)),
      planned: plannedDayMinutes(blocks),
    };
  }), [dates, today, path.blocks, liveBlockId, liveMinutes]);

  const bounds = useMemo(
    () => timelineHourBounds(days.flatMap((day) => day.timeline)),
    [days],
  );
  const gridStart = bounds.startHour * 60;
  const gridEnd = bounds.endHour * 60;
  const gridHeight = (gridEnd - gridStart) * PX_PER_MIN;
  const hours = [];
  for (let hour = bounds.startHour; hour < bounds.endHour; hour += 1) hours.push(hour);
  const slots = [];
  for (let minute = gridStart; minute < gridEnd; minute += SLOT_MINUTES) slots.push(minute);

  const clearDrag = () => {
    dragRef.current = null;
    setPreview(null);
    setOverUntimed(null);
    setOverBlockId(null);
    setDraggingId(null);
  };

  /** A reminder dropped on a day: onto an hour it rings then, into the top row it has no clock. */
  const moveReminder = (item, date, startTime) => {
    path.upsertBlock({ ...item, date, startTime, weekday: undefined });
  };

  const dropUntimed = (id, date, beforeId = null) => {
    const item = path.blocks.find((block) => block.id === id);
    if (!item) return;
    if (isReminder(item)) moveReminder(item, date, null);
    else path.moveBlock(id, { date, startTime: null, beforeId });
  };

  const dropTimed = (id, date, startTime) => {
    const item = path.blocks.find((block) => block.id === id);
    if (!item) return;
    if (isReminder(item)) moveReminder(item, date, startTime);
    else path.moveBlock(id, { date, startTime });
  };

  const reminderDragProps = {
    draggable: true,
    onDelete: onDeleteBlock,
    onDragStartReminder: (item) => {
      dragRef.current = { id: item.id, offsetY: 0, minutes: MIN_VISUAL_MINUTES, span: null, title: item.title };
      window.requestAnimationFrame(() => {
        if (dragRef.current?.id === item.id) setDraggingId(item.id);
      });
    },
    onDragEndReminder: clearDrag,
  };

  const dropMinutes = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = dragRef.current?.offsetY || 0;
    const raw = gridStart + (event.clientY - rect.top - offset) / PX_PER_MIN;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(gridStart, Math.min(gridEnd - SNAP_MINUTES, snapped));
  };

  const cellClass = (base, date) => [
    base,
    date === today ? `${base}--today` : '',
    date < today ? 'path-cal__cell--past' : '',
  ].filter(Boolean).join(' ');

  const cardProps = (block) => ({
    block,
    color: blockAccentColor(block, colorByGoal.get(block.goalId)),
    timing: timer.session?.blockId === block.id,
    liveClock: timer.session?.blockId === block.id ? formatClock(timer.elapsedMs) : null,
    liveMinutes: liveBlockId === block.id ? liveMinutes : 0,
    dragging: draggingId === block.id,
    onOpen: onOpenBlock,
    onStart: timer.startBlock,
    onEdit: onEditBlock,
    onDelete: onDeleteBlock,
    onStatus,
    onDoneAt,
    onDragStartBlock: (item, offsetY) => {
      const span = blockSpanMinutes(item, liveBlockId === item.id ? liveMinutes : 0);
      const minutes = span || MIN_VISUAL_MINUTES;
      dragRef.current = {
        id: item.id,
        offsetY: grabOffsetWithin(offsetY, Math.max(MIN_VISUAL_MINUTES, minutes) * PX_PER_MIN),
        minutes,
        span,
        title: item.title,
      };
      // After the drag has started: changing the card inside dragstart can cancel the drag.
      window.requestAnimationFrame(() => {
        if (dragRef.current?.id === item.id) setDraggingId(item.id);
      });
    },
    onDragEndBlock: clearDrag,
  });

  return (
    <div className="path-cal-scroll">
      <div className="path-cal" style={{ '--path-hour-px': `${HOUR_PX}px` }}>
        <div className="path-cal__gutter path-cal__gutter--head" />
        {days.map((day, index) => (
          <div key={`head-${day.date}`} className={cellClass('path-cal__head', day.date)}>
            <span>{WEEKDAYS[index].short}</span>
            {day.planned ? <span className="path-cal__planned">{formatDuration(day.planned)}</span> : null}
            <span className="path-cal__date">{day.date.slice(8)}</span>
          </div>
        ))}

        <div className="path-cal__gutter path-cal__gutter--untimed">Χωρίς ώρα</div>
        {days.map((day) => (
          <section
            key={`untimed-${day.date}`}
            className={`${cellClass('path-cal__untimed', day.date)}${overUntimed === day.date ? ' path-cal__untimed--over' : ''}`}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverUntimed(day.date);
              setOverBlockId(null);
              setPreview(null);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setOverUntimed((prev) => (prev === day.date ? null : prev));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || dragRef.current?.id;
              if (id) dropUntimed(id, day.date);
              clearDrag();
            }}
          >
            <PathDayReminders
              path={path}
              reminders={day.reminders}
              today={today}
              draggingId={draggingId}
              {...reminderDragProps}
            />
            {day.untimed.map((block, blockIndex) => (
              <BlockCard
                key={block.id}
                {...cardProps(block)}
                variant="list"
                isOver={overBlockId === block.id}
                canMoveUp={blockIndex > 0}
                canMoveDown={blockIndex < day.untimed.length - 1}
                onNudge={path.nudgeBlock}
                onDragOverBlock={() => {
                  setOverUntimed(day.date);
                  setOverBlockId(block.id);
                  setPreview(null);
                }}
                onDropOnBlock={(id, target) => {
                  dropUntimed(id, target.date, target.id);
                  clearDrag();
                }}
              />
            ))}
            <div className="path-cal__adds">
              <button type="button" className="path-day__add" onClick={() => onNewBlock(day.date)}>
                + Block
              </button>
              {/* Not on days gone by: an open reminder there would show on today at once. */}
              {day.date >= today ? <PathReminderAdd path={path} date={day.date} /> : null}
            </div>
          </section>
        ))}

        <div className="path-cal__gutter path-cal__gutter--hours" style={{ height: gridHeight }}>
          {hours.map((hour) => (
            <span
              key={hour}
              className="path-cal__hour"
              style={{ top: (hour * 60 - gridStart) * PX_PER_MIN }}
            >
              {minutesToClock(hour * 60)}
            </span>
          ))}
        </div>
        {days.map((day, dayIndex) => (
          <section
            key={`grid-${day.date}`}
            className={cellClass('path-cal__col', day.date)}
            style={{ height: gridHeight }}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              const start = dropMinutes(event);
              const { minutes, span, title } = dragRef.current;
              setPreview((prev) => (
                prev && prev.date === day.date && prev.start === start
                  ? prev
                  : { date: day.date, start, minutes, span, title }
              ));
              setOverUntimed(null);
              setOverBlockId(null);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setPreview((prev) => (prev?.date === day.date ? null : prev));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || dragRef.current?.id;
              if (id) dropTimed(id, day.date, minutesToClock(dropMinutes(event)));
              clearDrag();
            }}
          >
            {slots.map((minute) => (
              <div
                key={minute}
                className="path-cal__slot"
                data-time={minutesToClock(minute)}
                style={{ top: (minute - gridStart) * PX_PER_MIN, height: SLOT_MINUTES * PX_PER_MIN }}
                aria-hidden="true"
                onClick={() => {
                  // A day gone by only takes blocks: an open reminder there would show on today at once.
                  if (day.date < today) onNewBlock(day.date, minutesToClock(minute));
                  else setSlotPick({ date: day.date, minute });
                }}
              />
            ))}

            {day.timeline.map((item) => {
              const lanePct = 100 / item.lanes;
              const anchorRight = (item.lanes > 1 && item.lane === item.lanes - 1) || dayIndex === WEEKDAYS.length - 1;
              const placement = {
                top: (item.start - gridStart) * PX_PER_MIN,
                height: Math.max(2, (item.visualEnd - item.start) * PX_PER_MIN - 2),
                left: `calc(${item.lane * lanePct}% + 3px)`,
                right: `calc(${(item.lanes - 1 - item.lane) * lanePct}% + 3px)`,
                width: `calc(${lanePct}% - 6px)`,
                anchorRight,
                shift: push.shiftFor(day.date, item),
              };
              if (isReminder(item.block)) {
                return (
                  <PathReminderItem
                    key={item.block.id}
                    as="div"
                    className="path-rem--grid"
                    style={{
                      top: placement.top,
                      minHeight: placement.height,
                      width: placement.width,
                      ...(anchorRight ? { right: placement.right } : { left: placement.left }),
                      ...(placement.shift ? { transform: `translateY(${placement.shift}px)` } : null),
                    }}
                    path={path}
                    block={item.block}
                    today={today}
                    dragging={draggingId === item.block.id}
                    {...reminderDragProps}
                  />
                );
              }
              return (
                <BlockCard
                  key={item.block.id}
                  {...cardProps(item.block)}
                  variant="timeline"
                  placement={placement}
                  onGrow={(extra) => push.report(item.block.id, day.date, item.visualEnd, extra)}
                />
              );
            })}

            {slotPick?.date === day.date ? (
              <SlotChooser
                key={slotPick.minute}
                top={(slotPick.minute - gridStart) * PX_PER_MIN}
                time={minutesToClock(slotPick.minute)}
                alignRight={dayIndex >= WEEKDAYS.length - 2}
                onBlock={() => {
                  setSlotPick(null);
                  onNewBlock(day.date, minutesToClock(slotPick.minute));
                }}
                onAddReminder={(text) => {
                  const reminder = createReminder(day.date, text, minutesToClock(slotPick.minute));
                  if (reminder) path.upsertBlock(reminder);
                }}
                onClose={() => setSlotPick(null)}
              />
            ) : null}

            {preview?.date === day.date ? (
              <PathDropGhost
                top={(preview.start - gridStart) * PX_PER_MIN}
                height={Math.max(MIN_VISUAL_MINUTES, preview.minutes) * PX_PER_MIN - 2}
                start={preview.start}
                span={preview.span}
                title={preview.title}
              />
            ) : null}

            {day.date === today && nowMinutes >= gridStart && nowMinutes <= gridEnd ? (
              <div className="path-cal__now" style={{ top: (nowMinutes - gridStart) * PX_PER_MIN }} />
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
