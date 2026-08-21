import { addDays, daysBetween, parseDate, toDateString, getDayTickCanvasY, getLifelineDaySpacing, getLifelineSpineMetrics, snapYToDay, timelineYToDate } from './lifeline';

export const PLAN_DAY_HEIGHT = 24;

export function buildLifelinePlanContext(config, layout, extraDates = []) {
  if (!config || !layout) return null;
  const spine = getLifelineSpineMetrics(layout);
  return {
    config,
    layout,
    daySpacing: getLifelineDaySpacing(config, layout, extraDates),
    lineMetrics: {
      top: spine.top,
      height: spine.height,
      bottomY: spine.bottom,
      centerX: spine.centerX,
    },
  };
}

export function isLifelinePlanContext(ctx) {
  return Boolean(ctx?.config && ctx?.layout);
}

export function resolvePlanDayHeight(lifelineContext) {
  if (isLifelinePlanContext(lifelineContext)) {
    return lifelineContext.daySpacing || PLAN_DAY_HEIGHT;
  }
  return PLAN_DAY_HEIGHT;
}

export function isPlanMode(stage) {
  return stage?.planMode === true && stage?.planStartDate && stage?.planEndDate;
}

export function getPlanDurationDays(stage) {
  if (!isPlanMode(stage)) return 0;
  return daysBetween(stage.planStartDate, stage.planEndDate);
}

export function getPlanDayNumber(stage, dateStr) {
  if (!isPlanMode(stage) || !dateStr) return null;
  return daysBetween(stage.planStartDate, dateStr) + 1;
}

export function formatPlanDayMonthUpper(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  const day = d.getDate();
  const month = d.toLocaleDateString('el-GR', { month: 'short' }).toUpperCase().replace(/\./g, '');
  return `${day} ${month}`;
}

export function formatPlanDayHeader(stage, dateStr) {
  const dayNum = getPlanDayNumber(stage, dateStr);
  if (!dayNum) return '';
  return `DAY ${dayNum} · ${formatPlanDayMonthUpper(dateStr)}`;
}

export function formatPlanDayBoundary(stage, dateStr) {
  const dayNum = getPlanDayNumber(stage, dateStr);
  if (!dayNum) return '';
  return `DAY ${dayNum} — ${formatPlanDayMonthUpper(dateStr)}`;
}

export function formatPlanDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
}

export function formatPlanDateShort(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
}

export function getCheckpointSubtaskSummary(checkpoint) {
  const items = checkpoint?.checklistItems || [];
  if (!items.length) {
    return { done: 0, total: 0, label: 'Not started' };
  }
  const done = items.filter((item) => item.checked).length;
  return {
    done,
    total: items.length,
    label: done === 0 ? 'Not started' : `${done}/${items.length} tasks`,
  };
}

export function snapPlanTimelineY(y, planStartY, duration, dayHeight = PLAN_DAY_HEIGHT) {
  if (typeof planStartY !== 'number' || duration < 0) return y;
  const idx = Math.round((planStartY - y) / dayHeight);
  const clamped = Math.max(0, Math.min(duration, idx));
  return planStartY - clamped * dayHeight;
}

/** Snap plan drag Y to lifeline day grid (or fallback to fixed day height). */
export function snapPlanTimelineYForContext(
  y,
  planStartDate,
  planEndDate,
  planStartY,
  duration,
  lifelineContext,
  dayHeight = PLAN_DAY_HEIGHT
) {
  if (isLifelinePlanContext(lifelineContext)) {
    const snapped = snapYToDay(
      y,
      lifelineContext.config,
      lifelineContext.lineMetrics,
      lifelineContext.layout
    );
    const startY = getDayTickCanvasY(planStartDate, lifelineContext.config, lifelineContext.layout);
    const endY = getDayTickCanvasY(planEndDate, lifelineContext.config, lifelineContext.layout);
    if (startY != null && endY != null) {
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      return Math.max(minY, Math.min(maxY, snapped));
    }
    return snapped;
  }
  return snapPlanTimelineY(y, planStartY, duration, dayHeight);
}

/** Map a calendar plan date to canvas Y (lifeline grid or relative plan spine). */
export function resolvePlanDateY(
  dateStr,
  planStartDate,
  planStartY,
  lifelineContext,
  dayHeight = PLAN_DAY_HEIGHT
) {
  if (isLifelinePlanContext(lifelineContext) && dateStr) {
    const y = getDayTickCanvasY(dateStr, lifelineContext.config, lifelineContext.layout);
    if (y != null) return y;
  }
  return planDateToY(dateStr, planStartDate, planStartY, dayHeight);
}

/** Map canvas Y back to a calendar date on the plan / lifeline grid. */
export function resolvePlanYToDate(
  y,
  planStartDate,
  planStartY,
  maxDays,
  lifelineContext,
  dayHeight = PLAN_DAY_HEIGHT
) {
  if (isLifelinePlanContext(lifelineContext)) {
    return timelineYToDate(
      y,
      lifelineContext.config,
      lifelineContext.lineMetrics,
      lifelineContext.layout
    );
  }
  return planYToDate(y, planStartDate, planStartY, maxDays, dayHeight);
}

/** Day ticks to show on the plan spine: start, end, today, checkpoint days. */
export function generatePlanDayTicks(
  stages,
  getPlanStartYFn,
  getPlanEndYFn,
  dayHeight = PLAN_DAY_HEIGHT,
  lifelineContext = null
) {
  const ticks = [];
  const today = toDateString(new Date());
  const spacing = resolvePlanDayHeight(lifelineContext) || dayHeight;

  for (const stage of stages || []) {
    if (!isPlanMode(stage)) continue;
    const duration = getPlanDurationDays(stage);
    if (duration < 1) continue;

    const planStartY = getPlanStartYFn(stage, spacing, lifelineContext);
    const planEndY = getPlanEndYFn(stage, lifelineContext);
    if (typeof planStartY !== 'number' || typeof planEndY !== 'number') continue;

    const datesToShow = new Set([
      stage.planStartDate,
      stage.planEndDate,
      today,
    ]);

    for (const cp of stage.checkpoints || []) {
      if (cp.planDate) datesToShow.add(cp.planDate);
    }

    for (const dateStr of datesToShow) {
      if (!dateStr) continue;
      const dayOffset = daysBetween(stage.planStartDate, dateStr);
      if (dayOffset < 0 || dayOffset > duration) continue;
      const top = isLifelinePlanContext(lifelineContext)
        ? getDayTickCanvasY(dateStr, lifelineContext.config, lifelineContext.layout)
        : planStartY - dayOffset * spacing;
      if (top == null) continue;
      const dayNum = dayOffset + 1;
      const isStart = dateStr === stage.planStartDate;
      const isEnd = dateStr === stage.planEndDate;
      const isToday = dateStr === today;

      ticks.push({
        id: `${stage.id}:${dateStr}`,
        stageId: stage.id,
        date: dateStr,
        dayNum,
        top,
        label: isStart || isEnd
          ? formatPlanDayBoundary(stage, dateStr)
          : isToday
            ? `ΣΗΜΕΡΑ · ${formatPlanDayMonthUpper(dateStr)}`
            : formatPlanDayHeader(stage, dateStr),
        kind: isStart ? 'start' : isEnd ? 'end' : isToday ? 'today' : 'checkpoint',
      });
    }
  }

  return ticks.sort((a, b) => a.top - b.top);
}

/** Plan DAY labels keyed by date — shown on lifeline ticks (single label source, no plan-day-ticks overlay). */
export function collectLifelinePlanDateLabels(stages, lifelineContext) {
  if (!isLifelinePlanContext(lifelineContext)) return new Map();
  const labels = new Map();
  const today = toDateString(new Date());

  for (const stage of stages || []) {
    if (!isPlanMode(stage)) continue;
    if (stage.onRoadmap === false || typeof stage.posX !== 'number' || typeof stage.posY !== 'number') continue;
    const duration = getPlanDurationDays(stage);
    const checkpointDates = new Set(
      (stage.checkpoints || [])
        .map((cp) => cp.planDate)
        .filter(Boolean)
    );
    const dates = new Set([stage.planStartDate, stage.planEndDate]);
    if (today >= stage.planStartDate && today <= stage.planEndDate) dates.add(today);

    for (const dateStr of dates) {
      if (!dateStr || labels.has(dateStr)) continue;
      if (checkpointDates.has(dateStr)) continue;
      const dayOffset = daysBetween(stage.planStartDate, dateStr);
      if (dayOffset < 0 || dayOffset > duration) continue;
      const isStart = dateStr === stage.planStartDate;
      const isEnd = dateStr === stage.planEndDate;
      const isToday = dateStr === today;
      labels.set(
        dateStr,
        isStart || isEnd
          ? formatPlanDayBoundary(stage, dateStr)
          : isToday
            ? `ΣΗΜΕΡΑ · ${formatPlanDayMonthUpper(dateStr)}`
            : formatPlanDayHeader(stage, dateStr)
      );
    }
  }

  return labels;
}

export function getDefaultPlanDates() {
  const start = toDateString(new Date());
  const end = addDays(start, 14);
  return { planStartDate: start, planEndDate: end };
}

/** Assign evenly-spaced planDates to checkpoints without one. */
export function distributeCheckpointPlanDates(stage) {
  const checkpoints = stage?.checkpoints || [];
  if (!isPlanMode(stage) || checkpoints.length === 0) return checkpoints;

  const duration = getPlanDurationDays(stage);
  const open = checkpoints.filter((cp) => !cp.archived && !cp.done);
  const targets = open.length ? open : checkpoints;
  const count = targets.length;

  return checkpoints.map((cp) => {
    if (cp.planDate) return cp;
    const idx = targets.findIndex((t) => t.id === cp.id);
    if (idx < 0) return cp;
    const dayOffset = count <= 1 ? Math.floor(duration / 2) : Math.round((idx / (count - 1)) * duration);
    return { ...cp, planDate: addDays(stage.planStartDate, dayOffset) };
  });
}

export function shiftCheckpointPlanDates(checkpoints, dayDelta) {
  if (!dayDelta) return checkpoints;
  return checkpoints.map((cp) => {
    if (!cp.planDate) return cp;
    return { ...cp, planDate: addDays(cp.planDate, dayDelta) };
  });
}

export function buildPlanStartUpdates(stage, newStartDate, shiftCheckpoints = false) {
  const oldStart = stage.planStartDate;
  const dayDelta = oldStart ? daysBetween(oldStart, newStartDate) : 0;
  const updates = { planStartDate: toDateString(newStartDate) };

  if (shiftCheckpoints && dayDelta && stage.checkpoints?.length) {
    updates.checkpoints = shiftCheckpointPlanDates(stage.checkpoints, dayDelta);
  }

  return updates;
}

export function planDateToY(dateStr, planStartDate, planStartY, dayHeight = PLAN_DAY_HEIGHT) {
  if (!planStartDate || !dateStr || typeof planStartY !== 'number') return null;
  const offset = daysBetween(planStartDate, dateStr);
  return planStartY - offset * dayHeight;
}

export function planYToDate(y, planStartDate, planStartY, maxDays, dayHeight = PLAN_DAY_HEIGHT) {
  if (!planStartDate || typeof planStartY !== 'number') return null;
  const idx = Math.round((planStartY - y) / dayHeight);
  const clamped = Math.max(0, Math.min(maxDays, idx));
  return addDays(planStartDate, clamped);
}
