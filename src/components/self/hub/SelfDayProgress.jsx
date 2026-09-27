import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SelfIcon } from '../SelfIcons';
import { currentHourForDate } from '../../../utils/selfHubTimelineEvents';
import { SelfTimelineEventDialog } from './SelfTimelineEventDialog';

const LANE_COUNT = 3;
const MIN_GAP_PX = 10;
const FALLBACK_TRACK_PX = 880;
const CLUSTER_SPAN_HOURS = 0.4;
const CLUSTER_EDGE_PX = 8;

function estimateChipWidthPx(event, density) {
  const padding = density === 'icon' ? 16 : 26;
  const icon = 14;
  const gap = 5;
  let width = padding + icon + 2;
  if (density !== 'icon' && event.timeLabel) width += gap + 44;
  if (density === 'full' && event.label) {
    width += gap + Math.min(String(event.label).length * 7.2, 96);
  }
  return width;
}

/**
 * Pack event chips into vertical lanes. Nearby events go up a lane;
 * if they still collide, the chip shrinks (hide label, then time).
 */
function layoutTimelineEvents(events, trackWidthPx, laneCount = LANE_COUNT) {
  if (!events.length) return [];
  const width = trackWidthPx > 0 ? trackWidthPx : FALLBACK_TRACK_PX;
  const gapPct = (MIN_GAP_PX / width) * 100;
  const densities = ['full', 'time', 'icon'];

  const sorted = events
    .map((event, index) => ({ event, index, pos: (event.hour / 24) * 100 }))
    .sort((a, b) => a.pos - b.pos || a.index - b.index);

  const laneRights = Array(laneCount).fill(-Infinity);
  const placed = [];

  for (const item of sorted) {
    let chosen = null;
    for (const density of densities) {
      const half = ((estimateChipWidthPx(item.event, density) / width) * 100) / 2;
      const left = item.pos - half;
      const right = item.pos + half;
      for (let lane = 0; lane < laneCount; lane += 1) {
        if (left >= laneRights[lane] + gapPct) {
          chosen = { density, lane, right };
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      const half = ((estimateChipWidthPx(item.event, 'icon') / width) * 100) / 2;
      let lane = 0;
      let bestRight = Infinity;
      for (let i = 0; i < laneCount; i += 1) {
        if (laneRights[i] < bestRight) {
          bestRight = laneRights[i];
          lane = i;
        }
      }
      chosen = { density: 'icon', lane, right: item.pos + half };
    }

    laneRights[chosen.lane] = chosen.right;
    placed.push({
      ...item.event,
      pos: item.pos,
      lane: chosen.lane,
      density: chosen.density,
      index: item.index,
    });
  }

  return placed.sort((a, b) => a.index - b.index);
}

function estimateClusterWidthPx(events) {
  const longest = events.reduce(
    (max, event) => Math.max(max, String(event.label || '').length),
    0,
  );
  return Math.max(96, 58 + longest * 5.4);
}

/** Room above the track so every separate chip in a stack stays visible. */
function clusterLiftRem(eventCount) {
  const stackRem = eventCount * 1.12 + Math.max(0, eventCount - 1) * 0.14 + 0.5;
  return Math.max(0, stackRem - 5.05);
}

function clusterNudgePx(posPct, cardWidthPx, trackWidthPx, neighbors = []) {
  const width = trackWidthPx > 0 ? trackWidthPx : FALLBACK_TRACK_PX;
  const center = (posPct / 100) * width;
  const gap = 10;
  let nudge = 0;

  const bounds = () => {
    const left = center - cardWidthPx / 2 + nudge;
    return { left, right: left + cardWidthPx };
  };

  const clampToTrack = () => {
    let { left, right } = bounds();
    if (left < CLUSTER_EDGE_PX) nudge += CLUSTER_EDGE_PX - left;
    ({ left, right } = bounds());
    if (right > width - CLUSTER_EDGE_PX) nudge -= right - (width - CLUSTER_EDGE_PX);
  };

  clampToTrack();

  for (const neighbor of neighbors) {
    const neighborHalf = estimateChipWidthPx(neighbor, neighbor.density) / 2;
    const neighborCenter = (neighbor.pos / 100) * width;
    const neighborLeft = neighborCenter - neighborHalf - gap;
    const neighborRight = neighborCenter + neighborHalf + gap;
    const { left, right } = bounds();
    if (right <= neighborLeft || left >= neighborRight) continue;
    if (neighbor.pos <= posPct) nudge += neighborRight - left;
    else nudge -= right - neighborLeft;
  }

  clampToTrack();

  const maxNudge = Math.max(0, cardWidthPx / 2 - 18);
  return Math.max(-maxNudge, Math.min(maxNudge, nudge));
}

/**
 * Events that land in the same short window stack as separate chips.
 * Lone events stay on the lane layout.
 */
function groupPlacedEvents(placed, trackWidthPx) {
  const sorted = [...placed].sort((a, b) => a.hour - b.hour || a.index - b.index);
  const columns = [];

  for (const event of sorted) {
    const last = columns[columns.length - 1];
    if (last && event.hour - last.anchorHour <= CLUSTER_SPAN_HOURS) {
      last.events.push(event);
      continue;
    }
    columns.push({ anchorHour: event.hour, events: [event] });
  }

  return columns.map((column) => {
    if (column.events.length === 1) {
      return { kind: 'single', id: column.events[0].id, event: column.events[0] };
    }
    const hour = column.events.reduce((sum, event) => sum + event.hour, 0) / column.events.length;
    const pos = (hour / 24) * 100;
    const memberIds = new Set(column.events.map((event) => event.id));
    const neighbors = placed.filter((event) => !memberIds.has(event.id));
    return {
      kind: 'cluster',
      id: `cluster-${column.events[0].id}`,
      pos,
      events: column.events,
      nudge: clusterNudgePx(pos, estimateClusterWidthPx(column.events), trackWidthPx, neighbors),
    };
  });
}

const CHIP_CLEAR_GAP = 8;

function rangesOverlap(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0) > 0;
}

/** Smallest shift that moves `box` fully outside [blockedLeft, blockedRight]. */
function shiftOutOfZone(box, blockedLeft, blockedRight, anchor) {
  const needLeft = box.right - blockedLeft;
  const needRight = blockedRight - box.left;
  const candidates = [];
  if (needLeft > 0) candidates.push(-needLeft);
  if (needRight > 0) candidates.push(needRight);
  const keepsAnchor = candidates.filter((shift) => {
    const left = box.left + shift;
    const right = box.right + shift;
    return anchor >= left - 1 && anchor <= right + 1;
  });
  const pool = keepsAnchor.length ? keepsAnchor : candidates;
  pool.sort((a, b) => Math.abs(a) - Math.abs(b));
  return pool[0] || 0;
}

/**
 * Keep chips from covering each other or the stem of a chip above them.
 * One directional pass so the result does not oscillate.
 * Positions are the unshifted layout boxes.
 */
function resolveChipNudges(items) {
  const nudges = {};
  items.forEach((item) => {
    nudges[item.id] = 0;
  });

  const boxOf = (item) => {
    const nudge = nudges[item.id];
    return {
      left: item.left + nudge,
      right: item.right + nudge,
      top: item.top,
      bottom: item.bottom,
    };
  };

  const byAnchor = [...items].sort((a, b) => a.anchor - b.anchor || a.top - b.top);
  for (let index = 0; index < byAnchor.length; index += 1) {
    const item = byAnchor[index];
    let box = boxOf(item);
    for (let earlier = 0; earlier < index; earlier += 1) {
      const other = byAnchor[earlier];
      const otherBox = boxOf(other);
      if (!rangesOverlap(box.top, box.bottom, otherBox.top, otherBox.bottom)) continue;
      if (!rangesOverlap(box.left, box.right, otherBox.left - CHIP_CLEAR_GAP, otherBox.right + CHIP_CLEAR_GAP)) continue;
      const shift = otherBox.right + CHIP_CLEAR_GAP - box.left;
      if (shift <= 0) continue;
      nudges[item.id] += shift;
      box = boxOf(item);
    }
  }

  const lowerFirst = [...items].sort((a, b) => b.top - a.top || a.anchor - b.anchor);
  for (const item of lowerFirst) {
    let box = boxOf(item);
    for (const other of items) {
      if (other.id === item.id) continue;
      const otherBox = boxOf(other);
      if (otherBox.bottom > box.top + 1) continue;
      const zoneLeft = other.anchor - CHIP_CLEAR_GAP;
      const zoneRight = other.anchor + CHIP_CLEAR_GAP;
      if (!rangesOverlap(box.left, box.right, zoneLeft, zoneRight)) continue;
      const shift = shiftOutOfZone(box, zoneLeft, zoneRight, item.anchor);
      if (!shift) continue;
      nudges[item.id] += shift;
      box = boxOf(item);
    }
  }

  return nudges;
}

function useTrackWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

function useLiveHour(enabled) {
  const [hour, setHour] = useState(() => currentHourForDate(null));

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setHour(currentHourForDate(null));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return hour;
}

function eventHasNote(eventNotes, eventId) {
  const entry = eventNotes?.[eventId];
  return Boolean(entry?.note?.trim() || entry?.detail?.trim());
}

function eventTitle(event) {
  const type = event.typeLabel || '';
  const time = event.timeLabel ? ` · ${event.timeLabel}` : '';
  const label = event.label && event.label !== event.typeLabel ? ` — ${event.label}` : '';
  return `${type}${time}${label}`;
}

function TimelineCluster({ group, eventNotes, onOpenEvent, nudge = 0 }) {
  return (
    <span
      className="self-day-progress__event self-day-progress__event--cluster"
      data-layout-id={group.id}
      style={{
        left: `${group.pos}%`,
        '--chip-nudge': `${nudge}px`,
      }}
    >
      <span className="self-day-progress__cluster-shift">
        <span className="self-day-progress__cluster">
          {group.events.map((event) => {
            const noted = eventHasNote(eventNotes, event.id);
            const ChipTag = onOpenEvent ? 'button' : 'span';
            return (
              <ChipTag
                key={event.id}
                type={onOpenEvent ? 'button' : undefined}
                className={`self-day-progress__event-chip self-day-progress__cluster-chip self-day-progress__event--${event.tone}${noted ? ' self-day-progress__cluster-chip--noted' : ''}`}
                title={eventTitle(event)}
                onClick={
                  onOpenEvent
                    ? (clickEvent) => {
                        clickEvent.stopPropagation();
                        onOpenEvent(event);
                      }
                    : undefined
                }
              >
                <span className="self-day-progress__event-icon">
                  <SelfIcon name={event.icon} />
                </span>
                {event.timeLabel ? (
                  <span className="self-day-progress__event-time">{event.timeLabel}</span>
                ) : null}
                <span className="self-day-progress__event-label">{event.label}</span>
              </ChipTag>
            );
          })}
        </span>
      </span>
      <span className="self-day-progress__event-stem" aria-hidden />
    </span>
  );
}

/** @param {{ dayProgress: import('../../../utils/selfHubSchema').SelfHubDayProgress, events?: import('../../../utils/selfHubTimelineEvents').SelfTimelineEvent[], onOpenDayDetails?: () => void, embedded?: boolean, live?: boolean, eventNotes?: Record<string, { note?: string, detail?: string }>, onSaveEvent?: (eventId: string, fields: { note: string, detail: string }) => void }} props */
export function SelfDayProgress({
  dayProgress,
  events = [],
  onOpenDayDetails,
  embedded = false,
  live = true,
  eventNotes = {},
  onSaveEvent,
}) {
  const [openEvent, setOpenEvent] = useState(null);
  const [chipNudges, setChipNudges] = useState({});
  const liveHour = useLiveHour(live);
  const [trackRef, trackWidth] = useTrackWidth();
  const currentHour = live ? liveHour : (dayProgress.currentHour ?? 24);
  const { markers, segments } = dayProgress;
  const pct = Math.max(0, Math.min(100, (currentHour / 24) * 100));
  const timelineItems = useMemo(
    () => groupPlacedEvents(layoutTimelineEvents(events, trackWidth), trackWidth),
    [events, trackWidth]
  );
  const clusterLift = timelineItems.reduce(
    (max, item) => (item.kind === 'cluster' ? Math.max(max, clusterLiftRem(item.events.length)) : max),
    0,
  );
  useLayoutEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll('.self-day-progress__events > .self-day-progress__event')];
    const previous = nodes.map((node) => node.style.getPropertyValue('--chip-nudge'));
    nodes.forEach((node) => node.style.setProperty('--chip-nudge', '0px'));
    const items = nodes.map((node) => {
      const chips = [...node.querySelectorAll('.self-day-progress__event-chip')];
      const rects = chips.map((chip) => chip.getBoundingClientRect());
      const eventRect = node.getBoundingClientRect();
      if (!node.dataset.layoutId || !rects.length) return null;
      return {
        id: node.dataset.layoutId,
        anchor: eventRect.left + eventRect.width / 2,
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    }).filter(Boolean);
    nodes.forEach((node, index) => {
      if (previous[index]) node.style.setProperty('--chip-nudge', previous[index]);
      else node.style.removeProperty('--chip-nudge');
    });
    const next = resolveChipNudges(items);
    setChipNudges((prev) => {
      const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const id of ids) {
        if (Math.abs((prev[id] || 0) - (next[id] || 0)) > 0.5) return next;
      }
      return prev;
    });
  }, [timelineItems, trackWidth]);

  const showNow = currentHour < 24;
  const TrackTag = embedded || !onOpenDayDetails ? 'div' : 'button';
  const trackProps = TrackTag === 'button'
    ? {
        type: 'button',
        className: 'self-day-progress__track-btn',
        onClick: onOpenDayDetails,
        'aria-label': 'Λεπτομέρειες ημέρας',
      }
    : { className: 'self-day-progress__track-btn self-day-progress__track-btn--static' };

  return (
    <section
      className={`self-day-progress${embedded ? ' self-day-progress--embedded' : ''}`}
      style={clusterLift ? { marginTop: `${clusterLift}rem` } : undefined}
      aria-label="Day progress"
    >
      <div className="self-day-progress__row">
        {!embedded && (
          <button
            type="button"
            className="self-day-progress__play"
            aria-label="Λεπτομέρειες ημέρας"
            onClick={onOpenDayDetails}
          >
            <SelfIcon name="timelinePlay" />
          </button>
        )}
        <div className="self-day-progress__track-wrap" ref={trackRef}>
            {timelineItems.length > 0 && (
              <div className="self-day-progress__events" aria-hidden={false}>
                {timelineItems.map((item) => (
                  item.kind === 'cluster' ? (
                    <TimelineCluster
                      key={item.id}
                      group={item}
                      nudge={chipNudges[item.id] || 0}
                      eventNotes={eventNotes}
                      onOpenEvent={onSaveEvent ? setOpenEvent : undefined}
                    />
                  ) : (
                    <button
                      key={item.event.id}
                      type="button"
                      data-layout-id={item.event.id}
                      className={`self-day-progress__event self-day-progress__event--${item.event.tone} self-day-progress__event--lane${item.event.lane} self-day-progress__event--density-${item.event.density}${eventHasNote(eventNotes, item.event.id) ? ' self-day-progress__event--noted' : ''}`}
                      style={{
                        left: `${item.event.pos}%`,
                        '--chip-nudge': `${chipNudges[item.event.id] || 0}px`,
                      }}
                      title={eventTitle(item.event)}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        if (onSaveEvent) setOpenEvent(item.event);
                      }}
                    >
                      <span className="self-day-progress__event-chip">
                        <span className="self-day-progress__event-icon">
                          <SelfIcon name={item.event.icon} />
                        </span>
                        {item.event.density !== 'icon' && item.event.timeLabel ? (
                          <span className="self-day-progress__event-time">{item.event.timeLabel}</span>
                        ) : null}
                        {item.event.density === 'full' ? (
                          <span className="self-day-progress__event-label">{item.event.label}</span>
                        ) : null}
                      </span>
                      <span className="self-day-progress__event-stem" aria-hidden />
                    </button>
                  )
                ))}
              </div>
            )}
            <TrackTag {...trackProps}>
            <div className="self-day-progress__track">
              <span className="self-day-progress__track-future" aria-hidden />
              {segments?.map((seg, i) => {
                const left = (seg.start / 24) * 100;
                const width = ((seg.end - seg.start) / 24) * 100;
                return (
                  <span
                    key={`${seg.tone}-${i}`}
                    className={`self-day-progress__segment self-day-progress__segment--${seg.tone}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={seg.label}
                  />
                );
              })}
              {timelineItems.map((item) => (
                item.kind === 'cluster' ? (
                  <span
                    key={`dot-${item.id}`}
                    className={`self-day-progress__event-dot self-day-progress__event-dot--${item.events[0].tone}`}
                    style={{ left: `${item.pos}%` }}
                    aria-hidden
                  />
                ) : (
                  <span
                    key={`dot-${item.event.id}`}
                    className={`self-day-progress__event-dot self-day-progress__event-dot--${item.event.tone}`}
                    style={{ left: `${item.event.pos}%` }}
                    aria-hidden
                  />
                )
              ))}
              <span className="self-day-progress__filled" style={{ width: `${pct}%` }} />
              {showNow ? (
                <span className="self-day-progress__now" style={{ left: `${pct}%` }} aria-hidden />
              ) : null}
            </div>
            <div className="self-day-progress__markers">
              {markers.map((marker) => (
                <span key={marker} className="self-day-progress__marker">
                  {marker}
                </span>
              ))}
            </div>
            </TrackTag>
          </div>
      </div>
      {!embedded && (
        <div className="self-day-progress__footer">
          <span className="self-day-progress__sun" aria-hidden>
            <SelfIcon name="sun" />
          </span>
          <p className="self-day-progress__caption">Ημέρα</p>
        </div>
      )}
      {openEvent && onSaveEvent ? (
        <SelfTimelineEventDialog
          event={openEvent}
          entry={eventNotes[openEvent.id]}
          onClose={() => setOpenEvent(null)}
          onSave={onSaveEvent}
        />
      ) : null}
    </section>
  );
}
