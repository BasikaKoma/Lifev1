import {
  isPlanMode,
  getPlanDurationDays,
  PLAN_DAY_HEIGHT,
  resolvePlanDateY,
  resolvePlanYToDate,
  resolvePlanDayHeight,
  isLifelinePlanContext,
  shiftCheckpointPlanDates,
  buildLifelinePlanContext,
} from './planMode';
import { getDayTickCanvasY, getDayEndCanvasY, daysBetween, snapYToDay, snapYToDayEnd, timelineYToDate, timelineYToEndDate, addDays, getLifelineConfig } from './lifeline';
import { getRoadmapLayout } from './mapTheme';

const CARD_W = 320;
const CARD_H = 200;
const IDEA_W = 240;
const IDEA_H = 120;
const GAP_X = 48;
const GAP_Y = 40;
const ORIGIN_X = 48;
const ORIGIN_Y = 80;
const MAJOR_W = 360;
const CENTER_X = 480;
const SIDE_GAP = 56;
/** Extra offset so on-roadmap milestones clear lifeline date labels. */
const MILESTONE_SIDE_GAP = 104;
/** Bottom of the timeline — first milestones start here and grow upward. */
const BASE_Y = 880;
/** Vertical spacing between checkpoint dots below a milestone. */
export const CHECKPOINT_GAP = 84;
export const CHECKPOINT_DOT_RADIUS = 9;
export const CHECKPOINT_LABEL_GAP = 16;

export const DEFAULT_ROADMAP_LAYOUT = {
  direction: 'vertical',
  spacing: 1,
  centerX: CENTER_X,
  baseY: BASE_Y,
};

export {
  CARD_W,
  CARD_H,
  IDEA_W,
  IDEA_H,
  ORIGIN_X,
  ORIGIN_Y,
  GAP_X,
  GAP_Y,
  MAJOR_W,
  CENTER_X,
  SIDE_GAP,
  MILESTONE_SIDE_GAP,
  BASE_Y,
};

export function getMilestoneWidth() {
  return MAJOR_W;
}

export function getMilestoneHeight() {
  return CARD_H + 24;
}

function clampSpacing(spacing) {
  return Math.min(2, Math.max(0.5, Number(spacing) || 1));
}

function getBaseY(layout = {}) {
  return layout.baseY ?? BASE_Y;
}

export function resolveRoadmapSide(posX, layout = {}) {
  const centerX = layout.centerX ?? CENTER_X;
  const w = getMilestoneWidth();
  const cardCenter = posX + w / 2;
  return cardCenter < centerX ? 'left' : 'right';
}

export function getAttachedPosXForWidth(width, side, layout = {}, gap = SIDE_GAP) {
  const centerX = layout.centerX ?? CENTER_X;
  if (side === 'left') return centerX - gap - width;
  return centerX + gap;
}

export function getAttachedPosX(_stage, side, layout = {}) {
  return getAttachedPosXForWidth(getMilestoneWidth(), side, layout, MILESTONE_SIDE_GAP);
}

export const ROADMAP_ATTACH_DISTANCE = 180;
export const ROADMAP_DETACH_DISTANCE = 160;

function shouldAttachToRoadmap(posX, w, layout = {}, gap = SIDE_GAP) {
  const centerX = layout.centerX ?? CENTER_X;
  const cardCenterX = posX + w / 2;
  const distFromLine = Math.abs(cardCenterX - centerX);
  const leftX = getAttachedPosXForWidth(w, 'left', layout, gap);
  const rightX = getAttachedPosXForWidth(w, 'right', layout, gap);
  const nearSlot =
    Math.min(Math.abs(posX - leftX), Math.abs(posX - rightX)) <= ROADMAP_ATTACH_DISTANCE;
  const nearCenter = distFromLine <= gap + w / 2 + ROADMAP_ATTACH_DISTANCE;
  return nearSlot || nearCenter;
}

function shouldDetachFromRoadmap(posX, w, layout = {}, gap = SIDE_GAP) {
  const centerX = layout.centerX ?? CENTER_X;
  const cardCenterX = posX + w / 2;
  return Math.abs(cardCenterX - centerX) > gap + w / 2 + ROADMAP_DETACH_DISTANCE;
}

function snapCanvasItemToRoadmap(posX, posY, layout, size) {
  const w = size.w || IDEA_W;
  const h = size.h || IDEA_H;
  const centerY = posY + h / 2;
  const side = posX + w / 2 < (layout.centerX ?? CENTER_X) ? 'left' : 'right';
  return {
    onRoadmap: true,
    timelineY: Math.max(24 + h / 2, centerY),
    roadmapSide: side,
    x: getAttachedPosXForWidth(w, side, layout),
    y: Math.max(24, centerY - h / 2),
  };
}

/** Generic attach/detach for ideas, stickies, or any free card. */
export function resolveCanvasItemDrag(item, posX, posY, layout = DEFAULT_ROADMAP_LAYOUT, size = { w: IDEA_W, h: IDEA_H }) {
  const w = size.w || IDEA_W;
  const h = size.h || IDEA_H;
  const isAttached = item?.onRoadmap === true;

  if (isAttached) {
    if (shouldDetachFromRoadmap(posX, w, layout)) {
      return {
        onRoadmap: false,
        timelineY: null,
        roadmapSide: null,
        x: posX,
        y: posY,
      };
    }
    return snapCanvasItemToRoadmap(posX, posY, layout, size);
  }

  if (shouldAttachToRoadmap(posX, w, layout)) {
    return snapCanvasItemToRoadmap(posX, posY, layout, size);
  }

  return {
    onRoadmap: false,
    timelineY: null,
    roadmapSide: null,
    x: posX,
    y: posY,
  };
}

export function isItemOnRoadmap(item) {
  return item?.onRoadmap === true && typeof item?.timelineY === 'number';
}

export function syncHorizontalRoadmapPositions(stages, layout = {}) {
  const spacing = clampSpacing(layout.spacing);
  const gapX = GAP_X * spacing;
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  let x = ORIGIN_X;

  return sorted.map((stage) => {
    const w = getMilestoneWidth();
    const next = { ...stage, posX: x, posY: ORIGIN_Y };
    x += w + gapX;
    return next;
  });
}

export function isOnRoadmap(stage) {
  if (!isStageOnCanvas(stage)) return false;
  if (stage.onRoadmap === false) return false;
  return true;
}

export function getTimelineY(stage) {
  if (typeof stage?.timelineY === 'number') return stage.timelineY;
  if (typeof stage?.posY === 'number') {
    return stage.posY + getMilestoneHeight() / 2;
  }
  return getBaseY();
}

export function getPlanEndY(stage, lifelineContext = null) {
  if (isLifelinePlanContext(lifelineContext) && isPlanMode(stage)) {
    const y = getDayEndCanvasY(stage.planEndDate, lifelineContext.config, lifelineContext.layout);
    if (y != null) return y;
  }
  return getTimelineY(stage);
}

/** Snap on-roadmap plan milestone to the end of planEndDate on the lifeline grid. */
export function snapLifelinePlanMilestoneToEndDate(stage, lifelineContext, layout = DEFAULT_ROADMAP_LAYOUT) {
  if (!isLifelinePlanContext(lifelineContext) || !isPlanMode(stage) || !isOnRoadmap(stage)) return stage;
  const endY = getDayEndCanvasY(stage.planEndDate, lifelineContext.config, lifelineContext.layout);
  if (endY == null) return stage;
  return positionMilestoneOnTimeline(stage, endY, layout, stage.roadmapSide || 'right');
}

/** Move plan end (and shift plan range) when the milestone is dragged on the lifeline. */
export function syncLifelinePlanMilestoneFromTimelineY(
  stage,
  timelineY,
  lifelineContext,
  layout = DEFAULT_ROADMAP_LAYOUT
) {
  if (!isLifelinePlanContext(lifelineContext) || !isPlanMode(stage) || !isOnRoadmap(stage)) {
    return positionMilestoneOnTimeline(stage, timelineY, layout, stage.roadmapSide || 'right');
  }

  const snappedY = snapYToDayEnd(
    timelineY,
    lifelineContext.config,
    lifelineContext.lineMetrics,
    lifelineContext.layout
  );
  const newEndDate = timelineYToEndDate(
    snappedY,
    lifelineContext.config,
    lifelineContext.lineMetrics,
    lifelineContext.layout
  );
  if (!newEndDate) {
    return snapLifelinePlanMilestoneToEndDate(stage, lifelineContext, layout);
  }

  const duration = getPlanDurationDays(stage);
  const newStartDate = addDays(newEndDate, -duration);
  const dayDelta = daysBetween(stage.planStartDate, newStartDate);

  const updated = {
    ...stage,
    planEndDate: newEndDate,
    planStartDate: newStartDate,
    checkpoints:
      dayDelta !== 0
        ? shiftCheckpointPlanDates(stage.checkpoints || [], dayDelta)
        : stage.checkpoints,
  };

  return snapLifelinePlanMilestoneToEndDate(updated, lifelineContext, layout);
}

/** Preview drag on lifeline — move card without rewriting plan dates until commit. */
export function previewLifelinePlanMilestoneDrag(
  stage,
  posX,
  posY,
  layout = DEFAULT_ROADMAP_LAYOUT,
  lifelineContext = null
) {
  const h = getMilestoneHeight();
  const centerY = posY + h / 2;
  const side = resolveRoadmapSide(posX, layout);

  if (!isOnRoadmap(stage)) return stage;

  if (isLifelinePlanContext(lifelineContext) && isPlanMode(stage)) {
    const endY = snapYToDayEnd(
      centerY,
      lifelineContext.config,
      lifelineContext.lineMetrics,
      lifelineContext.layout
    );
    return positionMilestoneOnTimeline(stage, endY, layout, side);
  }

  return positionMilestoneOnTimeline(stage, centerY, layout, side);
}

export function alignLifelinePlanStages(stages, mapTheme, extraDates = [], lifelineContext = null) {
  const layout = getRoadmapLayout(mapTheme);
  const ctx =
    lifelineContext ||
    buildLifelinePlanContext(getLifelineConfig(mapTheme, extraDates), layout, extraDates);
  if (!isLifelinePlanContext(ctx)) return stages;
  return stages.map((s) => snapLifelinePlanMilestoneToEndDate(s, ctx, layout));
}

export function getPlanStartY(stage, dayHeight = PLAN_DAY_HEIGHT, lifelineContext = null) {
  if (!isPlanMode(stage)) return null;
  if (isLifelinePlanContext(lifelineContext)) {
    const y = getDayTickCanvasY(stage.planStartDate, lifelineContext.config, lifelineContext.layout);
    if (y != null) return y;
  }
  const endY = getPlanEndY(stage, lifelineContext);
  const days = getPlanDurationDays(stage);
  const spacing = resolvePlanDayHeight(lifelineContext) || dayHeight;
  return endY + Math.max(days, 1) * spacing;
}

export function collectPlanWindows(stages, layout = {}, dayHeight = PLAN_DAY_HEIGHT, lifelineContext = null) {
  const windows = [];
  const spacing = resolvePlanDayHeight(lifelineContext) || dayHeight;
  for (const stage of stages || []) {
    if (!isPlanMode(stage) || !isOnRoadmap(stage)) continue;
    const endY = getPlanEndY(stage, lifelineContext);
    const startY = getPlanStartY(stage, spacing, lifelineContext);
    const h = getMilestoneHeight();
    const segmentEnd = isLifelinePlanContext(lifelineContext) ? endY : endY - h / 2;
    windows.push({
      stageId: stage.id,
      title: stage.title,
      planGoal: stage.planGoal || '',
      planStartDate: stage.planStartDate,
      planEndDate: stage.planEndDate,
      durationDays: getPlanDurationDays(stage),
      startY,
      endY: segmentEnd,
      top: Math.min(startY, segmentEnd),
      height: Math.abs(startY - segmentEnd),
    });
  }
  return windows;
}

export function getCheckpointTimelinePositions(stage, layout = DEFAULT_ROADMAP_LAYOUT, lifelineContext = null) {
  // Path: Start → checkpoints → Milestone. Array order is journey order — first item
  // is farthest from the milestone (near Start), last item sits closest to the milestone.
  const checkpoints = stage?.checkpoints || [];
  if (!checkpoints.length || !isOnRoadmap(stage)) return [];

  const milestoneCenterY = getTimelineY(stage);
  const h = getMilestoneHeight();
  const bottomY = milestoneCenterY + h / 2;
  const milestoneSide = stage.roadmapSide === 'left' || stage.roadmapSide === 'right' ? stage.roadmapSide : 'right';
  const oppositeSide = milestoneSide === 'left' ? 'right' : 'left';
  const count = checkpoints.length;
  const spacing = resolvePlanDayHeight(lifelineContext);
  const planStartY = isPlanMode(stage) ? getPlanStartY(stage, spacing, lifelineContext) : null;
  const planEndY = isPlanMode(stage) ? getPlanEndY(stage, lifelineContext) : null;

  return checkpoints.map((checkpoint, index) => {
    let timelineY;
    if (planStartY != null && checkpoint.planDate) {
      timelineY = resolvePlanDateY(
        checkpoint.planDate,
        stage.planStartDate,
        planStartY,
        lifelineContext,
        spacing
      );
    } else if (planStartY != null && planEndY != null && isLifelinePlanContext(lifelineContext)) {
      const t = count <= 1 ? 0.5 : index / Math.max(1, count - 1);
      timelineY = planStartY + (planEndY - planStartY) * t;
    } else if (planStartY != null) {
      const duration = getPlanDurationDays(stage);
      const dayOffset = count <= 1 ? Math.floor(duration / 2) : Math.round((index / Math.max(1, count - 1)) * duration);
      timelineY = planStartY - dayOffset * spacing;
    } else {
      timelineY = bottomY + CHECKPOINT_GAP + (count - 1 - index) * CHECKPOINT_GAP;
    }

    return {
      ...checkpoint,
      timelineY,
      roadmapSide:
        checkpoint.roadmapSide === 'left' || checkpoint.roadmapSide === 'right'
          ? checkpoint.roadmapSide
          : oppositeSide,
      stageId: stage.id,
    };
  });
}

/** Reorder checkpoints by dropping one at a Y position on the spine. */
export function reorderCheckpointsByTimelineY(
  stage,
  checkpointId,
  dropTimelineY,
  layout = DEFAULT_ROADMAP_LAYOUT,
  lifelineContext = null
) {
  if (isPlanMode(stage)) {
    return moveCheckpointToPlanY(stage, checkpointId, dropTimelineY, lifelineContext);
  }

  const checkpoints = [...(stage?.checkpoints || [])];
  const fromIndex = checkpoints.findIndex((cp) => cp.id === checkpointId);
  if (fromIndex < 0 || checkpoints.length <= 1) return checkpoints;

  const count = checkpoints.length;
  const milestoneCenterY = getTimelineY(stage);
  const h = getMilestoneHeight();
  const bottomY = milestoneCenterY + h / 2;

  // Array index 0 = near Start (highest Y), index count-1 = near milestone (lowest Y).
  const slotYs = Array.from(
    { length: count },
    (_, i) => bottomY + CHECKPOINT_GAP + (count - 1 - i) * CHECKPOINT_GAP
  );

  let targetIndex = fromIndex;
  if (dropTimelineY >= slotYs[0]) {
    targetIndex = 0;
  } else if (dropTimelineY <= slotYs[count - 1]) {
    targetIndex = count - 1;
  } else {
    for (let i = 0; i < count - 1; i += 1) {
      const mid = (slotYs[i] + slotYs[i + 1]) / 2;
      if (dropTimelineY >= mid) {
        targetIndex = i;
        break;
      }
      if (i === count - 2) {
        targetIndex = count - 1;
      }
    }
  }

  if (targetIndex === fromIndex) return checkpoints;

  const [item] = checkpoints.splice(fromIndex, 1);
  let insertAt = targetIndex;
  if (fromIndex < targetIndex) insertAt -= 1;
  checkpoints.splice(insertAt, 0, item);
  return checkpoints;
}

/** Minimum vertical gap (px) before two lifeline plan checkpoints can share the same side. */
export const LIFELINE_PLAN_CHECKPOINT_MIN_GAP = 68;

function hasPinnedCheckpointSide(checkpoint) {
  return Boolean(checkpoint.roadmapSidePinned);
}

/**
 * On Lifeline, place close plan checkpoints on opposite sides of the spine to avoid overlap.
 * Respects checkpoints with an explicit roadmapSide (e.g. after manual drag).
 */
export function assignLifelineCheckpointSides(checkpoints, lifelineContext = null) {
  if (!isLifelinePlanContext(lifelineContext)) return checkpoints;

  const planEntries = checkpoints
    .map((cp, index) => ({ cp, index }))
    .filter(({ cp }) => cp.stagePlanMode);
  if (planEntries.length <= 1) return checkpoints;

  const daySpacing = lifelineContext.daySpacing || PLAN_DAY_HEIGHT;
  const minGap = Math.max(LIFELINE_PLAN_CHECKPOINT_MIN_GAP, daySpacing * 1.35);
  const sorted = [...planEntries].sort((a, b) => a.cp.timelineY - b.cp.timelineY);

  const sideByKey = new Map();
  let lastRightY = null;
  let lastLeftY = null;

  for (const { cp } of sorted) {
    const key = `${cp.stageId}:${cp.id}`;

    if (hasPinnedCheckpointSide(cp)) {
      sideByKey.set(key, cp.side);
      if (cp.side === 'right') lastRightY = cp.timelineY;
      else lastLeftY = cp.timelineY;
      continue;
    }

    const gapRight = lastRightY == null ? Infinity : Math.abs(cp.timelineY - lastRightY);
    const gapLeft = lastLeftY == null ? Infinity : Math.abs(cp.timelineY - lastLeftY);

    let side;
    if (gapRight >= minGap && gapLeft >= minGap) {
      side = 'right';
    } else if (gapRight >= minGap) {
      side = 'right';
    } else if (gapLeft >= minGap) {
      side = 'left';
    } else {
      side = gapLeft > gapRight ? 'left' : 'right';
    }

    sideByKey.set(key, side);
    if (side === 'right') lastRightY = cp.timelineY;
    else lastLeftY = cp.timelineY;
  }

  return checkpoints.map((cp) => {
    const side = sideByKey.get(`${cp.stageId}:${cp.id}`);
    return side ? { ...cp, side } : cp;
  });
}

/** Vertical radius (px) around a right-side plan checkpoint where lifeline day labels are hidden. */
export const LIFELINE_PLAN_CHECKPOINT_LABEL_HIDE_RADIUS = 52;

export function collectLifelineHiddenTickRanges(checkpoints) {
  return (checkpoints || [])
    .filter((cp) => cp.stagePlanMode && cp.side === 'right' && typeof cp.timelineY === 'number')
    .map((cp) => ({
      minY: cp.timelineY - LIFELINE_PLAN_CHECKPOINT_LABEL_HIDE_RADIUS,
      maxY: cp.timelineY + LIFELINE_PLAN_CHECKPOINT_LABEL_HIDE_RADIUS,
    }));
}

export function isLifelineTickLabelHidden(tickTop, hiddenTickRanges = []) {
  if (typeof tickTop !== 'number') return false;
  return hiddenTickRanges.some((range) => tickTop >= range.minY && tickTop <= range.maxY);
}

export function collectRoadmapCheckpoints(stages, layout = DEFAULT_ROADMAP_LAYOUT, lifelineContext = null) {
  const result = [];
  const spacing = resolvePlanDayHeight(lifelineContext);
  for (const stage of stages || []) {
    if (!isOnRoadmap(stage)) continue;
    const stagePlan = isPlanMode(stage);
    for (const checkpoint of getCheckpointTimelinePositions(stage, layout, lifelineContext)) {
      const rawCheckpoint = (stage.checkpoints || []).find((c) => c.id === checkpoint.id);
      const pinnedSide = rawCheckpoint?.roadmapSide;
      const roadmapSidePinned = pinnedSide === 'left' || pinnedSide === 'right';
      result.push({
        ...checkpoint,
        stageId: stage.id,
        stageTitle: stage.title,
        stagePlanMode: stagePlan,
        planStartDate: stage.planStartDate,
        planEndDate: stage.planEndDate,
        planDurationDays: getPlanDurationDays(stage),
        planStartY: stagePlan ? getPlanStartY(stage, spacing, lifelineContext) : null,
        roadmapSidePinned,
        side: roadmapSidePinned
          ? pinnedSide
          : (checkpoint.roadmapSide === 'left' || checkpoint.roadmapSide === 'right'
            ? checkpoint.roadmapSide
            : (checkpoint.side || 'right')),
      });
    }
  }
  return assignLifelineCheckpointSides(result, lifelineContext);
}

export function moveCheckpointToPlanY(stage, checkpointId, dropTimelineY, lifelineContext = null) {
  if (!isPlanMode(stage)) return stage?.checkpoints || [];
  const spacing = resolvePlanDayHeight(lifelineContext);
  const planStartY = getPlanStartY(stage, spacing, lifelineContext);
  const duration = getPlanDurationDays(stage);
  const newDate = resolvePlanYToDate(
    dropTimelineY,
    stage.planStartDate,
    planStartY,
    duration,
    lifelineContext,
    spacing
  );
  if (!newDate) return stage.checkpoints || [];
  const offset = daysBetween(stage.planStartDate, newDate);
  if (offset < 0 || offset > duration) return stage.checkpoints || [];
  return (stage.checkpoints || []).map((cp) =>
    cp.id === checkpointId ? { ...cp, planDate: newDate } : cp
  );
}

function isPlanCheckpointComplete(checkpoint) {
  return Boolean(checkpoint?.done || checkpoint?.archived);
}

function isPlanStageComplete(stage) {
  return stage?.status === 'Done' || Boolean(stage?.done);
}

/** Extra px past a done checkpoint so the glow sits through the spine dot. */
const PLAN_PROGRESS_CHECKPOINT_PAD = 10;

export function collectPlanProgressSegments(stages, layout = DEFAULT_ROADMAP_LAYOUT, lifelineContext = null) {
  const segments = [];
  const spacing = resolvePlanDayHeight(lifelineContext);
  const isLifeline = isLifelinePlanContext(lifelineContext);
  for (const stage of stages || []) {
    if (!isPlanMode(stage) || !isOnRoadmap(stage)) continue;
    const planStartY = getPlanStartY(stage, spacing, lifelineContext);
    const planEndY = getPlanEndY(stage, lifelineContext);
    if (planStartY == null || planEndY == null) continue;

    const h = getMilestoneHeight();
    const segmentEnd = isLifeline ? planEndY : planEndY - h / 2;
    const positions = getCheckpointTimelinePositions(stage, layout, lifelineContext);
    const completed = positions.filter(isPlanCheckpointComplete);
    const allCheckpointsDone = positions.length > 0 && completed.length === positions.length;
    const stageDone = isPlanStageComplete(stage);
    const fillToEnd = stageDone || allCheckpointsDone;

    let endY = null;
    if (fillToEnd) {
      endY = segmentEnd;
    } else if (completed.length) {
      const furthestY = Math.min(...completed.map((cp) => cp.timelineY));
      endY = Math.max(segmentEnd, furthestY - PLAN_PROGRESS_CHECKPOINT_PAD);
    }

    if (endY == null) continue;

    const top = Math.min(planStartY, endY);
    const height = Math.abs(planStartY - endY);
    if (height < 1) continue;

    segments.push({
      stageId: stage.id,
      top,
      height,
      startY: planStartY,
      endY,
      complete: fillToEnd,
    });
  }
  return segments;
}

export function positionMilestoneOnTimeline(stage, timelineY, layout = {}, sideHint) {
  const h = getMilestoneHeight();
  const side =
    sideHint === 'left' || sideHint === 'right'
      ? sideHint
      : stage.roadmapSide === 'left' || stage.roadmapSide === 'right'
        ? stage.roadmapSide
        : 'right';
  const clampedY = Math.max(40 + h / 2, timelineY);
  return {
    ...stage,
    onRoadmap: true,
    timelineY: clampedY,
    posX: getAttachedPosX(stage, side, layout),
    posY: clampedY - h / 2,
    roadmapSide: side,
  };
}

export function detachMilestoneFromRoadmap(stage, posX, posY) {
  return {
    ...stage,
    onRoadmap: false,
    timelineY: null,
    posX,
    posY,
    roadmapSide: null,
  };
}

/** Drag handler: left/right attach, card+dot sync, detach when pulled away. */
export function resolveMilestoneDrag(
  stage,
  posX,
  posY,
  layout = DEFAULT_ROADMAP_LAYOUT,
  lifelineContext = null,
  { commitPlanDates = true } = {}
) {
  const h = getMilestoneHeight();
  const w = getMilestoneWidth();
  const centerY = posY + h / 2;
  const side = resolveRoadmapSide(posX, layout);

  if (isOnRoadmap(stage)) {
    if (shouldDetachFromRoadmap(posX, w, layout, MILESTONE_SIDE_GAP)) {
      return detachMilestoneFromRoadmap(stage, posX, posY);
    }
    if (isLifelinePlanContext(lifelineContext) && isPlanMode(stage)) {
      if (commitPlanDates) {
        return syncLifelinePlanMilestoneFromTimelineY(stage, centerY, lifelineContext, layout);
      }
      return previewLifelinePlanMilestoneDrag(stage, posX, posY, layout, lifelineContext);
    }
    return positionMilestoneOnTimeline(stage, centerY, layout, side);
  }

  if (shouldAttachToRoadmap(posX, w, layout, MILESTONE_SIDE_GAP)) {
    let next = positionMilestoneOnTimeline(stage, centerY, layout, side);
    if (isLifelinePlanContext(lifelineContext) && isPlanMode(next)) {
      next = snapLifelinePlanMilestoneToEndDate(next, lifelineContext, layout);
    }
    return next;
  }

  return {
    ...stage,
    onRoadmap: false,
    timelineY: null,
    posX,
    posY,
    roadmapSide: null,
  };
}

/** Move spine and every item attached to the roadmap together. */
export function shiftRoadmapAttachedItems(
  { stages = [], backlog = [], canvasStickies = [], canvasObstacles = [], canvasResources = [], canvasTasks = [] },
  oldLayout,
  newLayout
) {
  const dx = newLayout.centerX - oldLayout.centerX;
  const dy = newLayout.top - oldLayout.top;

  const shiftedStages = stages.map((stage) => {
    if (!isOnRoadmap(stage)) return stage;
    return positionMilestoneOnTimeline(
      stage,
      getTimelineY(stage) + dy,
      newLayout,
      stage.roadmapSide || 'right'
    );
  });

  const shiftCanvasItem = (item, size) => {
    if (!isItemOnRoadmap(item)) return item;
    const next = resolveCanvasItemDrag(
      { ...item, onRoadmap: true },
      (item.canvasX ?? 0) + dx,
      (item.canvasY ?? 0) + dy,
      newLayout,
      size
    );
    return {
      ...item,
      canvasX: next.x,
      canvasY: next.y,
      onRoadmap: true,
      timelineY: next.timelineY,
      roadmapSide: next.roadmapSide,
    };
  };

  const stagesWithIdeas = shiftedStages.map((stage) => ({
    ...stage,
    ideas: (stage.ideas || []).map((idea) => shiftCanvasItem(idea, { w: IDEA_W, h: IDEA_H })),
  }));

  return {
    stages: stagesWithIdeas,
    backlog: (backlog || []).map((idea) => shiftCanvasItem(idea, { w: IDEA_W, h: IDEA_H })),
    canvasStickies: (canvasStickies || []).map((sticky) => {
      const w = sticky.width || 200;
      const h = sticky.height || 140;
      return shiftCanvasItem(sticky, { w, h });
    }),
    canvasObstacles: (canvasObstacles || []).map((item) =>
      shiftCanvasItem(item, { w: IDEA_W, h: IDEA_H })
    ),
    canvasResources: (canvasResources || []).map((item) =>
      shiftCanvasItem(item, { w: IDEA_W, h: IDEA_H })
    ),
    canvasTasks: (canvasTasks || []).map((item) =>
      shiftCanvasItem(item, { w: IDEA_W, h: IDEA_H })
    ),
  };
}

export function syncVerticalRoadmapPositions(stages, layout = {}) {
  const spacing = clampSpacing(layout.spacing);
  const gapY = GAP_Y * spacing;
  const baseY = getBaseY(layout);
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const freeStages = sorted.filter((s) => isStageOnCanvas(s) && s.onRoadmap === false);
  const roadmapStages = sorted.filter((s) => !(isStageOnCanvas(s) && s.onRoadmap === false));

  let y = baseY;
  const positionedRoadmap = roadmapStages.map((stage, index) => {
    const h = getMilestoneHeight();
    const hasCustomY = typeof stage.timelineY === 'number' && isStageOnCanvas(stage);
    const anchorY = hasCustomY ? stage.timelineY : y;
    const side =
      stage.roadmapSide === 'left' || stage.roadmapSide === 'right'
        ? stage.roadmapSide
        : index % 2 === 0
          ? 'right'
          : 'left';
    const positioned = positionMilestoneOnTimeline(stage, anchorY, layout, side);
    if (!hasCustomY) {
      y -= h + gapY;
    }
    return positioned;
  });

  const byId = new Map([
    ...positionedRoadmap.map((s) => [s.id, s]),
    ...freeStages.map((s) => [s.id, { ...s, onRoadmap: false, timelineY: null }]),
  ]);

  return sorted.map((s) => byId.get(s.id) || s);
}

export function syncRoadmapPositions(stages, layout = DEFAULT_ROADMAP_LAYOUT) {
  if (!stages?.length) return stages || [];
  if (layout.direction === 'horizontal') {
    return syncHorizontalRoadmapPositions(stages, layout);
  }
  return syncVerticalRoadmapPositions(stages, layout);
}

export function getDefaultStagePosition(index, layout = DEFAULT_ROADMAP_LAYOUT) {
  if (layout.direction === 'horizontal') {
    let x = ORIGIN_X;
    for (let i = 0; i < index; i += 1) {
      x += getMilestoneWidth() + GAP_X;
    }
    return { posX: x, posY: ORIGIN_Y };
  }

  const gapY = GAP_Y * clampSpacing(layout.spacing);
  const h = getMilestoneHeight();
  const baseY = getBaseY(layout);
  const anchorY = baseY - index * (h + gapY);
  const side = index % 2 === 0 ? 'right' : 'left';
  return positionMilestoneOnTimeline({}, anchorY, layout, side);
}

export function getNextStagePosition(stages, layout = DEFAULT_ROADMAP_LAYOUT) {
  const onLine = stages.filter(isOnRoadmap);
  if (!onLine.length) return getDefaultStagePosition(0, layout);

  if (layout.direction === 'horizontal') {
    const sorted = [...onLine].sort((a, b) => a.order - b.order);
    let x = ORIGIN_X;
    for (const stage of sorted) {
      x += getMilestoneWidth() + GAP_X * clampSpacing(layout.spacing);
    }
    return { posX: x, posY: ORIGIN_Y };
  }

  const sorted = [...onLine].sort((a, b) => getTimelineY(a) - getTimelineY(b));
  const topMost = sorted[0];
  const gapY = GAP_Y * clampSpacing(layout.spacing);
  const h = getMilestoneHeight();
  const anchorY = getTimelineY(topMost) - getMilestoneHeight() / 2 - gapY - h / 2;
  const side = onLine.length % 2 === 0 ? 'right' : 'left';
  const pos = positionMilestoneOnTimeline({}, anchorY, layout, side);
  return {
    posX: pos.posX,
    posY: pos.posY,
    timelineY: pos.timelineY,
    onRoadmap: true,
    roadmapSide: side,
  };
}

export function getCenterLineMetrics(stages, layout = DEFAULT_ROADMAP_LAYOUT, extras = {}) {
  const centerX = layout.centerX ?? CENTER_X;
  const baseY = getBaseY(layout);
  const lifelineContext = extras.lifelineContext || null;
  const spacing = resolvePlanDayHeight(lifelineContext);
  const ideas = extras.ideas || [];
  const stickies = extras.stickies || [];
  const obstacles = extras.obstacles || [];
  const resources = extras.resources || [];
  const tasks = extras.tasks || [];

  const milestoneNodes = stages.filter(isOnRoadmap).map((stage) => ({
    id: `milestone:${stage.id}`,
    kind: 'milestone',
    refId: stage.id,
    top: getTimelineY(stage),
    status: stage.status,
    side: stage.roadmapSide || 'right',
  }));

  const planStartNodes = stages
    .filter((stage) => isOnRoadmap(stage) && isPlanMode(stage))
    .map((stage) => ({
      id: `planStart:${stage.id}`,
      kind: 'planStart',
      refId: stage.id,
      title: stage.title,
      top: getPlanStartY(stage, spacing, lifelineContext),
      status: stage.status,
      side: stage.roadmapSide || 'right',
    }));

  const checkpointNodes = collectRoadmapCheckpoints(stages, layout, lifelineContext)
    .filter((checkpoint) => {
      const stage = stages.find((s) => s.id === checkpoint.stageId);
      return !isPlanMode(stage);
    })
    .map((checkpoint) => ({
    id: `checkpoint:${checkpoint.stageId}:${checkpoint.id}`,
    kind: 'checkpoint',
    refId: checkpoint.id,
    stageId: checkpoint.stageId,
    title: checkpoint.title || 'Checkpoint',
    top: checkpoint.timelineY,
    status: checkpoint.done || checkpoint.archived ? 'Done' : 'Locked',
    side: checkpoint.side || checkpoint.roadmapSide || 'right',
  }));

  const ideaNodes = ideas.filter(isItemOnRoadmap).map((idea) => ({
    id: `idea:${idea.source || 'backlog'}:${idea.id}`,
    kind: 'idea',
    refId: idea.id,
    top: idea.timelineY,
    status: idea.status || 'Locked',
    side: idea.roadmapSide || 'right',
  }));

  const stickyNodes = stickies.filter(isItemOnRoadmap).map((sticky) => ({
    id: `sticky:${sticky.id}`,
    kind: 'sticky',
    refId: sticky.id,
    top: sticky.timelineY,
    status: 'Locked',
    side: sticky.roadmapSide || 'right',
  }));

  const obstacleNodes = obstacles.filter(isItemOnRoadmap).map((item) => ({
    id: `obstacle:${item.id}`,
    kind: 'obstacle',
    refId: item.id,
    top: item.timelineY,
    status: item.status || 'Open',
    side: item.roadmapSide || 'right',
  }));

  const resourceNodes = resources.filter(isItemOnRoadmap).map((item) => ({
    id: `resource:${item.id}`,
    kind: 'resource',
    refId: item.id,
    top: item.timelineY,
    status: item.status || 'Needed',
    side: item.roadmapSide || 'right',
  }));

  const taskNodes = tasks.filter(isItemOnRoadmap).map((item) => ({
    id: `task:${item.id}`,
    kind: 'task',
    refId: item.id,
    top: item.timelineY,
    status: item.status || 'Todo',
    side: item.roadmapSide || 'right',
  }));

  const nodes = [
    ...milestoneNodes,
    ...planStartNodes,
    ...checkpointNodes,
    ...ideaNodes,
    ...stickyNodes,
    ...obstacleNodes,
    ...resourceNodes,
    ...taskNodes,
  ].sort((a, b) => a.top - b.top);

  const spineTop = typeof layout.top === 'number' ? layout.top : baseY - 800;
  const spineHeight = typeof layout.height === 'number' ? Math.max(240, layout.height) : 1000;
  const spineBottom = spineTop + spineHeight;

  const pad = 80;
  const contentTops = nodes.map((n) => n.top);
  const minContent = contentTops.length ? Math.min(...contentTops) : spineTop + pad;
  const maxContent = contentTops.length ? Math.max(...contentTops) : spineBottom - pad;

  const top = Math.min(spineTop, minContent - pad, 8);
  const bottom = Math.max(spineBottom, maxContent + pad, baseY + pad);
  const height = Math.max(bottom - top, spineHeight, 320);
  const bottomY = top + height;

  return {
    centerX,
    baseY,
    bottomY,
    top,
    height,
    spineTop,
    spineHeight,
    configured: { top: spineTop, height: spineHeight },
    nodes,
  };
}

export function ensureStagePositions(stages, layout = DEFAULT_ROADMAP_LAYOUT) {
  if (!stages?.length) return stages || [];
  if (stages.every(isStageOnCanvas)) return stages;

  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const positioned = [];
  for (const stage of sorted) {
    if (isStageOnCanvas(stage)) {
      positioned.push(stage);
      continue;
    }
    const pos = getNextStagePosition(positioned, layout);
    positioned.push({
      ...stage,
      onRoadmap: true,
      posX: pos.posX,
      posY: pos.posY,
      timelineY: pos.timelineY,
      roadmapSide: pos.roadmapSide || 'right',
    });
  }
  return positioned;
}

export function collectCanvasStages(stages) {
  return stages.filter(isStageOnCanvas);
}

export function collectStageBacklog(stages) {
  return [...stages]
    .filter((s) => !isStageOnCanvas(s))
    .sort((a, b) => b.order - a.order);
}

export function isStageOnCanvas(stage) {
  return typeof stage?.posX === 'number' && typeof stage?.posY === 'number';
}

export function isIdeaOnCanvas(idea) {
  return typeof idea?.canvasX === 'number' && typeof idea?.canvasY === 'number';
}

export function getNextFreeCanvasPosition(
  stages,
  backlog = [],
  stickies = [],
  layout = DEFAULT_ROADMAP_LAYOUT,
  size = { w: IDEA_W, h: IDEA_H },
  extras = {}
) {
  const obstacles = extras.obstacles || [];
  const resources = extras.resources || [];
  const tasks = extras.tasks || [];
  const w = size.w || IDEA_W;
  const h = size.h || IDEA_H;
  const centerX = layout.centerX ?? CENTER_X;
  const baseY = layout.baseY ?? BASE_Y;

  const boxes = [];
  for (const stage of stages.filter(isStageOnCanvas)) {
    boxes.push({
      x: stage.posX,
      y: stage.posY,
      w: getMilestoneWidth(),
      h: getMilestoneHeight(),
    });
  }
  for (const idea of backlog) {
    if (isIdeaOnCanvas(idea)) {
      boxes.push({ x: idea.canvasX, y: idea.canvasY, w: IDEA_W, h: IDEA_H });
    }
  }
  for (const stage of stages) {
    for (const idea of stage.ideas || []) {
      if (isIdeaOnCanvas(idea)) {
        boxes.push({ x: idea.canvasX, y: idea.canvasY, w: IDEA_W, h: IDEA_H });
      }
    }
  }
  for (const sticky of stickies) {
    if (typeof sticky.canvasX === 'number' && typeof sticky.canvasY === 'number') {
      boxes.push({
        x: sticky.canvasX,
        y: sticky.canvasY,
        w: sticky.width || 200,
        h: sticky.height || 140,
      });
    }
  }
  for (const item of [...obstacles, ...resources, ...tasks]) {
    if (typeof item.canvasX === 'number' && typeof item.canvasY === 'number') {
      boxes.push({ x: item.canvasX, y: item.canvasY, w: IDEA_W, h: IDEA_H });
    }
  }

  const freeStartX = centerX + SIDE_GAP + MAJOR_W + GAP_X;
  const freeStartY = Math.max(ORIGIN_Y, baseY - h - GAP_Y);

  if (boxes.length === 0) {
    return { x: freeStartX, y: freeStartY, onRoadmap: false };
  }

  const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
  const rowY = Math.min(...boxes.map((b) => b.y));
  return {
    x: maxRight + GAP_X,
    y: rowY,
    onRoadmap: false,
  };
}

export function getNextIdeaPosition(stages, backlog = [], layout = DEFAULT_ROADMAP_LAYOUT) {
  const baseY = layout.baseY ?? BASE_Y;

  if (layout.direction === 'vertical') {
    const onLine = stages.filter(isOnRoadmap);
    const ideasOnLine = (backlog || []).filter(isItemOnRoadmap);
    const totalOnLine = onLine.length + ideasOnLine.length;

    let timelineY = baseY - IDEA_H / 2;
    if (onLine.length) {
      const topMost = [...onLine].sort((a, b) => getTimelineY(a) - getTimelineY(b))[0];
      timelineY =
        getTimelineY(topMost) - getMilestoneHeight() / 2 - GAP_Y - IDEA_H / 2;
    } else if (ideasOnLine.length) {
      const topMost = [...ideasOnLine].sort((a, b) => a.timelineY - b.timelineY)[0];
      timelineY = topMost.timelineY - GAP_Y - IDEA_H / 2;
    }
    timelineY = Math.max(24 + IDEA_H / 2, timelineY);
    const side = totalOnLine % 2 === 0 ? 'right' : 'left';
    return {
      canvasX: getAttachedPosXForWidth(IDEA_W, side, layout),
      canvasY: timelineY - IDEA_H / 2,
      onRoadmap: true,
      timelineY,
      roadmapSide: side,
    };
  }

  const points = [];
  for (const stage of stages) {
    if (typeof stage.posX === 'number') points.push({ x: stage.posX, y: stage.posY });
    for (const idea of stage.ideas || []) {
      if (isIdeaOnCanvas(idea)) points.push({ x: idea.canvasX, y: idea.canvasY });
    }
  }
  for (const idea of backlog) {
    if (isIdeaOnCanvas(idea)) points.push({ x: idea.canvasX, y: idea.canvasY });
  }
  if (points.length === 0) {
    return { canvasX: ORIGIN_X + CARD_W + GAP_X, canvasY: ORIGIN_Y + 40 };
  }
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  return { canvasX: maxX + IDEA_W + GAP_X, canvasY: maxY };
}

export function getRoadmapBoardSize(stages, canvasIdeas = [], layout = DEFAULT_ROADMAP_LAYOUT) {
  const centerX = layout.centerX ?? CENTER_X;
  const widthPoints = [centerX * 2 + MAJOR_W + SIDE_GAP * 2 + 120];
  const heightPoints = [720];

  for (const stage of stages.filter(isStageOnCanvas)) {
    widthPoints.push((stage.posX ?? 0) + getMilestoneWidth() + 120);
    heightPoints.push((stage.posY ?? 0) + getMilestoneHeight() + 120);
  }

  for (const idea of canvasIdeas) {
    widthPoints.push((idea.canvasX ?? 0) + IDEA_W + 120);
    heightPoints.push((idea.canvasY ?? 0) + IDEA_H + 120);
  }

  const lineMetrics = getCenterLineMetrics(stages.filter(isStageOnCanvas), layout);
  heightPoints.push(lineMetrics.top + lineMetrics.height + 80);

  return {
    width: Math.max(...widthPoints),
    height: Math.max(...heightPoints),
  };
}

export function screenToCanvas(clientX, clientY, viewportEl, pan, scale) {
  if (!viewportEl) return { canvasX: 0, canvasY: 0 };
  const rect = viewportEl.getBoundingClientRect();
  const pointX = clientX - rect.left - viewportEl.clientLeft;
  const pointY = clientY - rect.top - viewportEl.clientTop;
  return {
    canvasX: (pointX - pan.x) / scale,
    canvasY: (pointY - pan.y) / scale,
  };
}

export function collectCanvasIdeas(stages, backlog = []) {
  const nodes = [];

  for (const stage of stages) {
    for (const idea of stage.ideas || []) {
      if (isIdeaOnCanvas(idea)) {
        nodes.push({
          ...idea,
          source: 'stage',
          stageId: stage.id,
          stageTitle: stage.title,
        });
      }
    }
  }

  for (const idea of backlog) {
    if (isIdeaOnCanvas(idea)) {
      nodes.push({ ...idea, source: 'backlog', stageId: null, stageTitle: null });
    }
  }

  return nodes;
}

export function collectBacklogItems(stages, backlog = []) {
  const items = [];

  for (const idea of backlog) {
    if (!isIdeaOnCanvas(idea)) {
      items.push({ ...idea, source: 'backlog', stageId: null, stageTitle: null });
    }
  }

  for (const stage of stages) {
    for (const idea of stage.ideas || []) {
      if (!isIdeaOnCanvas(idea)) {
        items.push({
          ...idea,
          source: 'stage',
          stageId: stage.id,
          stageTitle: stage.title,
        });
      }
    }
  }

  return items;
}
