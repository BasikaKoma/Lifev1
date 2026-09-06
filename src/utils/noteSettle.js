/** Derived complete/collapse state for notes linked to checkpoints. */

import { isItemDone } from './archive';
import { getEntityCheckpointPair, normalizeLinkedCheckpointIds } from './checkpointLinks';
import { getAllCheckpoints, isCheckpointDone } from './logic';

export const STICKY_CHIP_W = 168;
export const STICKY_CHIP_H = 36;

function isStickyLike(note) {
  return note?.source === 'sticky' || typeof note?.canvasX === 'number';
}

export function getNoteLinkedCheckpointIds(note, canvasConnections = []) {
  const field = normalizeLinkedCheckpointIds(note?.linkedCheckpointIds);
  if (!note?.id || !canvasConnections?.length || !isStickyLike(note)) return field;

  const extra = [];
  for (const conn of canvasConnections) {
    const pair = getEntityCheckpointPair(conn.from, conn.to);
    if (pair?.other?.type === 'sticky' && pair.other.id === note.id) {
      extra.push(pair.checkpointId);
    }
  }
  return normalizeLinkedCheckpointIds([...field, ...extra]);
}

export function areAllLinkedCheckpointsDone(ids, stages = []) {
  const list = normalizeLinkedCheckpointIds(ids);
  if (!list.length) return false;
  const byId = new Map(getAllCheckpoints(stages).map((cp) => [cp.id, cp]));
  return list.every((id) => {
    const cp = byId.get(id);
    return Boolean(cp && isCheckpointDone(cp));
  });
}

export function isNoteSettledByCheckpoints(note, stages = [], canvasConnections = []) {
  return areAllLinkedCheckpointsDone(getNoteLinkedCheckpointIds(note, canvasConnections), stages);
}

export function isNoteSettled(note, stages = [], canvasConnections = []) {
  return isItemDone(note) || isNoteSettledByCheckpoints(note, stages, canvasConnections);
}

/** Hidden on Projects until a linked done checkpoint (or the note itself) is selected. */
export function isSettledNoteVisibleOnRoadmap(
  note,
  stages = [],
  canvasConnections = [],
  selectedNodeRef = null
) {
  if (!isNoteSettledByCheckpoints(note, stages, canvasConnections)) return true;
  if (!selectedNodeRef) return false;
  if (selectedNodeRef.type === 'sticky' && selectedNodeRef.id === note.id) return true;
  if (selectedNodeRef.type === 'checkpoint') {
    return getNoteLinkedCheckpointIds(note, canvasConnections).includes(selectedNodeRef.id);
  }
  return false;
}

export function getNoteSettledAt(note, stages = [], canvasConnections = []) {
  if (note?.completedAt) return note.completedAt;
  if (note?.archivedAt) return note.archivedAt;

  const wanted = new Set(getNoteLinkedCheckpointIds(note, canvasConnections));
  if (!wanted.size) return null;

  let latest = null;
  for (const cp of getAllCheckpoints(stages)) {
    if (!wanted.has(cp.id) || !isCheckpointDone(cp)) continue;
    const at = cp.completedAt || cp.archivedAt;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

export function getStickyDisplaySize(sticky, { collapsed } = {}) {
  if (collapsed) return { w: STICKY_CHIP_W, h: STICKY_CHIP_H };
  return {
    w: sticky?.width || 200,
    h: sticky?.height || 140,
  };
}

export function checkpointHasSettledLinkedNotes(
  checkpointId,
  stickies = [],
  stages = [],
  canvasConnections = []
) {
  if (!checkpointId) return false;
  return stickies.some((sticky) => {
    const ids = getNoteLinkedCheckpointIds(sticky, canvasConnections);
    return ids.includes(checkpointId) && isNoteSettledByCheckpoints(sticky, stages, canvasConnections);
  });
}

export function getNotePreviewLine(note) {
  const text = (note?.text || note?.title || note?.body || '').trim();
  if (!text) return 'Σημείωση';
  return text.split('\n')[0];
}
