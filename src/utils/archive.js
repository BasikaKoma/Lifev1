/** Done / archive helpers for notes, checkpoints, and similar items. */

export function isArchived(item) {
  return Boolean(item?.archived);
}

/** Completed or previously archived (legacy checks that archived). */
export function isItemDone(item) {
  return Boolean(item?.done || item?.archived);
}

const COMPLETE_STATUSES = new Set(['Done', 'Mitigated', 'Resolved', 'Secured', 'Executed']);

export function isCompleteStatus(status) {
  return COMPLETE_STATUSES.has(String(status || ''));
}

/** Stamp completedAt with a clock time when an item becomes done. */
export function withCompletionTimestamp(current, updates, now = new Date().toISOString()) {
  if (!updates || typeof updates !== 'object') return updates;
  const next = { ...updates };
  const currentDone = Boolean(current?.done || current?.archived) || isCompleteStatus(current?.status);
  const nextDone = Object.prototype.hasOwnProperty.call(next, 'done')
    ? Boolean(next.done)
    : Object.prototype.hasOwnProperty.call(next, 'status')
      ? isCompleteStatus(next.status)
      : currentDone;

  if (nextDone && !currentDone) {
    if (!next.completedAt) next.completedAt = current?.completedAt || now;
  } else if (!nextDone && currentDone && !Object.prototype.hasOwnProperty.call(next, 'completedAt')) {
    next.completedAt = null;
  }
  return next;
}

/** Mark as completed — stays visible on the projects canvas / workspace. */
export function buildCompletePatch(now = new Date().toISOString()) {
  return {
    done: true,
    completedAt: now,
    archived: false,
    archivedAt: null,
  };
}

/** Clear completed state. */
export function buildIncompletePatch() {
  return {
    done: false,
    completedAt: null,
    archived: false,
    archivedAt: null,
  };
}

export function buildToggleCompletePatch(item, now = new Date().toISOString()) {
  return isItemDone(item) ? buildIncompletePatch() : buildCompletePatch(now);
}

/** @deprecated Prefer buildCompletePatch — kept for any explicit archive flows. */
export function buildArchivePatch(now = new Date().toISOString()) {
  return {
    done: true,
    archived: true,
    archivedAt: now,
    completedAt: now,
  };
}

export function buildUnarchivePatch() {
  return buildIncompletePatch();
}

export function formatArchiveDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function partitionActiveArchived(items = []) {
  const active = [];
  const archived = [];
  items.forEach((item) => {
    if (isArchived(item)) archived.push(item);
    else active.push(item);
  });
  archived.sort(
    (a, b) => new Date(b.archivedAt || b.completedAt || 0) - new Date(a.archivedAt || a.completedAt || 0)
  );
  return { active, archived };
}

/** Split into open vs completed (includes legacy archived-as-done). */
export function partitionOpenDone(items = []) {
  const open = [];
  const done = [];
  items.forEach((item) => {
    if (isItemDone(item)) done.push(item);
    else open.push(item);
  });
  done.sort(
    (a, b) => new Date(b.completedAt || b.archivedAt || 0) - new Date(a.completedAt || a.archivedAt || 0)
  );
  return { open, done };
}
