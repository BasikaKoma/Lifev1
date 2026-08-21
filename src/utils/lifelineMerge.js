/**
 * Merge orphaned lifeline rows (legacy projects.is_lifeline) into the canonical lifelines row.
 * Prevents data loss when duplicate lifeline records exist.
 */

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function objectKeyCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function mergeJsonArrays(canonical = [], incoming = []) {
  if (!arrayLength(incoming)) return canonical || [];
  if (!arrayLength(canonical)) return incoming;
  const seen = new Set(canonical.map((item) => item?.id).filter(Boolean));
  const merged = [...canonical];
  for (const item of incoming) {
    if (!item?.id || !seen.has(item.id)) {
      merged.push(item);
      if (item?.id) seen.add(item.id);
    }
  }
  return merged;
}

function mergeJsonObjects(canonical = {}, incoming = {}) {
  if (!objectKeyCount(incoming)) return canonical || {};
  if (!objectKeyCount(canonical)) return incoming;
  return { ...incoming, ...canonical };
}

function mergeMapTheme(canonical = {}, incoming = {}) {
  if (!incoming || typeof incoming !== 'object') return canonical || {};
  const next = { ...(canonical || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'lifeline' && value && typeof value === 'object') {
      next.lifeline = mergeJsonObjects(value, next.lifeline || {});
      if (value.selfHubDays && next.lifeline.selfHubDays) {
        next.lifeline.selfHubDays = mergeJsonObjects(value.selfHubDays, next.lifeline.selfHubDays);
      }
    } else if (value != null && next[key] == null) {
      next[key] = value;
    }
  }
  return next;
}

function mergeStages(canonical = [], incoming = []) {
  if (!arrayLength(incoming)) return canonical || [];
  if (!arrayLength(canonical)) return incoming;

  const byId = new Map(canonical.map((stage) => [stage.id, stage]));
  for (const stage of incoming) {
    if (!stage?.id) continue;
    const existing = byId.get(stage.id);
    if (!existing) {
      byId.set(stage.id, stage);
      continue;
    }
    const mergedCheckpoints = mergeJsonArrays(existing.checkpoints, stage.checkpoints);
    byId.set(stage.id, {
      ...existing,
      ...stage,
      checkpoints: mergedCheckpoints.length ? mergedCheckpoints : (existing.checkpoints || stage.checkpoints || []),
    });
  }
  return [...byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function countCheckpoints(stages) {
  if (!arrayLength(stages)) return 0;
  return stages.reduce((sum, stage) => sum + arrayLength(stage?.checkpoints), 0);
}

function checkpointIdSet(stages) {
  const ids = new Set();
  for (const stage of stages || []) {
    for (const cp of stage?.checkpoints || []) {
      if (cp?.id) ids.add(cp.id);
    }
  }
  return ids;
}

/** Union stages/checkpoints for save: local edits win, cloud-only checkpoints are kept. */
function mergeStagesPreservingLocal(local = [], cloud = []) {
  if (!arrayLength(cloud)) return local || [];
  if (!arrayLength(local)) return cloud;

  const byId = new Map(cloud.map((stage) => [stage.id, stage]));
  for (const stage of local) {
    if (!stage?.id) continue;
    const cloudStage = byId.get(stage.id);
    if (!cloudStage) {
      byId.set(stage.id, stage);
      continue;
    }
    const mergedCheckpoints = mergeJsonArrays(stage.checkpoints, cloudStage.checkpoints);
    byId.set(stage.id, {
      ...cloudStage,
      ...stage,
      checkpoints: mergedCheckpoints.length
        ? mergedCheckpoints
        : (stage.checkpoints || cloudStage.checkpoints || []),
    });
  }
  return [...byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function stagesNeedReconcile(localStages, mergedStages) {
  if ((mergedStages?.length || 0) > (localStages?.length || 0)) return true;
  const localIds = checkpointIdSet(localStages);
  const mergedIds = checkpointIdSet(mergedStages);
  if (mergedIds.size > localIds.size) return true;
  for (const id of mergedIds) {
    if (!localIds.has(id)) return true;
  }
  return false;
}

/** Merge incoming lifeline row data into canonical. Canonical wins on conflicts. */
export function mergeLifelineRowData(canonical = {}, incoming = {}) {
  const merged = { ...canonical };

  if (!arrayLength(canonical.stages) && arrayLength(incoming.stages)) {
    merged.stages = incoming.stages;
  } else if (arrayLength(canonical.stages) || arrayLength(incoming.stages)) {
    merged.stages = mergeStages(canonical.stages, incoming.stages);
  }

  merged.goals = mergeJsonArrays(canonical.goals, incoming.goals);
  merged.notes = mergeJsonArrays(canonical.notes, incoming.notes);
  merged.backlog = mergeJsonArrays(canonical.backlog, incoming.backlog);
  merged.canvas_connections = mergeJsonArrays(canonical.canvas_connections, incoming.canvas_connections);
  merged.canvas_stickies = mergeJsonArrays(canonical.canvas_stickies, incoming.canvas_stickies);
  merged.canvas_obstacles = mergeJsonArrays(canonical.canvas_obstacles, incoming.canvas_obstacles);
  merged.canvas_resources = mergeJsonArrays(canonical.canvas_resources, incoming.canvas_resources);
  merged.canvas_tasks = mergeJsonArrays(canonical.canvas_tasks, incoming.canvas_tasks);
  merged.canvas_ink = mergeJsonArrays(canonical.canvas_ink, incoming.canvas_ink);
  merged.whiteboard_strokes = mergeJsonArrays(canonical.whiteboard_strokes, incoming.whiteboard_strokes);
  merged.lifeline_days = mergeJsonObjects(incoming.lifeline_days, canonical.lifeline_days);
  merged.map_theme = mergeMapTheme(canonical.map_theme, incoming.map_theme);

  return merged;
}

/**
 * Prevent accidental wipe when saving: if local state is empty but cloud has data, keep cloud.
 * Returns { row, reconcile } where reconcile holds app-state patches to align local UI with cloud.
 */
export function mergeLifelineReconcile(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return { ...a, ...b };
}

export function protectLifelineDataFromAccidentalWipe(newRow = {}, cloudRow = {}) {
  if (!cloudRow) return { row: newRow, reconcile: null };
  const protectedRow = { ...newRow };
  const reconcile = {};

  if ('stages' in newRow) {
    const localStages = newRow.stages;
    const cloudStages = cloudRow.stages;

    if (!arrayLength(localStages) && arrayLength(cloudStages)) {
      protectedRow.stages = cloudStages;
      reconcile.stages = cloudStages;
    } else if (arrayLength(localStages) && arrayLength(cloudStages)) {
      const mergedStages = mergeStagesPreservingLocal(localStages, cloudStages);
      protectedRow.stages = mergedStages;
      if (stagesNeedReconcile(localStages, mergedStages)) {
        reconcile.stages = mergedStages;
      }
    }
  }

  if ('lifeline_days' in newRow) {
    const newDayCount = objectKeyCount(newRow.lifeline_days);
    const cloudDayCount = objectKeyCount(cloudRow.lifeline_days);
    if (newDayCount < cloudDayCount && cloudDayCount > 0) {
      protectedRow.lifeline_days = {
        ...(cloudRow.lifeline_days || {}),
        ...(newRow.lifeline_days || {}),
      };
      reconcile.lifeline_days = protectedRow.lifeline_days;
    }
  }

  return {
    row: protectedRow,
    reconcile: Object.keys(reconcile).length ? reconcile : null,
  };
}

/** Map DB reconcile patches to app state field names. */
export function mapLifelineReconcileToState(reconcile) {
  if (!reconcile) return null;
  const statePatch = {};
  if (reconcile.stages) statePatch.stages = reconcile.stages;
  if (reconcile.lifeline_days) statePatch.lifelineDays = reconcile.lifeline_days;
  if (reconcile.canvas_ink) statePatch.canvasInk = reconcile.canvas_ink;
  if (reconcile.notes) statePatch.notes = reconcile.notes;
  return Object.keys(statePatch).length ? statePatch : null;
}
