/** Link helpers between entities and checkpoints (field + canvas connections). */

import { getAllCheckpoints } from './logic';

export function normalizeLinkedCheckpointIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(Boolean))];
}

export function toggleLinkedCheckpointId(ids, checkpointId) {
  const list = normalizeLinkedCheckpointIds(ids);
  if (!checkpointId) return list;
  return list.includes(checkpointId)
    ? list.filter((id) => id !== checkpointId)
    : [...list, checkpointId];
}

export function addLinkedCheckpointId(ids, checkpointId) {
  const list = normalizeLinkedCheckpointIds(ids);
  if (!checkpointId || list.includes(checkpointId)) return list;
  return [...list, checkpointId];
}

export function removeLinkedCheckpointId(ids, checkpointId) {
  return normalizeLinkedCheckpointIds(ids).filter((id) => id !== checkpointId);
}

/** Options for selects: { id, stageId, stageTitle, title, label, done } */
export function checkpointLinkOptions(stages = []) {
  return getAllCheckpoints(stages).map((cp) => ({
    id: cp.id,
    stageId: cp.stageId,
    stageTitle: cp.stageTitle || '',
    title: cp.title || 'Checkpoint',
    label: cp.stageTitle ? `${cp.stageTitle} · ${cp.title}` : cp.title || 'Checkpoint',
    done: Boolean(cp.done || cp.archived),
  }));
}

export function labelsForLinkedCheckpoints(ids, stages = []) {
  const wanted = new Set(normalizeLinkedCheckpointIds(ids));
  if (!wanted.size) return [];
  return checkpointLinkOptions(stages)
    .filter((opt) => wanted.has(opt.id))
    .map((opt) => opt.label);
}

const LINKABLE_TYPES = new Set(['sticky', 'idea', 'obstacle', 'resource', 'task']);

/**
 * If a connection is entity ↔ checkpoint, return
 * { checkpointId, stageId, other: nodeRef }.
 */
export function getEntityCheckpointPair(from, to) {
  if (from?.type === 'checkpoint' && LINKABLE_TYPES.has(to?.type)) {
    return { checkpointId: from.id, stageId: from.stageId || null, other: to };
  }
  if (to?.type === 'checkpoint' && LINKABLE_TYPES.has(from?.type)) {
    return { checkpointId: to.id, stageId: to.stageId || null, other: from };
  }
  return null;
}

export function connectionLinksEntityToCheckpoint(conn, entityRef, checkpointId) {
  const pair = getEntityCheckpointPair(conn?.from, conn?.to);
  if (!pair || pair.checkpointId !== checkpointId) return false;
  const o = pair.other;
  if (o.type !== entityRef.type || o.id !== entityRef.id) return false;
  if (entityRef.type === 'idea') {
    return (
      (o.source || 'backlog') === (entityRef.source || 'backlog') &&
      (o.stageId || '') === (entityRef.stageId || '')
    );
  }
  return true;
}

function patchIdeaLinkedCheckpoints(stages, backlog, ideaRef, mutator) {
  if (ideaRef.source === 'backlog' || !ideaRef.stageId) {
    return {
      stages,
      backlog: (backlog || []).map((idea) =>
        idea.id === ideaRef.id
          ? { ...idea, linkedCheckpointIds: mutator(idea.linkedCheckpointIds) }
          : idea
      ),
    };
  }
  return {
    backlog,
    stages: (stages || []).map((stage) => {
      if (stage.id !== ideaRef.stageId) return stage;
      return {
        ...stage,
        ideas: (stage.ideas || []).map((idea) =>
          idea.id === ideaRef.id
            ? { ...idea, linkedCheckpointIds: mutator(idea.linkedCheckpointIds) }
            : idea
        ),
      };
    }),
  };
}

/** Apply add/remove of a checkpoint link onto the linked canvas entity in app state. */
export function applyCheckpointLinkToState(prev, entityRef, checkpointId, mode) {
  if (!entityRef || !checkpointId) return prev;
  const mutator =
    mode === 'remove'
      ? (ids) => removeLinkedCheckpointId(ids, checkpointId)
      : (ids) => addLinkedCheckpointId(ids, checkpointId);

  if (entityRef.type === 'sticky') {
    return {
      ...prev,
      canvasStickies: (prev.canvasStickies || []).map((s) =>
        s.id === entityRef.id ? { ...s, linkedCheckpointIds: mutator(s.linkedCheckpointIds) } : s
      ),
    };
  }
  if (entityRef.type === 'obstacle') {
    return {
      ...prev,
      canvasObstacles: (prev.canvasObstacles || []).map((item) =>
        item.id === entityRef.id
          ? { ...item, linkedCheckpointIds: mutator(item.linkedCheckpointIds) }
          : item
      ),
    };
  }
  if (entityRef.type === 'resource') {
    return {
      ...prev,
      canvasResources: (prev.canvasResources || []).map((item) =>
        item.id === entityRef.id
          ? { ...item, linkedCheckpointIds: mutator(item.linkedCheckpointIds) }
          : item
      ),
    };
  }
  if (entityRef.type === 'task') {
    return {
      ...prev,
      canvasTasks: (prev.canvasTasks || []).map((item) =>
        item.id === entityRef.id
          ? { ...item, linkedCheckpointIds: mutator(item.linkedCheckpointIds) }
          : item
      ),
    };
  }
  if (entityRef.type === 'idea') {
    const next = patchIdeaLinkedCheckpoints(prev.stages, prev.backlog, entityRef, mutator);
    return { ...prev, stages: next.stages, backlog: next.backlog };
  }
  return prev;
}

