import { buildNodeRegistry, nodeRefKey, sameNodeRef } from './canvasNodes';
import { CARD_H, CARD_W, GAP_X, GAP_Y, IDEA_H, IDEA_W, ORIGIN_X, ORIGIN_Y } from './stageLayout';

export function getRegistryNode(
  stages,
  backlog,
  stickies,
  nodeRef,
  obstacles = [],
  resources = [],
  tasks = [],
  layout,
  connections = []
) {
  if (!nodeRef) return null;
  return (
    buildNodeRegistry(stages, backlog, stickies, obstacles, resources, tasks, layout, connections).get(nodeRefKey(nodeRef)) ||
    null
  );
}

export function getConnectedRefs(nodeRef, connections = []) {
  const refs = [];
  for (const conn of connections) {
    if (sameNodeRef(conn.from, nodeRef)) refs.push(conn.to);
    else if (sameNodeRef(conn.to, nodeRef)) refs.push(conn.from);
  }
  return refs;
}

export function getChildRefs(nodeRef, connections = []) {
  return connections.filter((c) => sameNodeRef(c.from, nodeRef)).map((c) => c.to);
}

export function offsetPosition(bounds, relation) {
  if (!bounds) return { x: ORIGIN_X, y: ORIGIN_Y };

  if (relation === 'child') {
    return { x: bounds.x, y: bounds.y + bounds.h + GAP_Y };
  }
  if (relation === 'sibling') {
    return { x: bounds.x + bounds.w + GAP_X, y: bounds.y };
  }
  if (relation === 'parent') {
    return { x: bounds.x, y: Math.max(ORIGIN_Y, bounds.y - CARD_H - GAP_Y) };
  }
  if (relation === 'paste') {
    return { x: bounds.x + 24, y: bounds.y + 24 };
  }
  return { x: bounds.x, y: bounds.y };
}

export function ideaSizeForPlacement() {
  return { w: IDEA_W, h: IDEA_H };
}

export function milestoneSizeForPlacement(bounds) {
  return { w: bounds?.w || CARD_W, h: bounds?.h || CARD_H };
}
