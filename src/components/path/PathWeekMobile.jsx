import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeGoalColor, shiftWeek, startOfWeekMonday } from '../../lib/path/schema';
import {
  blockActionProgress,
  blocksForDate,
  blockStatusAt,
  formatBlockStatusStamp,
  formatBlockWindow,
  formatDuration,
  toDatetimeLocalValue,
} from '../../lib/path/logic';
import { formatClock } from '../../lib/workTimer';

const DAY_SHORT = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];
const DAY_LONG = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
const STATUSES = ['Done', 'Moved', 'Skipped', 'Planned'];
const SWIPE_MIN_PX = 60;

// Fallback stripe colours when a block has no goal colour.
const TYPE_COLORS = {
  'Deep Work': '#f5c16c',
  Workout: '#fb923c',
  Operations: '#34d399',
  Growth: '#34d399',
  Meditation: '#a78bfa',
};

function parseIso(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function monthShort(date) {
  return new Intl.DateTimeFormat('el-GR', { month: 'short' }).format(parseIso(date)).replace('.', '');
}

function formatRangeEl(dates) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const year = parseIso(last).getFullYear();
  const startDay = Number(first.slice(8));
  const endDay = Number(last.slice(8));
  if (first.slice(0, 7) === last.slice(0, 7)) return `${startDay}–${endDay} ${monthShort(last)} ${year}`;
  return `${startDay} ${monthShort(first)} – ${endDay} ${monthShort(last)} ${year}`;
}

function blockStripe(block, goals) {
  const goal = goals.find((item) => item.id === block.goalId);
  return normalizeGoalColor(goal?.color) || TYPE_COLORS[block.blockType] || 'rgba(148, 163, 184, 0.6)';
}

function Icon({ name }) {
  const paths = {
    play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    skip: <><path d="M6 6l8 6-8 6z" /><path d="M18 6v12" /></>,
    moved: <><path d="M5 12h12" /><path d="M13 7l5 5-5 5" /></>,
    left: <path d="M15 5l-7 7 7 7" />,
    right: <path d="M9 5l7 7-7 7" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    open: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
    up: <path d="M12 19V5M6 11l6-6 6 6" />,
    down: <path d="M12 5v14M6 13l6 6 6-6" />,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function BlockActionSheet({
  block,
  dates,
  dayBlocks,
  timing,
  liveClock,
  onClose,
  onStart,
  onStatus,
  onDoneAt,
  onMoveToDate,
  onNudge,
  onOpen,
  onEdit,
  onDelete,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const index = dayBlocks.findIndex((item) => item.id === block.id);
  const dayIndex = dates.indexOf(block.date);
  const canStart = !timing && block.status !== 'Done' && block.status !== 'Skipped';
  const meta = [
    formatBlockWindow(block.startTime, block.duration),
    block.blockType,
    dayIndex >= 0 ? `${DAY_LONG[dayIndex]} ${Number(block.date.slice(8))}` : null,
  ].filter(Boolean).join(' · ');

  // Run the action, then let the sheet go so the next surface (editor, confirm, block page) is on top.
  const thenClose = (action) => () => {
    onClose();
    action();
  };

  return createPortal(
    <div className="path-msheet" role="presentation" onClick={onClose}>
      <div
        className="path-msheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={block.title}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="path-msheet__handle" aria-hidden="true" />
        <h3 className="path-msheet__title">{block.title}</h3>
        <p className="path-msheet__meta">{meta}</p>

        {timing ? (
          <p className="path-msheet__live">Σε εξέλιξη · {liveClock}</p>
        ) : canStart ? (
          <button type="button" className="path-msheet__primary" onClick={thenClose(() => onStart(block))}>
            <Icon name="play" />
            {block.blockType === 'Deep Work' ? 'Ξεκίνα deep work' : 'Ξεκίνα'}
          </button>
        ) : null}

        <div className="path-msheet__label">Κατάσταση</div>
        <div className="path-msheet__segmented" role="group" aria-label="Κατάσταση">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={block.status === status}
              className={block.status === status ? 'is-active' : ''}
              onClick={() => {
                if (block.status !== status) onStatus(block, status);
              }}
            >
              {status}
            </button>
          ))}
        </div>

        {block.status === 'Done' ? (
          <label className="path-msheet__done-at">
            <span>Ώρα ολοκλήρωσης</span>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(blockStatusAt(block))}
              onChange={(event) => onDoneAt(block, event.target.value)}
            />
          </label>
        ) : null}

        <div className="path-msheet__label">Μετακίνηση σε</div>
        <div className="path-msheet__days">
          {dates.map((date, i) => (
            <button
              key={date}
              type="button"
              className={date === block.date ? 'is-active' : ''}
              aria-pressed={date === block.date}
              onClick={() => {
                if (date !== block.date) onMoveToDate(block, date);
              }}
            >
              <span>{DAY_SHORT[i]}</span>
              <b>{Number(date.slice(8))}</b>
            </button>
          ))}
        </div>

        <div className="path-msheet__list">
          <button type="button" onClick={thenClose(() => onOpen(block))}>
            <Icon name="open" />
            Άνοιγμα block
          </button>
          <button type="button" onClick={thenClose(() => onEdit(block))}>
            <Icon name="edit" />
            Επεξεργασία
          </button>
          <div className="path-msheet__pair">
            <button type="button" disabled={index <= 0} onClick={() => onNudge(block.id, -1)}>
              <Icon name="up" />
              Πάνω
            </button>
            <button type="button" disabled={index < 0 || index >= dayBlocks.length - 1} onClick={() => onNudge(block.id, 1)}>
              <Icon name="down" />
              Κάτω
            </button>
          </div>
          <button type="button" className="path-msheet__danger" onClick={thenClose(() => onDelete(block))}>
            <Icon name="trash" />
            Διαγραφή
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Phone layout for the Path week: one day at a time behind a 7-day strip, each block as a
 * single row with one primary action, and everything else in a bottom sheet.
 */
export function PathWeekMobile({
  path,
  dates,
  today,
  weekStart,
  timer,
  onWeekStart,
  onStatus,
  onDoneAt,
  onOpenBlock,
  onEditBlock,
  onDeleteBlock,
  onNewBlock,
}) {
  const [selectedDate, setSelectedDate] = useState(() => (dates.includes(today) ? today : dates[0]));
  const [sheetBlockId, setSheetBlockId] = useState(null);
  const touchStart = useRef(null);

  // A new week keeps an explicitly chosen day, otherwise lands on today or Monday.
  useEffect(() => {
    setSelectedDate((current) => {
      if (dates.includes(current)) return current;
      return dates.includes(today) ? today : dates[0];
    });
  }, [dates, today]);

  const blocksByDate = useMemo(
    () => Object.fromEntries(dates.map((date) => [date, blocksForDate(path.blocks, date)])),
    [dates, path.blocks]
  );

  const weekBlocks = dates.flatMap((date) => blocksByDate[date]);
  const doneCount = weekBlocks.filter((block) => block.status === 'Done').length;
  const trackedMinutes = weekBlocks.reduce((sum, block) => sum + (Number(block.workedMinutes) || 0), 0);
  const dayBlocks = blocksByDate[selectedDate] || [];
  const selectedIndex = dates.indexOf(selectedDate);
  const sheetBlock = sheetBlockId ? path.blocks.find((block) => block.id === sheetBlockId) || null : null;
  const isCurrentWeek = weekStart === startOfWeekMonday();

  const goToDay = (offset) => {
    const target = parseIso(selectedDate);
    target.setDate(target.getDate() + offset);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    setSelectedDate(iso);
    if (!dates.includes(iso)) onWeekStart(shiftWeek(weekStart, offset > 0 ? 1 : -1));
  };

  const goToToday = () => {
    setSelectedDate(today);
    if (!isCurrentWeek) onWeekStart(startOfWeekMonday());
  };

  const onTouchStart = (event) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goToDay(dx < 0 ? 1 : -1);
  };

  return (
    <div className="path-mweek">
      <header className="path-mweek__head">
        <button type="button" className="path-mweek__arrow" aria-label="Προηγούμενη εβδομάδα" onClick={() => onWeekStart(shiftWeek(weekStart, -1))}>
          <Icon name="left" />
        </button>
        <div className="path-mweek__range">
          <h2>{formatRangeEl(dates)}</h2>
          <p>
            {doneCount}/{weekBlocks.length} έγιναν
            {trackedMinutes ? ` · ${formatDuration(trackedMinutes)}` : ''}
          </p>
        </div>
        <button type="button" className="path-mweek__arrow" aria-label="Επόμενη εβδομάδα" onClick={() => onWeekStart(shiftWeek(weekStart, 1))}>
          <Icon name="right" />
        </button>
      </header>

      <div className="path-mweek__strip" role="tablist" aria-label="Μέρες εβδομάδας">
        {dates.map((date, index) => {
          const blocks = blocksByDate[date];
          const selected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${DAY_LONG[index]} ${Number(date.slice(8))}, ${blocks.length} blocks`}
              className={`path-mweek__day${selected ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${date < today ? ' is-past' : ''}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="path-mweek__dow">{DAY_SHORT[index]}</span>
              <span className="path-mweek__num">{Number(date.slice(8))}</span>
              <span className="path-mweek__dots" aria-hidden="true">
                {blocks.slice(0, 5).map((block) => (
                  <i
                    key={block.id}
                    className={block.status === 'Done' ? 'is-done' : block.status === 'Skipped' ? 'is-skipped' : ''}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="path-mweek__dayhead">
        <h3>
          {DAY_LONG[selectedIndex]} {Number(selectedDate.slice(8))} {monthShort(selectedDate)}
        </h3>
        {selectedDate !== today ? (
          <button type="button" className="path-mweek__today" onClick={goToToday}>Σήμερα</button>
        ) : (
          <span className="path-mweek__today-tag">Σήμερα</span>
        )}
      </div>

      <div className="path-mweek__list" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {dayBlocks.length ? dayBlocks.map((block) => {
          const timing = timer.session?.blockId === block.id;
          const progress = blockActionProgress(block);
          const stamp = formatBlockStatusStamp(block);
          const sub = [
            formatBlockWindow(block.startTime, block.duration),
            block.blockType,
            block.workedMinutes ? formatDuration(block.workedMinutes) : null,
            progress ? `${progress.done}/${progress.total}` : null,
          ].filter(Boolean).join(' · ');
          const status = block.status === 'Planned' ? null : `${block.status}${stamp ? ` · ${stamp}` : ''}`;
          const canStart = block.status !== 'Done' && block.status !== 'Skipped';
          return (
            <div
              key={block.id}
              role="button"
              tabIndex={0}
              className={`path-mrow path-mrow--${block.status.toLowerCase()}${timing ? ' path-mrow--timing' : ''}`}
              style={{ '--path-mrow-stripe': blockStripe(block, path.goals) }}
              onClick={() => setSheetBlockId(block.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSheetBlockId(block.id);
              }}
            >
              <span className="path-mrow__time">
                {block.startTime || '—'}
              </span>
              <span className="path-mrow__stripe" aria-hidden="true" />
              <span className="path-mrow__body">
                <span className="path-mrow__title">{block.title}</span>
                {sub ? <span className="path-mrow__sub">{sub}</span> : null}
                {status ? <span className={`path-mrow__status path-mrow__status--${block.status.toLowerCase()}`}>{status}</span> : null}
              </span>
              {timing ? (
                <span className="path-mrow__clock">{formatClock(timer.elapsedMs)}</span>
              ) : canStart ? (
                <button
                  type="button"
                  className="path-mrow__action"
                  aria-label={`Ξεκίνα ${block.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    timer.startBlock(block);
                  }}
                >
                  <Icon name="play" />
                </button>
              ) : (
                <span className={`path-mrow__action path-mrow__action--${block.status.toLowerCase()}`} aria-hidden="true">
                  <Icon name={block.status === 'Done' ? 'check' : 'skip'} />
                </span>
              )}
            </div>
          );
        }) : (
          <p className="path-mweek__empty">Τίποτα προγραμματισμένο αυτή τη μέρα.</p>
        )}
      </div>

      <div className="path-mweek__add">
        <button type="button" className="btn" onClick={() => onNewBlock(selectedDate)}>
          <Icon name="plus" />
          Block
        </button>
      </div>

      {sheetBlock ? (
        <BlockActionSheet
          block={sheetBlock}
          dates={dates}
          dayBlocks={blocksByDate[sheetBlock.date] || blocksForDate(path.blocks, sheetBlock.date)}
          timing={timer.session?.blockId === sheetBlock.id}
          liveClock={timer.session?.blockId === sheetBlock.id ? formatClock(timer.elapsedMs) : null}
          onClose={() => setSheetBlockId(null)}
          onStart={timer.startBlock}
          onStatus={onStatus}
          onDoneAt={onDoneAt}
          onMoveToDate={(block, date) => {
            path.moveBlock(block.id, { date, beforeId: null });
            setSelectedDate(date);
          }}
          onNudge={path.nudgeBlock}
          onOpen={onOpenBlock}
          onEdit={onEditBlock}
          onDelete={onDeleteBlock}
        />
      ) : null}
    </div>
  );
}
