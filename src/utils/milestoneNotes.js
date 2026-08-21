/** Resolve canvas sticky ↔ milestone links for Workspace notes. */

export function getStickyLinkedStageId(sticky, canvasConnections = []) {
  if (sticky?.relatedStageId) return sticky.relatedStageId;

  for (const c of canvasConnections) {
    if (c.from?.type === 'sticky' && c.from.id === sticky.id && c.to?.type === 'milestone') {
      return c.to.id;
    }
    if (c.to?.type === 'sticky' && c.to.id === sticky.id && c.from?.type === 'milestone') {
      return c.from.id;
    }
  }
  return null;
}

export function stickyLinkedToStage(sticky, stageId, canvasConnections = []) {
  if (!sticky || !stageId) return false;
  if (sticky.relatedStageId === stageId) return true;

  return canvasConnections.some(
    (c) =>
      (c.from?.type === 'milestone' &&
        c.from.id === stageId &&
        c.to?.type === 'sticky' &&
        c.to.id === sticky.id) ||
      (c.to?.type === 'milestone' &&
        c.to.id === stageId &&
        c.from?.type === 'sticky' &&
        c.from.id === sticky.id)
  );
}

export function getStickiesForStage(stageId, canvasStickies = [], canvasConnections = []) {
  return (canvasStickies || []).filter((s) =>
    stickyLinkedToStage(s, stageId, canvasConnections)
  );
}

export function getUnlinkedStickies(canvasStickies = [], canvasConnections = []) {
  return (canvasStickies || []).filter(
    (s) => !getStickyLinkedStageId(s, canvasConnections)
  );
}

/** Map a canvas sticky into the shape Workspace note list expects. */
export function stickyAsWorkspaceNote(sticky, stageId = null) {
  const text = (sticky.text || '').trim();
  const firstLine = text.split('\n')[0] || 'Sticky note';
  return {
    id: sticky.id,
    title: firstLine.slice(0, 80),
    body: text,
    relatedStageId: stageId ?? sticky.relatedStageId ?? null,
    linkedCheckpointIds: sticky.linkedCheckpointIds || [],
    category: sticky.category || '',
    createdAt: sticky.createdAt || null,
    updatedAt: sticky.updatedAt || null,
    archived: Boolean(sticky.archived),
    archivedAt: sticky.archivedAt || null,
    completedAt: sticky.completedAt || null,
    done: Boolean(sticky.done),
    source: 'sticky',
  };
}

/** If a connection is sticky↔milestone, return { stickyId, stageId }. */
export function getStickyMilestonePair(from, to) {
  if (from?.type === 'sticky' && to?.type === 'milestone') {
    return { stickyId: from.id, stageId: to.id };
  }
  if (from?.type === 'milestone' && to?.type === 'sticky') {
    return { stickyId: to.id, stageId: from.id };
  }
  return null;
}
