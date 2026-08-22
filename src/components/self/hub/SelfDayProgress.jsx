import { useEffect, useMemo, useRef, useState } from 'react';
import { SelfIcon } from '../SelfIcons';
import { currentHourForDate } from '../../../utils/selfHubTimelineEvents';

const LANE_COUNT = 3;
const MIN_GAP_PX = 10;
const FALLBACK_TRACK_PX = 880;

function estimateChipWidthPx(event, density) {
  const padding = density === 'icon' ? 10 : 14;
  const icon = 13;
  const gap = 4.5;
  let width = padding + icon;
  if (density !== 'icon' && event.timeLabel) width += gap + 34;
  if (density === 'full' && event.label) {
    width += gap + Math.min(String(event.label).length * 6.4, 96);
  }
  return width;
}

/**
 * Pack event chips into vertical lanes. Nearby events go up a lane;
 * if they still collide, the chip shrinks (hide label, then time).
 */
function layoutTimelineEvents(events, trackWidthPx, laneCount = LANE_COUNT) {
  if (!events.length) return [];
  const width = Math.max(trackWidthPx || 0, FALLBACK_TRACK_PX);
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

/** @param {{ dayProgress: import('../../../utils/selfHubSchema').SelfHubDayProgress, events?: import('../../../utils/selfHubTimelineEvents').SelfTimelineEvent[], onOpenDayDetails?: () => void, embedded?: boolean, live?: boolean }} props */
export function SelfDayProgress({
  dayProgress,
  events = [],
  onOpenDayDetails,
  embedded = false,
  live = true,
}) {
  const liveHour = useLiveHour(live);
  const [trackRef, trackWidth] = useTrackWidth();
  const currentHour = live ? liveHour : (dayProgress.currentHour ?? 24);
  const { markers, segments } = dayProgress;
  const pct = Math.max(0, Math.min(100, (currentHour / 24) * 100));
  const laidOutEvents = useMemo(
    () => layoutTimelineEvents(events, trackWidth),
    [events, trackWidth]
  );
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
    <section className={`self-day-progress${embedded ? ' self-day-progress--embedded' : ''}`} aria-label="Day progress">
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
        <TrackTag {...trackProps}>
          <div className="self-day-progress__track-wrap" ref={trackRef}>
            {laidOutEvents.length > 0 && (
              <div className="self-day-progress__events" aria-hidden={false}>
                {laidOutEvents.map((event) => (
                  <span
                    key={event.id}
                    className={`self-day-progress__event self-day-progress__event--${event.tone} self-day-progress__event--lane${event.lane} self-day-progress__event--density-${event.density}`}
                    style={{ left: `${event.pos}%` }}
                    title={`${event.typeLabel}${event.timeLabel ? ` · ${event.timeLabel}` : ''}${event.label && event.label !== event.typeLabel ? ` — ${event.label}` : ''}`}
                  >
                    <span className="self-day-progress__event-chip">
                      <span className="self-day-progress__event-icon">
                        <SelfIcon name={event.icon} />
                      </span>
                      {event.density !== 'icon' && event.timeLabel ? (
                        <span className="self-day-progress__event-time">{event.timeLabel}</span>
                      ) : null}
                      {event.density === 'full' ? (
                        <span className="self-day-progress__event-label">{event.label}</span>
                      ) : null}
                    </span>
                    <span className="self-day-progress__event-stem" aria-hidden />
                  </span>
                ))}
              </div>
            )}
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
              {laidOutEvents.map((event) => (
                <span
                  key={`dot-${event.id}`}
                  className={`self-day-progress__event-dot self-day-progress__event-dot--${event.tone}`}
                  style={{ left: `${event.pos}%` }}
                  aria-hidden
                />
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
          </div>
        </TrackTag>
      </div>
      {!embedded && (
        <div className="self-day-progress__footer">
          <span className="self-day-progress__sun" aria-hidden>
            <SelfIcon name="sun" />
          </span>
          <p className="self-day-progress__caption">Ημέρα</p>
        </div>
      )}
    </section>
  );
}
