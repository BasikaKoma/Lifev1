import { useEffect, useMemo, useRef, useState } from 'react';
import { WEEKDAYS, goalColorStyle } from '../../lib/path/schema';
import {
  blockActionProgress,
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
import { formatClock } from '../../lib/workTimer';
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
    formatBlockWindow(block.startTime, block.duration),
    block.blockType,
  ].filter(Boolean).join(' · ');
  const reorderTarget = !timeline && onDropOnBlock;

  return (
    <article
      ref={cardRef}
      className={[
        'path-block',
        `path-block--${variant}`,
        `path-block--${String(block.status || 'Planned').toLowerCase()}`,
        color ? 'path-block--goal' : '',
        short ? 'path-block--short' : '',
        isOver ? 'path-block--over' : '',
        timing ? 'path-block--timing' : '',
        timing && block.blockType === 'Deep Work' ? 'path-block--timing-deep' : '',
      ].filter(Boolean).join(' ')}
      style={{
        ...goalColorStyle(color),
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

/** Desktop week: one column per day on a shared hour grid, untimed blocks above it. */
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
  const nowMinutes = useNowMinutes();
  const push = useTimelinePush();

  const colorByGoal = useMemo(
    () => new Map(path.goals.map((goal) => [goal.id, goal.color])),
    [path.goals],
  );

  const days = useMemo(() => dates.map((date) => {
    const blocks = blocksForDate(path.blocks, date);
    const timeline = layoutDayTimeline(blocks, { minMinutes: MIN_VISUAL_MINUTES });
    const timedIds = new Set(timeline.map((item) => item.block.id));
    return {
      date,
      timeline,
      untimed: blocks.filter((block) => !timedIds.has(block.id)),
      planned: plannedDayMinutes(blocks),
    };
  }), [dates, path.blocks]);

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
    color: colorByGoal.get(block.goalId),
    timing: timer.session?.blockId === block.id,
    liveClock: timer.session?.blockId === block.id ? formatClock(timer.elapsedMs) : null,
    onOpen: onOpenBlock,
    onStart: timer.startBlock,
    onEdit: onEditBlock,
    onDelete: onDeleteBlock,
    onStatus,
    onDoneAt,
    onDragStartBlock: (item, offsetY) => {
      const duration = Number(item.duration) > 0 ? Number(item.duration) : MIN_VISUAL_MINUTES;
      dragRef.current = { id: item.id, offsetY, minutes: duration };
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
              if (id) path.moveBlock(id, { date: day.date, startTime: null, beforeId: null });
              clearDrag();
            }}
          >
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
                  path.moveBlock(id, { date: target.date, startTime: null, beforeId: target.id });
                  clearDrag();
                }}
              />
            ))}
            <button type="button" className="path-day__add" onClick={() => onNewBlock(day.date)}>
              + Block
            </button>
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
              const minutes = dragRef.current.minutes;
              setPreview((prev) => (
                prev && prev.date === day.date && prev.start === start
                  ? prev
                  : { date: day.date, start, minutes }
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
              if (id) path.moveBlock(id, { date: day.date, startTime: minutesToClock(dropMinutes(event)) });
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
                onClick={() => onNewBlock(day.date, minutesToClock(minute))}
              />
            ))}

            {day.timeline.map((item) => {
              const lanePct = 100 / item.lanes;
              const anchorRight = (item.lanes > 1 && item.lane === item.lanes - 1) || dayIndex === WEEKDAYS.length - 1;
              return (
                <BlockCard
                  key={item.block.id}
                  {...cardProps(item.block)}
                  variant="timeline"
                  placement={{
                    top: (item.start - gridStart) * PX_PER_MIN,
                    height: Math.max(2, (item.visualEnd - item.start) * PX_PER_MIN - 2),
                    left: `calc(${item.lane * lanePct}% + 3px)`,
                    right: `calc(${(item.lanes - 1 - item.lane) * lanePct}% + 3px)`,
                    width: `calc(${lanePct}% - 6px)`,
                    anchorRight,
                    shift: push.shiftFor(day.date, item),
                  }}
                  onGrow={(extra) => push.report(item.block.id, day.date, item.visualEnd, extra)}
                />
              );
            })}

            {preview?.date === day.date ? (
              <div
                className="path-cal__ghost"
                style={{
                  top: (preview.start - gridStart) * PX_PER_MIN,
                  height: Math.max(MIN_VISUAL_MINUTES, preview.minutes) * PX_PER_MIN - 2,
                }}
              >
                {formatBlockWindow(minutesToClock(preview.start), preview.minutes)}
              </div>
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
