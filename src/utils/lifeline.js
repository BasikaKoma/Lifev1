import { DEFAULT_MAP_THEME } from './mapTheme';
import { processStages } from './logic';
import { createStarterStages, generateId } from '../data/templates';
import { normalizeProjectBrief } from './projectBrief';

export const LIFELINE_TITLE = 'Lifeline';

export const DEFAULT_LIFELINE_CONFIG = {
  startDate: null,
  dayHeight: 24,
  futureDays: 365,
};

/**
 * Hard cap for lifeline spine/board pixel height.
 * Many GPUs clamp compositor layers around 8192px — a taller transformed
 * canvas paints as black except near the layer origin (spine tip), which is
 * exactly the "empty screen / tip at bottom" bug when centering on today.
 */
export const MAX_LIFELINE_SPINE_PX = 7200;

/**
 * Lifeline zoom:
 * - CSS scale only for zooming OUT (overview). Cap at 1 so zoom-in stays sharp.
 * - Zoom-in past 100% raises dayHeight (and may window the date range).
 */
export const LIFELINE_ZOOM = {
  minScale: 0.15,
  maxScale: 1,
  dayHeightMin: 4,
  /** Max px between day ticks before further zoom opens Day View. */
  dayHeightMax: 96,
  /** Day spacing (px) at which every calendar day gets a tick/label. */
  everyDaySpacing: 18,
  /**
   * Further zoom-in at/above this dayHeight opens Day View (semantic zoom).
   * Keep equal to dayHeightMax so spacing opens fully first.
   */
  dayViewEnterAt: 96,
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

/** Resolve semantic zoom level from effective day spacing and CSS scale. */
export function resolveLifelineZoomLevel(daySpacing, cssScale = 1) {
  const spacing = Number(daySpacing) || 0;
  const scale = Number(cssScale) || 1;
  if (scale < 0.42 || spacing < 5) return LIFELINE_ZOOM_LEVEL.life;
  if (scale < 0.88 || spacing < 13) return LIFELINE_ZOOM_LEVEL.time;
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
          : 8;
  const next = zoomIn
    ? Math.min(LIFELINE_ZOOM.dayHeightMax, current + step)
    : Math.max(LIFELINE_ZOOM.dayHeightMin, current - step);
  return next !== current ? next : null;
}

function clampDateToRange(dateStr, startStr, endStr) {
  const date = toDateString(dateStr);
  if (!date) return startStr;
  if (daysBetween(startStr, date) < 0) return startStr;
  if (daysBetween(date, endStr) < 0) return endStr;
  return date;
}

/** Choose a contiguous day window that fits the spine pixel budget at dayHeight. */
export function computeLifelineViewWindow(fullStart, fullEnd, focusDate, dayHeight) {
  const height = clampLifelineDayHeight(dayHeight);
  const fullCount = Math.max(1, daysBetween(fullStart, fullEnd) + 1);
  const maxDays = Math.max(14, Math.floor(MAX_LIFELINE_SPINE_PX / height));
  if (fullCount <= maxDays) {
    return {
      startDate: fullStart,
      endDate: fullEnd,
      dayCount: fullCount,
      windowed: false,
      viewCenterDate: null,
    };
  }

  const focus = clampDateToRange(focusDate || toDateString(new Date()), fullStart, fullEnd);
  const half = Math.floor(maxDays / 2);
  let start = addDays(focus, -half);
  if (daysBetween(fullStart, start) < 0) start = fullStart;
  let end = addDays(start, maxDays - 1);
  if (daysBetween(end, fullEnd) < 0) {
    end = fullEnd;
    start = addDays(end, -(maxDays - 1));
    if (daysBetween(fullStart, start) < 0) start = fullStart;
  }
  return {
    startDate: start,
    endDate: end,
    dayCount: daysBetween(start, end) + 1,
    windowed: true,
    viewCenterDate: focus,
  };
}

/**
 * Apply a dayHeight step and return synced theme + canvas Y for anchor date (pan preservation).
 */
export function applyLifelineDayHeightZoom(mapTheme, extraDates, zoomIn, anchorDate) {
  const nextHeight = nextLifelineDayHeight(mapTheme, extraDates, zoomIn);
  if (nextHeight == null) return null;

  const focus = toDateString(anchorDate) || toDateString(mapTheme?.lifeline?.viewCenterDate) || toDateString(new Date());
  const synced = syncLifelineMapTheme(
    {
      ...mapTheme,
      lifeline: {
        ...(mapTheme?.lifeline || {}),
        dayHeight: nextHeight,
        viewCenterDate: focus,
      },
    },
    extraDates
  );

  let anchorY = null;
  if (focus) {
    const config = getLifelineConfig(synced, extraDates);
    const layout = synced.roadmap || mapTheme?.roadmap;
    anchorY = getDayTickCanvasY(focus, config, layout, extraDates);
  }

  return { mapTheme: synced, anchorY, dayHeight: nextHeight };
}

/** Reset day density + clear detail window (CSS scale handled separately). */
export function resetLifelineDayZoom(mapTheme, extraDates = []) {
  return syncLifelineMapTheme(
    {
      ...mapTheme,
      lifeline: {
        ...(mapTheme?.lifeline || {}),
        dayHeight: DEFAULT_LIFELINE_CONFIG.dayHeight,
        viewCenterDate: null,
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

export function fitLifelineDayHeight(preferredDayHeight, dayCount) {
  const preferred = clampLifelineDayHeight(preferredDayHeight);
  const count = Math.max(1, Number(dayCount) || 1);
  const maxByBudget = Math.floor(MAX_LIFELINE_SPINE_PX / count);
  // Prefer keeping dayHeight; callers window the range when budget is tight.
  if (maxByBudget >= preferred) return preferred;
  return preferred;
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

export function getDefaultLifelineStartDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return toDateString(d);
}

export function getLifelineConfig(mapTheme, extraDates = []) {
  const raw = mapTheme?.lifeline || {};
  const preferred = clampLifelineDayHeight(raw.dayHeight || DEFAULT_LIFELINE_CONFIG.dayHeight);
  const originStartDate = toDateString(raw.startDate) || getDefaultLifelineStartDate();
  const fullFutureDays = Math.max(
    30,
    Math.min(3650, Number(raw.futureDays) || DEFAULT_LIFELINE_CONFIG.futureDays)
  );
  const fullBase = {
    startDate: originStartDate,
    dayHeight: preferred,
    futureDays: fullFutureDays,
  };
  const fullEnd = getLifelineFullEndDate(fullBase, extraDates);
  const focus =
    toDateString(raw.viewCenterDate) || toDateString(new Date());
  const window = computeLifelineViewWindow(originStartDate, fullEnd, focus, preferred);

  return {
    startDate: window.startDate,
    endDate: window.endDate,
    dayHeight: preferred,
    futureDays: fullFutureDays,
    originStartDate,
    fullFutureDays,
    windowed: window.windowed,
    viewCenterDate: window.viewCenterDate,
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
    if (str && daysBetween(origin, str) > daysBetween(origin, end)) {
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
  return Math.max(240, Math.min(MAX_LIFELINE_SPINE_PX, raw));
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

/** Align lifeline spine height with day grid (bottom = start date). */
export function syncLifelineMapTheme(mapTheme, extraDates = []) {
  const config = getLifelineConfig(mapTheme, extraDates);
  const height = expectedLifelineSpineHeight(config, extraDates);
  const roadmap = mapTheme?.roadmap || {};
  const top = typeof roadmap.top === 'number' ? roadmap.top : DEFAULT_MAP_THEME.roadmap.top;

  return {
    ...mapTheme,
    lifeline: {
      ...(mapTheme?.lifeline || {}),
      startDate: config.originStartDate || config.startDate,
      futureDays: config.fullFutureDays ?? config.futureDays,
      dayHeight: config.dayHeight,
      viewCenterDate: config.windowed ? config.viewCenterDate : null,
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
  const idx = Math.round((bottomY - y) / spacing);
  return addDays(config.startDate, Math.max(0, idx));
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
        isInteractive = isYearStart || isToday || hasPlanLabel || (hasContent && isMonthStart);
        showLabel = isYearStart || isToday || hasPlanLabel;
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
    activeView: 'roadmap',
    lifelineDays: {},
  };
}

export function filterRegularProjects(projects) {
  return (projects || []).filter((p) => !isLifelineProject(p));
}

export function findLifelineProject(projects) {
  return (projects || []).find(isLifelineProject) || null;
}
