import { DEFAULT_MAP_THEME } from './mapTheme';
import { processStages } from './logic';
import { createStarterStages, generateId } from '../data/templates';
import { normalizeProjectBrief } from './projectBrief';
import { isMobilePlatform } from '../platform/capabilities';

export const LIFELINE_TITLE = 'Lifeline';

export const DEFAULT_LIFELINE_CONFIG = {
  startDate: null,
  dayHeight: 24,
  /** Days shown past today by default. The end is user-draggable from here. */
  futureDays: 90,
};

/**
 * Hard cap for lifeline spine/board pixel height (mobile-safe default).
 * Mobile WebViews clamp compositor layers around 8192px — a taller transformed
 * canvas paints as black except near the layer origin, which is the
 * "empty screen / tip at bottom" bug.
 */
export const MAX_LIFELINE_SPINE_PX = 7200;

/** Desktop (Electron/Chromium) tiles large layers, so the spine is NOT bound
 * by the 16384px single-texture limit — the compositor splits it into tiles.
 * The visible gap per day is (budget / dayCount), so a taller budget directly
 * magnifies every day on the same fixed line (dates never move). Kept just
 * under 32768px, the safe upper bound for a tiled compositor layer. */
const DESKTOP_LIFELINE_SPINE_PX = 32000;

/** Pixel budget for the whole spine on this device. */
export function getLifelineSpineBudget() {
  try {
    return isMobilePlatform() ? MAX_LIFELINE_SPINE_PX : DESKTOP_LIFELINE_SPINE_PX;
  } catch {
    return MAX_LIFELINE_SPINE_PX;
  }
}

/**
 * Lifeline zoom:
 * - CSS scale only for zooming OUT (overview). Cap at 1 — never stretch the
 *   canvas (that blurs labels).
 * - Zoom-in raises `dayHeight` (the real gap between days). If the whole line
 *   no longer fits the GPU budget, off-screen days are cropped so the days
 *   under the cursor keep growing. Day View opens only at a large gap.
 */
export const LIFELINE_ZOOM = {
  minScale: 0.15,
  maxScale: 1,
  dayHeightMin: 4,
  /** Max px gap between day ticks before further zoom opens Day View. */
  dayHeightMax: 200,
  /** Day spacing (px) at which every calendar day gets its own tick. */
  everyDaySpacing: 13,
  /** Layout px per day required before zoom-in opens Day View. */
  dayViewEnterAt: 140,
};

/** Semantic zoom levels for the Lifeline spine (overview → detail). */
export const LIFELINE_ZOOM_LEVEL = {
  life: 1,
  time: 2,
  month: 3,
  week: 4,
};

export const LIFELINE_ZOOM_LEVEL_META = {
  1: {
    id: 'life',
    label: 'Ολόκληρη ζωή',
    shortLabel: 'Ζωή',
    description: 'Χρόνια, μεγάλες περίοδοι, σημαντικά milestones',
  },
  2: {
    id: 'time',
    label: 'Χρόνος',
    shortLabel: 'Χρόνος',
    description: 'Μήνες, projects, στόχοι, μεγάλες αλλαγές',
  },
  3: {
    id: 'month',
    label: 'Μήνας',
    shortLabel: 'Μήνας',
    description: 'Εβδομάδες και ημέρες με χρωματική ένταση',
  },
  4: {
    id: 'week',
    label: 'Εβδομάδα',
    shortLabel: 'Εβδομάδα',
    description: 'Κάθε ημέρα ως ξεχωριστός κόμβος',
  },
};

/**
 * True when the line already shows one tick per day. Day View only opens from
 * zoom once the gap can't grow any more AND we're at this daily level, so the
 * user never dives in from a weekly view.
 */
export function canEnterLifelineDayView(daySpacing) {
  return (Number(daySpacing) || 0) >= LIFELINE_ZOOM.everyDaySpacing;
}

/** Resolve semantic zoom level from day spacing and CSS overview scale. */
export function resolveLifelineZoomLevel(daySpacing, cssScale = 1) {
  const spacing = Number(daySpacing) || 0;
  const scale = Number(cssScale) || 1;
  if (scale < 0.42 || spacing < 5) return LIFELINE_ZOOM_LEVEL.life;
  if (scale < 0.7 || spacing < 9) return LIFELINE_ZOOM_LEVEL.time;
  if (spacing < LIFELINE_ZOOM.everyDaySpacing) return LIFELINE_ZOOM_LEVEL.month;
  return LIFELINE_ZOOM_LEVEL.week;
}

export function getLifelineZoomLevelMeta(level) {
  return LIFELINE_ZOOM_LEVEL_META[level] || LIFELINE_ZOOM_LEVEL_META[LIFELINE_ZOOM_LEVEL.week];
}

/** 0–1 activity score for month-level intensity bands. */
export function getLifelineDayIntensity(dayData) {
  if (!dayData) return 0;
  let score = 0;
  if (dayData.notes?.trim()) score += 0.35;
  if (dayData.thoughts?.length) score += Math.min(0.3, dayData.thoughts.length * 0.08);
  const todos = dayData.todos || [];
  if (todos.length) {
    const done = todos.filter((t) => t?.done).length;
    score += Math.min(0.35, (done / todos.length) * 0.35);
    if (done < todos.length) score += 0.1;
  }
  if (Object.values(dayData.routines || {}).some((r) => r?.done)) score += 0.2;
  if (hasLifelineDayMetrics(dayData?.metrics)) score += 0.1;
  return Math.min(1, score);
}

function hasLifelineDayMetrics(metrics) {
  if (!metrics || metrics.preview === true) return false;
  return Boolean(
    metrics.leftMetrics?.length ||
    metrics.weight ||
    metrics.dayScore ||
    metrics.source
  );
}

/** Whether a calendar day has logged Lifeline content (notes, tasks, metrics, project activity). */
export function hasLifelineDayContent(dayData, date, activityDates = null) {
  if (date && activityDates?.has?.(date)) return true;
  if (!dayData) return false;
  if (dayData.notes?.trim()) return true;
  if (dayData.thoughts?.length > 0) return true;
  if (dayData.todos?.length > 0) return true;
  if (Object.values(dayData.routines || {}).some((r) => r?.done)) return true;
  return hasLifelineDayMetrics(dayData.metrics);
}

export function clampLifelineDayHeight(value) {
  const n = Number(value) || DEFAULT_LIFELINE_CONFIG.dayHeight;
  return Math.max(
    LIFELINE_ZOOM.dayHeightMin,
    Math.min(LIFELINE_ZOOM.dayHeightMax, n)
  );
}

export function nextLifelineDayHeight(mapTheme, extraDates = [], zoomIn) {
  const raw = mapTheme?.lifeline || {};
  const current = clampLifelineDayHeight(raw.dayHeight || DEFAULT_LIFELINE_CONFIG.dayHeight);
  // Larger steps once days are already roomy — fewer wheel ticks to the Day View threshold.
  const step =
    current <= 8 ? 1
      : current <= 16 ? 2
        : current <= 40 ? 4
          : current <= 96 ? 8
            : 16;
  const next = zoomIn
    ? Math.min(LIFELINE_ZOOM.dayHeightMax, current + step)
    : Math.max(LIFELINE_ZOOM.dayHeightMin, current - step);
  return next !== current ? next : null;
}

/**
 * Raise or lower the gap between days. The whole line (origin → end) always
 * renders, so the dates never shift — only the spacing between them grows.
 * Returns null when the gap can't grow any more (whole line already at the
 * budget-fit cap), which the caller treats as "open Day View".
 */
export function applyLifelineDayHeightZoom(mapTheme, extraDates, zoomIn, anchorDate) {
  const nextHeight = nextLifelineDayHeight(mapTheme, extraDates, zoomIn);
  if (nextHeight == null) return null;

  const before = getLifelineConfig(mapTheme, extraDates);
  const synced = syncLifelineMapTheme(
    {
      ...mapTheme,
      lifeline: {
        ...(mapTheme?.lifeline || {}),
        dayHeight: nextHeight,
      },
    },
    extraDates
  );
  const after = getLifelineConfig(synced, extraDates);
  // The whole line always fits — if the rendered gap didn't move, we're at the
  // budget cap. Nothing to magnify → let the caller open Day View.
  if (after.dayHeight === before.dayHeight) return null;

  const focus =
    toDateString(anchorDate) || toDateString(new Date()) || after.startDate;
  const layout = synced.roadmap || mapTheme?.roadmap;
  const anchorY = focus ? getDayTickCanvasY(focus, after, layout, extraDates) : null;
  return { mapTheme: synced, anchorY, dayHeight: nextHeight };
}

/** Reset day density to default (CSS scale handled separately). */
export function resetLifelineDayZoom(mapTheme, extraDates = []) {
  return syncLifelineMapTheme(
    {
      ...mapTheme,
      lifeline: {
        ...(mapTheme?.lifeline || {}),
        dayHeight: DEFAULT_LIFELINE_CONFIG.dayHeight,
      },
    },
    extraDates
  );
}

export function getLifelineZoomPercent(mapTheme) {
  const dayHeight = clampLifelineDayHeight(
    mapTheme?.lifeline?.dayHeight || DEFAULT_LIFELINE_CONFIG.dayHeight
  );
  return Math.round((dayHeight / DEFAULT_LIFELINE_CONFIG.dayHeight) * 100);
}

/**
 * Largest dayHeight that keeps the whole line within the GPU pixel budget.
 * The whole range always renders; we lower density instead of cropping days.
 */
export function fitLifelineDayHeight(preferredDayHeight, dayCount) {
  const preferred = clampLifelineDayHeight(preferredDayHeight);
  const count = Math.max(1, Number(dayCount) || 1);
  const maxByBudget = Math.floor(getLifelineSpineBudget() / count);
  return Math.max(LIFELINE_ZOOM.dayHeightMin, Math.min(preferred, maxByBudget));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateString(date) {
  if (!date) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDate(value) {
  const str = toDateString(value);
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function daysBetween(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/** Signed day delta (negative if end is before start). */
export function signedDaysBetween(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** Origin fallback = the first day the app is used (today) when nothing logged yet. */
export function getDefaultLifelineStartDate() {
  return toDateString(new Date());
}

/** A stored origin this close to "one year ago" is the legacy default — ignore it. */
function isLegacyDefaultStart(storedStart, today) {
  if (!storedStart) return false;
  const legacy = addDays(today, -365);
  return Math.abs(signedDaysBetween(storedStart, legacy)) <= 2;
}

/** Every calendar date the spine must cover (plans, days, anchors). */
export function collectLifelineBoundDates({
  stages = [],
  lifelineDays = {},
  extraDates = [],
} = {}) {
  const dates = [];
  const push = (value) => {
    const str = toDateString(value);
    if (str) dates.push(str);
  };
  for (const value of extraDates) push(value);
  for (const stage of stages || []) {
    push(stage?.planStartDate);
    push(stage?.planEndDate);
    for (const checkpoint of stage?.checkpoints || []) {
      push(checkpoint?.planDate);
    }
  }
  for (const key of Object.keys(lifelineDays || {})) push(key);
  return [...new Set(dates)];
}

export function latestLifelineBoundDate(extraDates = []) {
  let latest = null;
  for (const value of extraDates) {
    const str = toDateString(value);
    if (!str) continue;
    if (!latest || signedDaysBetween(latest, str) > 0) latest = str;
  }
  return latest;
}

export function earliestLifelineBoundDate(extraDates = []) {
  let earliest = null;
  for (const value of extraDates) {
    const str = toDateString(value);
    if (!str) continue;
    if (!earliest || signedDaysBetween(str, earliest) > 0) earliest = str;
  }
  return earliest;
}

export function getLifelineConfig(mapTheme, extraDates = []) {
  const raw = mapTheme?.lifeline || {};
  const preferred = clampLifelineDayHeight(raw.dayHeight || DEFAULT_LIFELINE_CONFIG.dayHeight);
  const today = toDateString(new Date());
  // The legacy default was 365 days of empty future, which stretched the line
  // and starved zoom-in. Treat it as "unset" so the line is short by default
  // and the user grows the end by dragging.
  const rawFutureDays =
    Number(raw.futureDays) === 365 ? DEFAULT_LIFELINE_CONFIG.futureDays : Number(raw.futureDays);
  let fullFutureDays = Math.max(
    1,
    Math.min(3650, rawFutureDays || DEFAULT_LIFELINE_CONFIG.futureDays)
  );

  const earliest = earliestLifelineBoundDate(extraDates);
  const latest = latestLifelineBoundDate(extraDates);

  // Origin = the first day the app was used. That is the earliest logged data,
  // or today when nothing has been logged yet. A stored origin is honored only
  // when the user deliberately extended into the past (before their first data)
  // — the legacy "one year ago" default is discarded so the line no longer
  // starts in empty history.
  const storedStart = toDateString(raw.startDate);
  const firstUsed = earliest || today;
  let originStartDate = firstUsed;
  if (
    storedStart
    && !isLegacyDefaultStart(storedStart, today)
    && signedDaysBetween(storedStart, firstUsed) > 0
  ) {
    // User pulled the origin earlier than their first data on purpose.
    originStartDate = storedStart;
  }

  // End = today + futureDays (the draggable value), never earlier than the last
  // logged data so nothing is ever hidden below the tip.
  if (latest) {
    const need = signedDaysBetween(today, latest);
    if (need > fullFutureDays) {
      fullFutureDays = Math.max(1, Math.min(3650, need));
    }
  }

  const endDate = getLifelineFullEndDate(
    {
      startDate: originStartDate,
      originStartDate,
      dayHeight: preferred,
      futureDays: fullFutureDays,
      fullFutureDays,
    },
    extraDates
  );
  const dayCount = Math.max(1, daysBetween(originStartDate, endDate) + 1);
  // Whole line always renders: lower the gap (never crop days) to stay within
  // the GPU budget. Zoom grows the gap on this same fixed line — dates never move.
  const effectiveDayHeight = fitLifelineDayHeight(preferred, dayCount);

  return {
    startDate: originStartDate,
    endDate,
    // `dayHeight` = the actual rendered gap, fitted to the budget so the whole
    // line stays visible (dates never move — only the spacing grows). Stored
    // back as the preferred height too, so zoom-out responds on the first click
    // instead of first burning through an invisible over-cap range.
    dayHeight: effectiveDayHeight,
    futureDays: fullFutureDays,
    originStartDate,
    fullFutureDays,
    preferredDayHeight: effectiveDayHeight,
    windowed: false,
    viewCenterDate: null,
  };
}

/** Full timeline end (ignores detail window). */
export function getLifelineFullEndDate(config, extraDates = []) {
  const origin = config.originStartDate || config.startDate;
  const today = toDateString(new Date());
  const futureEnd = addDays(today, config.fullFutureDays ?? config.futureDays);
  let end = futureEnd;
  for (const d of extraDates) {
    const str = toDateString(d);
    if (str && signedDaysBetween(end, str) > 0) {
      end = str;
    }
  }
  return end;
}

export function getLifelineEndDate(config, extraDates = []) {
  if (config?.endDate) return toDateString(config.endDate);
  return getLifelineFullEndDate(config, extraDates);
}

export function computeLifelineDayCount(config, extraDates = []) {
  const end = getLifelineEndDate(config, extraDates);
  return daysBetween(config.startDate, end) + 1;
}

export function computeLifelineSpineHeight(config, extraDates = []) {
  return computeLifelineDayCount(config, extraDates) * config.dayHeight;
}

/** Spine anchor from roadmap layout (ignores content-driven line expansion). */
export function getLifelineSpineMetrics(layout) {
  const top = typeof layout?.top === 'number' ? layout.top : DEFAULT_MAP_THEME.roadmap.top;
  const height = Math.max(240, Number(layout?.height) || DEFAULT_MAP_THEME.roadmap.height);
  const centerX = layout?.centerX ?? DEFAULT_MAP_THEME.roadmap.centerX;
  return { top, height, bottom: top + height, centerX };
}

/**
 * Pixel spacing per day derived from the *actual* spine height.
 * Avoids dayHeight/height mismatches that push "today" to the tip (future end).
 */
export function getLifelineDaySpacing(config, layout, extraDates = []) {
  const spine = getLifelineSpineMetrics(layout);
  const dayCount = Math.max(1, computeLifelineDayCount(config, extraDates));
  return spine.height / dayCount;
}

/** Spine pixel height written by syncLifelineMapTheme (single source of truth). */
export function expectedLifelineSpineHeight(config, extraDates = []) {
  const raw = computeLifelineSpineHeight(config, extraDates);
  return Math.max(240, Math.min(getLifelineSpineBudget(), raw));
}

export function isLifelineSpineReady(config, layout, extraDates = []) {
  if (!config || !layout) return false;
  const expected = expectedLifelineSpineHeight(config, extraDates);
  const actual = getLifelineSpineMetrics(layout).height;
  // Reject oversized spines too — they exceed GPU layer limits and render blank.
  return actual >= expected * 0.9 && actual <= Math.max(expected * 1.2, expected + 64);
}

/**
 * Absolute canvas Y for a date on the configured spine.
 * Bottom = startDate, top = future end. Uses spine height / dayCount spacing.
 */
export function getDayTickCanvasY(dateStr, config, layout, extraDates = []) {
  if (!config || !layout) return null;
  const date = toDateString(dateStr);
  if (!date) return null;
  const spine = getLifelineSpineMetrics(layout);
  const spacing = getLifelineDaySpacing(config, layout, extraDates);
  // Allow dates outside the visible window to sit off-spine (no edge clamping),
  // so detail-zoom windows don't pin distant milestones to the wrong day.
  const idx = signedDaysBetween(config.startDate, date);
  return spine.bottom - idx * spacing;
}

/** End boundary of a calendar day (top of its band — time flows upward on the spine). */
export function getDayEndCanvasY(dateStr, config, layout, extraDates = []) {
  const startY = getDayTickCanvasY(dateStr, config, layout, extraDates);
  if (startY == null) return null;
  const spacing = getLifelineDaySpacing(config, layout, extraDates);
  return startY - spacing;
}

/** Canvas point for centering the viewport on today's lifeline tick. */
export function getLifelineTodayScrollPoint(config, layout, lineMetrics, extraDates = []) {
  if (!config || !layout) return null;
  const spine = getLifelineSpineMetrics(layout);
  const today = toDateString(new Date());
  const y = getDayTickCanvasY(today, config, layout, extraDates);
  if (y == null || Number.isNaN(y)) return null;
  return {
    x: lineMetrics?.centerX ?? spine.centerX,
    y,
  };
}

const MIN_LIFELINE_RANGE_DAYS = 14;

function clampLifelineFutureDays(value) {
  return Math.max(1, Math.min(3650, Number(value) || DEFAULT_LIFELINE_CONFIG.futureDays));
}

/**
 * Map a spine-handle drag onto the lifeline date range (no view window).
 * Time flows up:
 * - Top handle: drag up = extend the end further into the future (unbounded up
 *   to 10 years); drag down = shrink the end, but never below the last logged
 *   data (last milestone / plan / day).
 * - Bottom handle: drag down = extend the origin further into the past.
 */
export function applyLifelineSpineResize(mapTheme, extraDates, drag) {
  if (!mapTheme || !drag?.edge) return null;
  const spacing = Number(drag.spacing) || 0;
  if (spacing <= 0) return null;

  const originEnd = toDateString(drag.originEndDate);
  const originStart = toDateString(drag.originStartDate);
  const originOriginStart = toDateString(drag.originOriginStartDate) || originStart;
  if (!originEnd || !originStart) return null;

  const today = toDateString(new Date());

  let nextStart = originOriginStart;
  let nextFutureDays = clampLifelineFutureDays(drag.originFutureDays);

  if (drag.edge === 'top') {
    const deltaDays = Math.round((Number(drag.originTop) - Number(drag.top)) / spacing);
    if (!deltaDays) return null;
    let desiredEnd = addDays(originEnd, deltaDays);
    // Never shrink the end below the last logged data.
    const contentEnd = latestLifelineBoundDate(extraDates);
    if (contentEnd && signedDaysBetween(desiredEnd, contentEnd) > 0) desiredEnd = contentEnd;
    // Keep a minimum span above the origin.
    const minEnd = addDays(originStart, MIN_LIFELINE_RANGE_DAYS - 1);
    if (signedDaysBetween(desiredEnd, minEnd) > 0) desiredEnd = minEnd;
    // Also never earlier than today (the tip lives at/after today).
    if (signedDaysBetween(desiredEnd, today) > 0) desiredEnd = today;
    nextFutureDays = clampLifelineFutureDays(signedDaysBetween(today, desiredEnd));
  } else {
    const deltaDays = Math.round((Number(drag.height) - Number(drag.originHeight)) / spacing);
    if (!deltaDays) return null;
    let desiredStart = addDays(originStart, -deltaDays);
    const maxStart = addDays(originEnd, -(MIN_LIFELINE_RANGE_DAYS - 1));
    if (signedDaysBetween(maxStart, desiredStart) > 0) desiredStart = maxStart;
    nextStart = desiredStart;
  }

  const nextTheme = {
    ...mapTheme,
    lifeline: {
      ...(mapTheme.lifeline || {}),
      startDate: nextStart,
      futureDays: nextFutureDays,
      viewCenterDate: null,
      viewStartDate: null,
      viewEndDate: null,
    },
    roadmap: {
      ...(mapTheme.roadmap || {}),
      top: typeof drag.top === 'number' ? drag.top : mapTheme.roadmap?.top,
    },
  };

  const synced = syncLifelineMapTheme(nextTheme, extraDates);
  const height = synced.roadmap.height;
  const originBottom = Number(drag.originTop) + Number(drag.originHeight);
  const grew = Math.abs(height - Number(drag.originHeight)) >= 2;
  // Keep the spine pinned in canvas space. Extending the end (top handle) grows
  // the spine upward from the same bottom, so pin the bottom edge.
  const top = drag.edge === 'top' && grew
    ? originBottom - height
    : Number(drag.originTop);

  return {
    ...synced,
    roadmap: {
      ...synced.roadmap,
      top,
      height,
      baseY: top + height,
    },
  };
}

/** Align lifeline spine height with day grid (bottom = start date). */
export function syncLifelineMapTheme(mapTheme, extraDates = []) {
  const config = getLifelineConfig(mapTheme, extraDates);
  const height = expectedLifelineSpineHeight(config, extraDates);
  const roadmap = mapTheme?.roadmap || {};
  const rawTop = typeof roadmap.top === 'number' ? roadmap.top : DEFAULT_MAP_THEME.roadmap.top;
  const top = rawTop < -200 || rawTop > 2500 ? DEFAULT_MAP_THEME.roadmap.top : rawTop;

  return {
    ...mapTheme,
    lifeline: {
      ...(mapTheme?.lifeline || {}),
      startDate: config.originStartDate || config.startDate,
      futureDays: config.fullFutureDays ?? config.futureDays,
      dayHeight: config.preferredDayHeight
        ?? clampLifelineDayHeight(mapTheme?.lifeline?.dayHeight || DEFAULT_LIFELINE_CONFIG.dayHeight),
      viewCenterDate: null,
      viewStartDate: null,
      viewEndDate: null,
    },
    roadmap: {
      ...roadmap,
      direction: 'vertical',
      top,
      height,
      baseY: top + height,
    },
  };
}

export function dateToTimelineY(dateStr, config, lineMetrics, layout = null) {
  if (layout) return getDayTickCanvasY(dateStr, config, layout);
  if (!lineMetrics || typeof lineMetrics.bottomY !== 'number') return null;
  const idx = daysBetween(config.startDate, toDateString(dateStr));
  return lineMetrics.bottomY - idx * config.dayHeight;
}

export function timelineYToDate(y, config, lineMetrics, layout = null) {
  const spine = layout ? getLifelineSpineMetrics(layout) : null;
  const bottomY = spine?.bottom ?? lineMetrics?.bottomY;
  if (typeof bottomY !== 'number') return null;
  const spacing = layout
    ? getLifelineDaySpacing(config, layout)
    : config.dayHeight;
  if (!spacing) return null;
  const dayCount = Math.max(1, computeLifelineDayCount(config));
  const idx = Math.round((bottomY - y) / spacing);
  const clamped = Math.max(0, Math.min(dayCount - 1, idx));
  return addDays(config.startDate, clamped);
}

/** Map canvas Y to the calendar date whose day-end is nearest (for plan milestones). */
export function timelineYToEndDate(y, config, lineMetrics, layout = null, extraDates = []) {
  const spine = layout ? getLifelineSpineMetrics(layout) : null;
  const bottomY = spine?.bottom ?? lineMetrics?.bottomY;
  if (typeof bottomY !== 'number') return null;
  const spacing = layout
    ? getLifelineDaySpacing(config, layout, extraDates)
    : config.dayHeight;
  if (!spacing) return null;
  const dayCount = Math.max(1, computeLifelineDayCount(config, extraDates));
  const idx = Math.round((bottomY - y) / spacing - 1);
  const clamped = Math.max(0, Math.min(dayCount - 1, idx));
  return addDays(config.startDate, clamped);
}

export function snapYToDay(y, config, lineMetrics, layout = null) {
  const spine = layout ? getLifelineSpineMetrics(layout) : null;
  const bottomY = spine?.bottom ?? lineMetrics?.bottomY;
  if (typeof bottomY !== 'number') return y;
  const spacing = layout
    ? getLifelineDaySpacing(config, layout)
    : config.dayHeight;
  if (!spacing) return y;
  const idx = Math.round((bottomY - y) / spacing);
  return bottomY - Math.max(0, idx) * spacing;
}

export function snapYToDayEnd(y, config, lineMetrics, layout = null, extraDates = []) {
  const date = timelineYToEndDate(y, config, lineMetrics, layout, extraDates);
  if (!date) return y;
  const endY = getDayEndCanvasY(date, config, layout, extraDates);
  return endY ?? y;
}

export function generateLifelineDayBands(config, lineMetrics, layout = null, lifelineDays = {}, zoomLevel, activityDates = null) {
  if (zoomLevel !== LIFELINE_ZOOM_LEVEL.month) return [];

  const spine = layout ? getLifelineSpineMetrics(layout) : null;
  const configured =
    typeof lineMetrics?.configured?.top === 'number' && typeof lineMetrics?.configured?.height === 'number'
      ? lineMetrics.configured
      : null;
  const top = configured?.top ?? spine?.top;
  const height = configured?.height ?? spine?.height;
  const bottomY = typeof top === 'number' && typeof height === 'number'
    ? top + height
    : spine?.bottom ?? lineMetrics?.bottomY;
  if (typeof bottomY !== 'number' || typeof height !== 'number') return [];

  const totalDays = computeLifelineDayCount(config);
  const spacing = height / Math.max(1, totalDays);
  const bands = [];

  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(config.startDate, i);
    const intensity = Math.max(
      getLifelineDayIntensity(lifelineDays[date]),
      activityDates?.has?.(date) ? 0.25 : 0
    );
    if (intensity <= 0) continue;
    bands.push({
      date,
      top: bottomY - i * spacing - spacing,
      height: spacing,
      intensity,
    });
  }

  return bands;
}

export function generateDayTicks(config, lineMetrics, layout = null, options = {}) {
  const spine = layout ? getLifelineSpineMetrics(layout) : null;
  const configured =
    typeof lineMetrics?.configured?.top === 'number' && typeof lineMetrics?.configured?.height === 'number'
      ? lineMetrics.configured
      : null;
  const top = configured?.top ?? spine?.top;
  const height = configured?.height ?? spine?.height;
  const bottomY = typeof top === 'number' && typeof height === 'number'
    ? top + height
    : spine?.bottom ?? lineMetrics?.bottomY;
  if (typeof bottomY !== 'number' || typeof height !== 'number') return [];

  const today = toDateString(new Date());
  const totalDays = computeLifelineDayCount(config);
  const spacing = height / Math.max(1, totalDays);
  const showEveryDay = spacing >= LIFELINE_ZOOM.everyDaySpacing;
  const planDates = options.planDates || null;
  const lifelineDays = options.lifelineDays || {};
  const activityDates = options.activityDates || null;
  const zoomLevel = options.zoomLevel ?? resolveLifelineZoomLevel(spacing);
  const ticks = [];

  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(config.startDate, i);
    const tickTop = bottomY - i * spacing;
    const parsed = parseDate(date);
    const dayOfWeek = parsed?.getDay() ?? 0;
    const dayOfMonth = parsed?.getDate() ?? 1;
    const monthIndex = parsed?.getMonth() ?? 0;
    const isMonthStart = dayOfMonth === 1;
    const isYearStart = isMonthStart && monthIndex === 0;
    const isWeekStart = dayOfWeek === 1;
    const isToday = date === today;
    const hasContent = hasLifelineDayContent(lifelineDays[date], date, activityDates);
    const hasPlanLabel = planDates?.has?.(date);
    const intensity = Math.max(
      getLifelineDayIntensity(lifelineDays[date]),
      activityDates?.has?.(date) ? 0.25 : 0
    );

    let isInteractive = false;
    let showLabel = false;
    let labelKind = 'day';

    switch (zoomLevel) {
      case LIFELINE_ZOOM_LEVEL.life:
        isInteractive = isYearStart || isToday || hasPlanLabel || (hasContent && isMonthStart) || i === 0 || i === totalDays - 1;
        showLabel = isYearStart || isToday || hasPlanLabel || i === 0 || i === totalDays - 1;
        labelKind = isYearStart ? 'year' : isMonthStart ? 'month' : 'day';
        break;
      case LIFELINE_ZOOM_LEVEL.time:
        isInteractive = isMonthStart || isWeekStart || isToday || hasContent || hasPlanLabel;
        showLabel = isMonthStart || isToday || hasPlanLabel || (hasContent && isWeekStart);
        labelKind = isMonthStart ? 'month' : 'day';
        break;
      case LIFELINE_ZOOM_LEVEL.month:
        isInteractive =
          isWeekStart || isMonthStart || isToday || hasContent || hasPlanLabel || intensity > 0;
        showLabel = isWeekStart || isMonthStart || isToday || hasPlanLabel;
        labelKind = isMonthStart ? 'month' : 'day';
        break;
      default:
        isInteractive =
          showEveryDay || isMonthStart || isToday || hasContent || hasPlanLabel || isWeekStart || i === 0;
        showLabel = showEveryDay || isMonthStart || i === 0;
        labelKind = isMonthStart ? 'month' : 'day';
        break;
    }

    if (!isInteractive) continue;

    ticks.push({
      dayIndex: i,
      date,
      top: tickTop,
      isToday,
      isWeekStart,
      isMonthStart,
      isYearStart,
      showLabel,
      labelKind,
      intensity,
      hasContent,
    });
  }

  return ticks;
}

export function formatDayLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
}

export function formatMonthLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
}

export function formatYearLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return String(d.getFullYear());
}

export function isLifelineProject(project) {
  return project?.isLifeline === true || project?.is_lifeline === true;
}

export function createLifelineProject() {
  const startDate = getDefaultLifelineStartDate();
  const mapTheme = syncLifelineMapTheme({
    ...DEFAULT_MAP_THEME,
    lifeline: { ...DEFAULT_LIFELINE_CONFIG, startDate },
    roadmap: {
      ...DEFAULT_MAP_THEME.roadmap,
      origin: {
        title: 'Αρχή',
        subtitle: 'Ημέρα 0',
      },
    },
  });

  return {
    id: `local-${generateId()}`,
    title: LIFELINE_TITLE,
    isLifeline: true,
    lifelineAnchorDate: null,
    stages: processStages(createStarterStages()),
    goals: [],
    notes: [],
    backlog: [],
    canvasConnections: [],
    canvasStickies: [],
    canvasObstacles: [],
    canvasResources: [],
    canvasTasks: [],
    canvasInk: [],
    whiteboardStrokes: [],
    mapTheme,
    projectBrief: normalizeProjectBrief(),
    selectedStageId: null,
    focusMode: false,
    activeView: 'projects',
    lifelineDays: {},
  };
}

export function filterRegularProjects(projects) {
  return (projects || []).filter((p) => !isLifelineProject(p));
}

export function findLifelineProject(projects) {
  return (projects || []).find(isLifelineProject) || null;
}
