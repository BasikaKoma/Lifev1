import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SelfIcon } from '../SelfIcons';
import { currentHourForDate } from '../../../utils/selfHubTimelineEvents';
import { SelfTimelineEventDialog } from './SelfTimelineEventDialog';

const LANE_COUNT = 3;
const MIN_GAP_PX = 10;
const FALLBACK_TRACK_PX = 880;
const CLUSTER_SPAN_HOURS = 0.4;
const LABEL_CAP_PX = 128;

function estimateChipWidthPx(event, density) {
  const padding = density === 'icon' ? 16 : 26;
  const icon = 14;
  const gap = 5;
  let width = padding + icon + 2;
  if (density !== 'icon' && event.timeLabel) width += gap + 44;
  if (density === 'full' && event.label) {
    width += gap + Math.min(String(event.label).length * 7.2, 192);
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
  const densities = ['full', 'time'];

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
      const half = ((estimateChipWidthPx(item.event, 'time') / width) * 100) / 2;
      let lane = 0;
      let bestRight = Infinity;
      for (let i = 0; i < laneCount; i += 1) {
        if (laneRights[i] < bestRight) {
          bestRight = laneRights[i];
          lane = i;
        }
      }
      chosen = { density: 'time', lane, right: item.pos + half };
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
  return Math.max(96, 58 + Math.min(longest * 5.4, LABEL_CAP_PX));
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

  const placedColumns = columns.map((column) => {
    if (column.events.length === 1) {
      return { kind: 'single', id: column.events[0].id, event: column.events[0] };
    }
    const hour = column.events.reduce((sum, event) => sum + event.hour, 0) / column.events.length;
    const pos = (hour / 24) * 100;
    return {
      kind: 'cluster',
      id: `cluster-${column.events[0].id}`,
      pos,
      events: column.events,
    };
  });

  return preferFullLabels(assignColumnBands(placedColumns, trackWidthPx), trackWidthPx);
}

/** Nearby columns alternate above the line so their labels stay on their own dots. */
function assignColumnBands(columns, trackWidthPx) {
  const width = trackWidthPx > 0 ? trackWidthPx : FALLBACK_TRACK_PX;
  const bandRight = [-Infinity, -Infinity];

  return columns.map((column) => {
    const card = column.kind === 'cluster'
      ? estimateClusterWidthPx(column.events)
      : estimateChipWidthPx(column.event, column.event.density || 'full');
    const pos = column.kind === 'cluster' ? column.pos : column.event.pos;
    const center = (pos / 100) * width;
    const left = center - card / 2;
    const right = center + card / 2;
    let band = left >= bandRight[0] + MIN_GAP_PX ? 0 : 1;
    if (band === 1 && left < bandRight[1] + MIN_GAP_PX) {
      band = bandRight[0] <= bandRight[1] ? 0 : 1;
    }
    bandRight[band] = Math.max(bandRight[band], right);
    return { ...column, band };
  });
}

/** True when the chip can slide sideways and still keep its dot underneath. */
function chipClearsNeighbors(center, card, obstacles) {
  const half = card / 2;
  const maxShift = Math.max(0, half - ANCHOR_INSET_PX);
  let nudge = 0;

  for (let pass = 0; pass < obstacles.length + 1; pass += 1) {
    let moved = false;
    for (const other of obstacles) {
      const left = center - half + nudge;
      const right = center + half + nudge;
      if (right <= other.left - MIN_GAP_PX || left >= other.right + MIN_GAP_PX) continue;
      const pushRight = other.right + MIN_GAP_PX - left;
      const pushLeft = other.left - MIN_GAP_PX - right;
      const preferRight = Math.abs(pushRight) <= Math.abs(pushLeft);
      let next = nudge + (preferRight ? pushRight : pushLeft);
      if (Math.abs(next) > maxShift) {
        next = nudge + (preferRight ? pushLeft : pushRight);
        if (Math.abs(next) > maxShift) return false;
      }
      nudge = next;
      moved = true;
    }
    if (!moved) return true;
  }

  return false;
}

/** A lone chip shows its activity name when that label can sit on its own dot. */
function preferFullLabels(columns, trackWidthPx) {
  const width = trackWidthPx > 0 ? trackWidthPx : FALLBACK_TRACK_PX;
  const resolved = columns.map((column) => ({ ...column }));

  const boxOf = (column) => {
    const pos = column.kind === 'cluster' ? column.pos : column.event.pos;
    const card = column.kind === 'cluster'
      ? estimateClusterWidthPx(column.events)
      : estimateChipWidthPx(column.event, column.event.density || 'time');
    const center = (pos / 100) * width;
    return { left: center - card / 2, right: center + card / 2, band: column.band };
  };

  resolved.forEach((column, index) => {
    if (column.kind !== 'single' || column.event.density === 'full') return;
    const fullEvent = { ...column.event, density: 'full' };
    const card = estimateChipWidthPx(fullEvent, 'full');
    const center = (column.event.pos / 100) * width;
    const obstacles = resolved
      .filter((other, otherIndex) => otherIndex !== index && other.band === column.band)
      .map(boxOf);
    if (!chipClearsNeighbors(center, card, obstacles)) return;
    resolved[index] = { ...column, event: fullEvent };
  });

  return resolved;
}

function eventsBandHeightRem(items) {
  const stackRem = (count) => {
    if (count <= 0) return 0;
    return count * 1.02 + Math.max(0, count - 1) * 0.14 + 0.4;
  };
  let low = 0;
  let high = 0;
  items.forEach((item) => {
    const count = item.kind === 'cluster' ? item.events.length : 1;
    if (item.band === 1) high = Math.max(high, count);
    else low = Math.max(low, count);
  });
  const need = stackRem(low) + stackRem(high) + (high ? 0.45 : 0.15);
  return Math.max(5.15, need);
}

const CHIP_CLEAR_GAP = 8;
const ANCHOR_INSET_PX = 14;

/** Keep the timeline dot under the chip. A sideways shove that leaves the dot looks detached. */
function clampNudgeToAnchor(item, nudge) {
  const width = item.right - item.left;
  const centered = item.anchor - (item.left + item.right) / 2;
  if (width <= ANCHOR_INSET_PX * 2) return centered;
  const minNudge = item.anchor + ANCHOR_INSET_PX - item.right;
  const maxNudge = item.anchor - ANCHOR_INSET_PX - item.left;
  return Math.max(minNudge, Math.min(maxNudge, nudge));
}

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
      const next = clampNudgeToAnchor(item, nudges[item.id] + shift);
      if (Math.abs(next - nudges[item.id]) < 0.5) continue;
      nudges[item.id] = next;
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
      const next = clampNudgeToAnchor(item, nudges[item.id] + shift);
      if (Math.abs(next - nudges[item.id]) < 0.5) continue;
      nudges[item.id] = next;
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
      className={`self-day-progress__event self-day-progress__event--cluster${group.band === 1 ? ' self-day-progress__event--band1' : ''}`}
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
  const eventsHeightRem = eventsBandHeightRem(timelineItems);
  useLayoutEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll('.self-day-progress__events > .self-day-progress__event')];
    const previous = nodes.map((node) => node.style.getPropertyValue('--chip-nudge'));
    const shifted = [...root.querySelectorAll('.self-day-progress__event-chip, .self-day-progress__cluster-shift')];
    shifted.forEach((node) => node.style.setProperty('transition', 'none'));
    nodes.forEach((node) => node.style.setProperty('--chip-nudge', '0px'));
    void root.offsetWidth;
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
    shifted.forEach((node) => node.style.removeProperty('transition'));
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
      style={{ '--day-events-height': `${eventsHeightRem}rem` }}
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
                      className={`self-day-progress__event self-day-progress__event--${item.event.tone} self-day-progress__event--lane${item.band === 1 ? 2 : 0} self-day-progress__event--density-${item.event.density}${item.band === 1 ? ' self-day-progress__event--band1' : ''}${eventHasNote(eventNotes, item.event.id) ? ' self-day-progress__event--noted' : ''}`}
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
