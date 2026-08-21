import {
  CARD_W,
  CARD_H,
  IDEA_W,
  IDEA_H,
  ORIGIN_X,
  ORIGIN_Y,
  GAP_X,
  GAP_Y,
  CENTER_X,
  SIDE_GAP,
  DEFAULT_ROADMAP_LAYOUT,
  syncRoadmapPositions,
  getMilestoneHeight,
  getMilestoneWidth,
  getCenterLineMetrics,
  collectCanvasStages,
  collectCanvasIdeas,
  collectRoadmapCheckpoints,
  isStageOnCanvas,
  CHECKPOINT_DOT_RADIUS,
} from './stageLayout';
import { getStickyDisplaySize, isNoteSettledByCheckpoints } from './noteSettle';
import { isItemDone } from './archive';

export const STICKY_W = 200;
export const STICKY_H = 140;

export const NODE_COLOR_PRESETS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#64748b',
  '#fef08a',
  '#fde68a',
];

export const DEFAULT_CANVAS_STYLE = {
  color: '#6366f1',
  shape: 'rounded',
  fontSize: 'md',
  fontWeight: 'normal',
  textAlign: 'left',
  linkUrl: null,
};

export const STICKY_DEFAULT_STYLE = {
  color: '#fef08a',
  shape: 'rounded',
  fontSize: 'md',
  fontWeight: 'normal',
};

export function getCanvasStyle(entity, fallback = DEFAULT_CANVAS_STYLE) {
  return { ...fallback, ...(entity?.canvasStyle || {}) };
}

export function nodeRefKey(ref) {
  if (!ref) return '';
  return `${ref.type}:${ref.id}:${ref.source || ''}:${ref.stageId || ''}`;
}

export function sameNodeRef(a, b) {
  return nodeRefKey(a) === nodeRefKey(b);
}

export function isStickyOnCanvas(sticky) {
  return typeof sticky?.canvasX === 'number' && typeof sticky?.canvasY === 'number';
}

export function collectStickyBacklog(stickies = []) {
  return stickies.filter((s) => !isStickyOnCanvas(s));
}

export function collectCanvasStickies(stickies = []) {
  return stickies.filter(isStickyOnCanvas);
}

export function getMilestoneSize() {
  return {
    w: getMilestoneWidth(),
    h: getMilestoneHeight(),
  };
}

export function getNodeBounds(ref, entity) {
  if (ref.type === 'milestone') {
    const { w, h } = getMilestoneSize(entity);
    return { x: entity.posX, y: entity.posY, w, h, cx: entity.posX + w / 2, cy: entity.posY + h / 2 };
  }
  if (ref.type === 'idea') {
    return {
      x: entity.canvasX,
      y: entity.canvasY,
      w: IDEA_W,
      h: IDEA_H,
      cx: entity.canvasX + IDEA_W / 2,
      cy: entity.canvasY + IDEA_H / 2,
    };
  }
  if (ref.type === 'sticky') {
    const { w, h } = getStickyDisplaySize(entity, { collapsed: entity.collapsed });
    return {
      x: entity.canvasX,
      y: entity.canvasY,
      w,
      h,
      cx: entity.canvasX + w / 2,
      cy: entity.canvasY + h / 2,
    };
  }
  if (ref.type === 'obstacle' || ref.type === 'resource' || ref.type === 'task') {
    return {
      x: entity.canvasX,
      y: entity.canvasY,
      w: IDEA_W,
      h: IDEA_H,
      cx: entity.canvasX + IDEA_W / 2,
      cy: entity.canvasY + IDEA_H / 2,
    };
  }
  if (ref.type === 'checkpoint') {
    const r = CHECKPOINT_DOT_RADIUS;
    const cx = entity.centerX ?? entity.cx;
    const cy = entity.timelineY ?? entity.cy;
    if (typeof cx !== 'number' || typeof cy !== 'number') return null;
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2, cx, cy };
  }
  if (ref.type === 'origin') {
    const cx = entity.centerX;
    const originY = entity.originY;
    if (typeof cx !== 'number' || typeof originY !== 'number') return null;
    const ORIGIN_W = 240;
    const ORIGIN_H = 120;
    const cardTop = originY + 9 + 18 + 6;
    return {
      x: cx - ORIGIN_W / 2,
      y: cardTop,
      w: ORIGIN_W,
      h: ORIGIN_H,
      cx,
      cy: cardTop - 10,
    };
  }
  return null;
}

export function isCanvasItemOnBoard(item) {
  return typeof item?.canvasX === 'number' && typeof item?.canvasY === 'number';
}

export function collectCanvasObstacles(obstacles = []) {
  return obstacles.filter(isCanvasItemOnBoard);
}

export function collectCanvasResources(resources = []) {
  return resources.filter(isCanvasItemOnBoard);
}

export function collectCanvasTasks(tasks = []) {
  return tasks.filter(isCanvasItemOnBoard);
}

export function buildNodeRegistry(
  stages,
  backlog,
  stickies,
  obstacles = [],
  resources = [],
  tasks = [],
  layout = DEFAULT_ROADMAP_LAYOUT,
  connections = []
) {
  const map = new Map();
  const centerX = layout.centerX ?? CENTER_X;

  for (const stage of collectCanvasStages(stages)) {
    const ref = { type: 'milestone', id: stage.id };
    map.set(nodeRefKey(ref), { ref, entity: stage, bounds: getNodeBounds(ref, stage) });
  }

  for (const idea of collectCanvasIdeas(stages, backlog)) {
    const ref = {
      type: 'idea',
      id: idea.id,
      source: idea.source,
      stageId: idea.stageId || undefined,
    };
    map.set(nodeRefKey(ref), { ref, entity: idea, bounds: getNodeBounds(ref, idea) });
  }

  for (const sticky of stickies.filter(isStickyOnCanvas)) {
    const ref = { type: 'sticky', id: sticky.id };
    const collapsed =
      isItemDone(sticky) && !isNoteSettledByCheckpoints(sticky, stages, connections);
    const entity = collapsed ? { ...sticky, collapsed: true } : sticky;
    map.set(nodeRefKey(ref), { ref, entity, bounds: getNodeBounds(ref, entity) });
  }

  for (const obstacle of collectCanvasObstacles(obstacles)) {
    const ref = { type: 'obstacle', id: obstacle.id };
    map.set(nodeRefKey(ref), { ref, entity: obstacle, bounds: getNodeBounds(ref, obstacle) });
  }

  for (const resource of collectCanvasResources(resources)) {
    const ref = { type: 'resource', id: resource.id };
    map.set(nodeRefKey(ref), { ref, entity: resource, bounds: getNodeBounds(ref, resource) });
  }

  for (const task of collectCanvasTasks(tasks)) {
    const ref = { type: 'task', id: task.id };
    map.set(nodeRefKey(ref), { ref, entity: task, bounds: getNodeBounds(ref, task) });
  }

  for (const checkpoint of collectRoadmapCheckpoints(stages, layout)) {
    const ref = {
      type: 'checkpoint',
      id: checkpoint.id,
      stageId: checkpoint.stageId || undefined,
    };
    const entity = { ...checkpoint, centerX };
    map.set(nodeRefKey(ref), { ref, entity, bounds: getNodeBounds(ref, entity) });
  }

  const originAnchor = layout?.originAnchor;
  if (originAnchor && typeof originAnchor.centerX === 'number' && typeof originAnchor.originY === 'number') {
    const ref = { type: 'origin', id: 'origin' };
    map.set(nodeRefKey(ref), {
      ref,
      entity: originAnchor,
      bounds: getNodeBounds(ref, originAnchor),
    });
  }

  return map;
}

export function getConnectionPath(fromBounds, toBounds) {
  const x1 = fromBounds.cx;
  const y1 = fromBounds.cy;
  const x2 = toBounds.cx;
  const y2 = toBounds.cy;
  const dx = Math.abs(x2 - x1) * 0.4;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function assignIdeaUpdate(updates, idea, pos) {
  if (idea.source === 'backlog') {
    updates.backlog[idea.id] = pos;
  } else {
    const key = idea.stageId;
    if (!updates.ideas[key]) updates.ideas[key] = {};
    updates.ideas[key][idea.id] = pos;
  }
}

export function computeAutoLayout(stages, backlog, stickies, connections = [], layout = DEFAULT_ROADMAP_LAYOUT) {
  const updates = { stages: {}, ideas: {}, backlog: {}, stickies: {} };
  const canvasStages = collectCanvasStages(stages)
    .map((s) => ({ ...s, onRoadmap: true, timelineY: undefined }))
    .sort((a, b) => a.order - b.order);
  const canvasIdeas = collectCanvasIdeas(stages, backlog);
  const canvasStickies = (stickies || []).filter(isStickyOnCanvas);
  const syncedStages = syncRoadmapPositions(canvasStages, layout);

  syncedStages.forEach((stage) => {
    updates.stages[stage.id] = {
      posX: stage.posX,
      posY: stage.posY,
      timelineY: stage.timelineY,
      roadmapSide: stage.roadmapSide,
      onRoadmap: true,
    };
  });

  const ideasByMilestone = {};
  const unlinked = [];

  for (const idea of canvasIdeas) {
    const connFromMilestone = connections.find(
      (c) =>
        c.to?.type === 'idea' &&
        c.to?.id === idea.id &&
        (c.to?.source || 'backlog') === (idea.source || 'backlog') &&
        (c.to?.stageId || '') === (idea.stageId || '') &&
        c.from?.type === 'milestone'
    );
    const milestoneId = connFromMilestone?.from?.id || idea.linkedStageId || idea.stageId;
    if (milestoneId && updates.stages[milestoneId]) {
      if (!ideasByMilestone[milestoneId]) ideasByMilestone[milestoneId] = [];
      ideasByMilestone[milestoneId].push(idea);
    } else {
      unlinked.push(idea);
    }
  }

  for (const [milestoneId, ideas] of Object.entries(ideasByMilestone)) {
    const base = updates.stages[milestoneId];
    const stage = canvasStages.find((s) => s.id === milestoneId);
    const h = stage ? getMilestoneHeight(stage) : CARD_H;
    ideas.forEach((idea, i) => {
      assignIdeaUpdate(updates, idea, {
        canvasX: base.posX,
        canvasY: base.posY + h + GAP_Y + i * (IDEA_H + GAP_Y / 2),
      });
    });
  }

  const maxMilestoneY = syncedStages.length
    ? Math.max(...syncedStages.map((s) => s.posY + getMilestoneHeight(s)))
    : ORIGIN_Y + CARD_H;
  const rowY = maxMilestoneY + GAP_Y * 2;
  unlinked.forEach((idea, i) => {
    assignIdeaUpdate(updates, idea, {
      canvasX: ORIGIN_X + i * (IDEA_W + GAP_X),
      canvasY: rowY,
    });
  });

  const centerX = layout.centerX ?? CENTER_X;
  const rightCol = layout.direction === 'vertical'
    ? centerX + SIDE_GAP + CARD_W + 80
    : ORIGIN_X + syncedStages.length * (CARD_W + GAP_X) + 60;
  canvasStickies.forEach((sticky, i) => {
    updates.stickies[sticky.id] = {
      canvasX: rightCol,
      canvasY: ORIGIN_Y + i * (STICKY_H + GAP_Y),
    };
  });

  return updates;
}

export function getBoardSizeWithStickies(stages, canvasIdeas, stickies, layout = DEFAULT_ROADMAP_LAYOUT) {
  const centerX = layout.centerX ?? CENTER_X;
  const widthPoints = [centerX * 2 + CARD_W + SIDE_GAP * 2 + 160];
  const heightPoints = [720];

  for (const stage of stages.filter(isStageOnCanvas)) {
    const { w } = getMilestoneSize(stage);
    widthPoints.push((stage.posX ?? 0) + w + 120);
    heightPoints.push((stage.posY ?? 0) + getMilestoneHeight(stage) + 120);
  }

  for (const idea of canvasIdeas) {
    widthPoints.push((idea.canvasX ?? 0) + IDEA_W + 120);
    heightPoints.push((idea.canvasY ?? 0) + IDEA_H + 120);
  }

  for (const sticky of (stickies || []).filter(isStickyOnCanvas)) {
    const w = sticky.width || STICKY_W;
    const h = sticky.height || STICKY_H;
    widthPoints.push((sticky.canvasX ?? 0) + w + 120);
    heightPoints.push((sticky.canvasY ?? 0) + h + 120);
  }

  const lineMetrics = getCenterLineMetrics(
    stages.filter(isStageOnCanvas),
    layout,
    { ideas: canvasIdeas, stickies: stickies || [] }
  );
  const originCardBelow = 9 + 18 + 6 + 120 + 48;
  heightPoints.push(Math.max(0, lineMetrics.top) + lineMetrics.height + originCardBelow);
  if (lineMetrics.top < 0) {
    heightPoints.push(lineMetrics.height + 200);
  }

  return {
    width: Math.max(...widthPoints),
    height: Math.max(...heightPoints),
  };
}

export function resolveEffectiveShapeMode(entity, mapTheme) {
  const nodeStyle = getCanvasStyle(entity);
  if (nodeStyle.shape === 'sharp') return 'sharp';
  if (nodeStyle.shape === 'pill') return 'pill';

  const globalShape = mapTheme?.globalShape || {};
  const cornerRadius =
    mapTheme?.mapStyle === 'bubbles'
      ? globalShape.cornerRadius || 'rnd'
      : globalShape.cornerRadius;

  if (cornerRadius === 'rnd') return 'pill';
  return nodeStyle.shape || 'rounded';
}

export function canvasStyleClasses(entity, mapTheme) {
  const nodeStyle = getCanvasStyle(entity);
  const globalText = mapTheme?.globalText || DEFAULT_CANVAS_STYLE;
  const shape = mapTheme ? resolveEffectiveShapeMode(entity, mapTheme) : nodeStyle.shape || 'rounded';
  const fontSize = entity?.canvasStyle?.fontSize || globalText.fontSize || nodeStyle.fontSize || 'md';
  const fontWeight = entity?.canvasStyle?.fontWeight || globalText.fontWeight || nodeStyle.fontWeight;
  const textAlign = entity?.canvasStyle?.textAlign || globalText.textAlign || nodeStyle.textAlign || 'left';

  return [
    `canvas-node--shape-${shape}`,
    `canvas-node--font-${fontSize}`,
    `canvas-node--align-${textAlign}`,
    fontWeight === 'bold' ? 'canvas-node--bold' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function getNodeToolbarPosition(
  stages,
  backlog,
  stickies,
  nodeRef,
  obstacles = [],
  resources = [],
  tasks = [],
  layout = DEFAULT_ROADMAP_LAYOUT
) {
  const registry = buildNodeRegistry(stages, backlog, stickies, obstacles, resources, tasks, layout);
  const node = registry.get(nodeRefKey(nodeRef));
  if (!node?.bounds) return null;
  return {
    left: node.bounds.cx,
    top: node.bounds.y - 4,
  };
}

export function canvasStyleVars(style, fallback = DEFAULT_CANVAS_STYLE) {
  const s = getCanvasStyle({ canvasStyle: style }, fallback);
  return {
    '--node-accent': s.color,
    '--node-accent-soft': `${s.color}33`,
    '--node-accent-border': `${s.color}66`,
  };
}
