import { useMemo, useRef, useState } from 'react';
import { WEEKDAYS, goalColorStyle, normalizeGoalColor } from '../../lib/path/schema';
import {
  formatBlockWindow,
  formatDuration,
  layoutDayTimeline,
  minutesToClock,
  plannedDayMinutes,
  timelineHourBounds,
} from '../../lib/path/logic';
import { platform } from '../../platform';
import { useGrowthReport, useTimelinePush } from './useTimelinePush';

const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
const SNAP_MINUTES = 15;
const SLOT_MINUTES = 30;
const MIN_VISUAL_MINUTES = 30;
const DAY_SHORT = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];
const DAY_LONG = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];

function byStartTime(a, b) {
  return String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'))
    || String(a.title).localeCompare(String(b.title));
}

function useTemplateDays(templates) {
  return useMemo(() => WEEKDAYS.map((weekday) => {
    const list = templates.filter((template) => template.weekday === weekday.id).sort(byStartTime);
    const timeline = layoutDayTimeline(list, { minMinutes: MIN_VISUAL_MINUTES });
    const timedIds = new Set(timeline.map((item) => item.block.id));
    return {
      weekday: weekday.id,
      list,
      timeline,
      untimed: list.filter((template) => !timedIds.has(template.id)),
      planned: plannedDayMinutes(list.filter((template) => template.enabled)),
    };
  }), [templates]);
}

function TemplateCard({ template, goal, variant, placement = null, onOpen, onDragStart, onDragEnd, onGrow }) {
  const dragMoved = useRef(false);
  const cardRef = useRef(null);
  const timeline = variant === 'timeline';
  useGrowthReport(cardRef, timeline && placement ? placement.height : null, onGrow);
  const short = timeline && placement && placement.height < 40;
  const meta = [formatBlockWindow(template.startTime, template.duration), template.blockType].filter(Boolean).join(' · ');

  return (
    <article
      ref={cardRef}
      className={[
        'path-block',
        `path-block--${variant}`,
        'path-block--planned',
        goal?.color ? 'path-block--goal' : '',
        short ? 'path-block--short' : '',
        template.enabled ? '' : 'path-block--skipped',
      ].filter(Boolean).join(' ')}
      style={{
        ...goalColorStyle(goal?.color),
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
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(template);
      }}
      onClick={() => {
        if (!dragMoved.current) onOpen(template);
      }}
      onDragStart={(event) => {
        dragMoved.current = true;
        event.dataTransfer.setData('text/plain', template.id);
        event.dataTransfer.effectAllowed = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        onDragStart(template, timeline ? event.clientY - rect.top : 0);
      }}
      onDragEnd={() => {
        onDragEnd();
        window.setTimeout(() => {
          dragMoved.current = false;
        }, 0);
      }}
    >
      <div className="path-block__summary">
        <div className="path-block__title">{template.title}</div>
        {meta ? <div className="path-block__time">{meta}</div> : null}
      </div>
      {goal?.title || template.minimumAction ? (
        <div className="path-block__more">
          {template.minimumAction ? <p className="path-block__outcome">{template.minimumAction}</p> : null}
          {goal?.title ? <div className="path-pills"><span className="path-pill">{goal.title}</span></div> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Desktop: the template week on the same hour grid as the real week, one column per weekday. */
function TemplateWeekGrid({ days, goalsById, onOpen, onNew, onMove }) {
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [overUntimed, setOverUntimed] = useState(null);
  const push = useTimelinePush();

  const bounds = useMemo(() => timelineHourBounds(days.flatMap((day) => day.timeline)), [days]);
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
  };

  const dropMinutes = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = gridStart + (event.clientY - rect.top - (dragRef.current?.offsetY || 0)) / PX_PER_MIN;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(gridStart, Math.min(gridEnd - SNAP_MINUTES, snapped));
  };

  const cardProps = (template) => ({
    template,
    goal: goalsById.get(template.goalId) || null,
    onOpen,
    onDragStart: (item, offsetY) => {
      dragRef.current = { id: item.id, offsetY, minutes: Number(item.duration) > 0 ? Number(item.duration) : MIN_VISUAL_MINUTES };
    },
    onDragEnd: clearDrag,
  });

  return (
    <div className="path-cal-scroll">
      <div className="path-cal path-cal--template" style={{ '--path-hour-px': `${HOUR_PX}px` }}>
        <div className="path-cal__gutter path-cal__gutter--head" />
        {days.map((day, index) => (
          <div key={`head-${day.weekday}`} className="path-cal__head">
            <span>{WEEKDAYS[index].short}</span>
            {day.planned ? <span className="path-cal__planned">{formatDuration(day.planned)}</span> : null}
          </div>
        ))}

        <div className="path-cal__gutter path-cal__gutter--untimed">Χωρίς ώρα</div>
        {days.map((day) => (
          <section
            key={`untimed-${day.weekday}`}
            className={`path-cal__untimed${overUntimed === day.weekday ? ' path-cal__untimed--over' : ''}`}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverUntimed(day.weekday);
              setPreview(null);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setOverUntimed((prev) => (prev === day.weekday ? null : prev));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || dragRef.current?.id;
              if (id) onMove(id, { weekday: day.weekday, startTime: null });
              clearDrag();
            }}
          >
            {day.untimed.map((template) => (
              <TemplateCard key={template.id} {...cardProps(template)} variant="list" />
            ))}
            <button type="button" className="path-day__add" onClick={() => onNew(day.weekday)}>
              + Template
            </button>
          </section>
        ))}

        <div className="path-cal__gutter path-cal__gutter--hours" style={{ height: gridHeight }}>
          {hours.map((hour) => (
            <span key={hour} className="path-cal__hour" style={{ top: (hour * 60 - gridStart) * PX_PER_MIN }}>
              {minutesToClock(hour * 60)}
            </span>
          ))}
        </div>
        {days.map((day, dayIndex) => (
          <section
            key={`grid-${day.weekday}`}
            className="path-cal__col"
            style={{ height: gridHeight }}
            onDragOver={(event) => {
              if (!dragRef.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              const start = dropMinutes(event);
              const { minutes } = dragRef.current;
              setPreview((prev) => (
                prev && prev.weekday === day.weekday && prev.start === start ? prev : { weekday: day.weekday, start, minutes }
              ));
              setOverUntimed(null);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setPreview((prev) => (prev?.weekday === day.weekday ? null : prev));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || dragRef.current?.id;
              if (id) onMove(id, { weekday: day.weekday, startTime: minutesToClock(dropMinutes(event)) });
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
                onClick={() => onNew(day.weekday, minutesToClock(minute))}
              />
            ))}

            {day.timeline.map((item) => {
              const lanePct = 100 / item.lanes;
              const anchorRight = (item.lanes > 1 && item.lane === item.lanes - 1) || dayIndex === WEEKDAYS.length - 1;
              return (
                <TemplateCard
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
                    shift: push.shiftFor(day.weekday, item),
                  }}
                  onGrow={(extra) => push.report(item.block.id, day.weekday, item.visualEnd, extra)}
                />
              );
            })}

            {preview?.weekday === day.weekday ? (
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
          </section>
        ))}
      </div>
    </div>
  );
}

/** Mobile: the same day strip and rows as the real week, with weekdays instead of dates. */
function TemplateWeekList({ days, goalsById, onOpen, onNew }) {
  const [selected, setSelected] = useState(() => days.find((day) => day.list.length)?.weekday || 1);
  const day = days.find((item) => item.weekday === selected) || days[0];

  return (
    <div className="path-mweek">
      <div className="path-mweek__strip" role="tablist" aria-label="Μέρες template">
        {days.map((item, index) => (
          <button
            key={item.weekday}
            type="button"
            role="tab"
            aria-selected={item.weekday === selected}
            aria-label={`${DAY_LONG[index]}, ${item.list.length} templates`}
            className={`path-mweek__day${item.weekday === selected ? ' is-selected' : ''}`}
            onClick={() => setSelected(item.weekday)}
          >
            <span className="path-mweek__dow">{DAY_SHORT[index]}</span>
            <span className="path-mweek__num">{item.list.length}</span>
            <span className="path-mweek__dots" aria-hidden="true">
              {item.list.slice(0, 5).map((template) => <i key={template.id} />)}
            </span>
          </button>
        ))}
      </div>

      <div className="path-mweek__dayhead">
        <h3>{DAY_LONG[day.weekday - 1]}</h3>
        {day.planned ? <span className="path-mweek__today-tag">{formatDuration(day.planned)}</span> : null}
      </div>

      <div className="path-mweek__list">
        {day.list.length ? day.list.map((template) => {
          const goal = goalsById.get(template.goalId);
          const sub = [formatBlockWindow(template.startTime, template.duration), template.blockType, goal?.title]
            .filter(Boolean).join(' · ');
          return (
            <div
              key={template.id}
              role="button"
              tabIndex={0}
              className={`path-mrow${template.enabled ? '' : ' path-mrow--skipped'}`}
              style={{ '--path-mrow-stripe': normalizeGoalColor(goal?.color) || 'rgba(148, 163, 184, 0.6)' }}
              onClick={() => onOpen(template)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onOpen(template);
              }}
            >
              <span className="path-mrow__time">{template.startTime || '—'}</span>
              <span className="path-mrow__stripe" aria-hidden="true" />
              <span className="path-mrow__body">
                <span className="path-mrow__title">{template.title}</span>
                {sub ? <span className="path-mrow__sub">{sub}</span> : null}
              </span>
              <span aria-hidden="true" />
            </div>
          );
        }) : (
          <p className="path-mweek__empty">Κανένα template αυτή τη μέρα.</p>
        )}
      </div>

      <div className="path-mweek__add">
        <button type="button" className="btn" onClick={() => onNew(day.weekday)}>+ Template</button>
      </div>
    </div>
  );
}

/** The week the templates build: what every new week starts from. */
export function PathTemplateWeek({ templates, goals, onOpen, onNew, onMove }) {
  const days = useTemplateDays(templates);
  const goalsById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal])), [goals]);
  return platform.isMobile
    ? <TemplateWeekList days={days} goalsById={goalsById} onOpen={onOpen} onNew={onNew} />
    : <TemplateWeekGrid days={days} goalsById={goalsById} onOpen={onOpen} onNew={onNew} onMove={onMove} />;
}
