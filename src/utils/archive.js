/** Done / archive helpers for notes, checkpoints, and similar items. */

export function isArchived(item) {
  return Boolean(item?.archived);
}

/** Completed or previously archived (legacy checks that archived). */
export function isItemDone(item) {
  return Boolean(item?.done || item?.archived);
}

/** Mark as completed — stays visible on roadmap / workspace. */
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
