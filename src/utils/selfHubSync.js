import { localTodayIsoDate } from './selfDateUtils';
import {
  collectCompletedItemsForDate,
  collectCompletedCheckpointsFromStages,
  collectNotesCreatedForDate,
  collectJournalNotesForDate,
  collectScheduledItemsForDate,
  getDayEntry,
  mergeCompletedItems,
  patchDayEntry,
} from './lifelineDays';
import { getSelfHubDayEntry, normalizeSelfHubDayEntry, patchSelfHubDayEntry } from './selfHubDays';
import { collectPathResolvedForDate } from '../lib/path/logic';
import { healthMetricsToLifelinePatch } from '../lib/health/healthToLifeline';
import { ouraRowToLifelineMetrics } from './lifelineSelfMetrics';
import { buildSelfHubTimelineEvents, normalizeTimelineSnapshot } from './selfHubTimelineEvents';

/**
 * Build a live Self Hub day patch from current sources (health, hub view, projects).
 */
export function buildSelfHubLivePatch({
  date,
  selfData,
  hubView,
  projectActivity,
  healthMetrics = [],
  ouraRow = null,
  pathBundle = null,
}) {
  const day = date || localTodayIsoDate();
  const now = new Date().toISOString();

  let health = null;
  if (ouraRow?.day === day) {
    health = ouraRowToLifelineMetrics(ouraRow);
  } else if (healthMetrics?.length) {
    const dayMetrics = healthMetrics.filter((m) => m.day === day);
    if (dayMetrics.length) {
      health = healthMetricsToLifelinePatch(day, dayMetrics, { syncedAt: now });
    }
  }

  const projects = {
    completed: mergeCompletedItems(
      collectCompletedItemsForDate(projectActivity, day),
      collectPathResolvedForDate(pathBundle, day),
    ),
    notes: collectNotesCreatedForDate(projectActivity, day),
    scheduled: collectScheduledItemsForDate(projectActivity, day),
    syncedAt: now,
  };

  const hub = hubView
    ? {
        deepWork: hubView.deepWork,
        todayThree: hubView.todayThree,
        nextAction: hubView.nextAction,
        capacity: hubView.capacity,
        summaryStrip: hubView.summaryStrip,
        capturedAt: now,
      }
    : null;

  const builtTimeline = buildSelfHubTimelineEvents({
    projectDay: projects,
    heartRate: hubView?.floatingMetrics?.heartRate ?? null,
    ouraRow,
    date: day,
  });
  const timeline = normalizeTimelineSnapshot({
    ...builtTimeline,
    capturedAt: now,
  });

  return {
    updatedAt: now,
    health,
    hub,
    projects,
    timeline,
  };
}

/**
 * Archive a Self Hub day entry into lifelineDays (historical record).
 */
function pickRicherTimeline(a, b) {
  const left = normalizeTimelineSnapshot(a);
  const right = normalizeTimelineSnapshot(b);
  if (!left) return right;
  if (!right) return left;
  const score = (snap) => (snap.events?.length || 0) + (snap.segments?.length || 0);
  return score(left) >= score(right) ? left : right;
}

export function selfHubEntryToLifelineArchive(entry) {
  const normalized = normalizeSelfHubDayEntry(entry);
  const journal = normalized.journal || { notes: '', todos: [], routines: {} };

  return {
    metrics: normalized.health || null,
    notes: journal.notes || '',
    todos: journal.todos || [],
    routines: journal.routines || {},
    projectSnapshot: normalized.projects,
    hubSnapshot: normalized.hub,
    timelineSnapshot: normalized.timeline,
    archivedAt: normalized.updatedAt || new Date().toISOString(),
    archivedFrom: 'selfHub',
  };
}

export function syncSelfHubEntryToLifeline(lifelineDays, dateStr, selfHubEntry) {
  const archive = selfHubEntryToLifelineArchive(selfHubEntry);
  const current = getDayEntry(lifelineDays, dateStr);

  return patchDayEntry(lifelineDays, dateStr, {
    metrics: archive.metrics ?? current.metrics,
    notes: current.notes || archive.notes,
    todos: current.todos?.length ? current.todos : archive.todos,
    routines:
      current.routines && Object.keys(current.routines).length
        ? current.routines
        : archive.routines,
    projectSnapshot: archive.projectSnapshot,
    hubSnapshot: archive.hubSnapshot,
    timelineSnapshot: pickRicherTimeline(archive.timelineSnapshot, current.timelineSnapshot),
    archivedAt: archive.archivedAt,
    archivedFrom: archive.archivedFrom,
  });
}

export function captureSelfHubLiveDay({
  selfHubDays,
  lifelineDays,
  date,
  patch,
}) {
  const key = date || localTodayIsoDate();
  const nextSelfHubDays = patchSelfHubDayEntry(selfHubDays, key, patch);
  const entry = getSelfHubDayEntry(nextSelfHubDays, key);
  const nextLifelineDays = syncSelfHubEntryToLifeline(lifelineDays, key, entry);

  return {
    selfHubDays: nextSelfHubDays,
    lifelineDays: nextLifelineDays,
    entry,
  };
}

/**
 * Resolve project activity for a date: live Self Hub store for today, archive for past.
 */
export function resolveProjectDayForView({
  selfHubDays,
  lifelineDays,
  date,
  projectActivity,
  stages = [],
  pathBundle = null,
}) {
  const day = date || localTodayIsoDate();
  const today = localTodayIsoDate();
  const selfEntry = getSelfHubDayEntry(selfHubDays, day);
  const lifelineEntry = getDayEntry(lifelineDays, day);

  const completed = mergeCompletedItems(
    selfEntry.projects?.completed,
    lifelineEntry.projectSnapshot?.completed,
    collectCompletedItemsForDate(projectActivity, day),
    collectCompletedCheckpointsFromStages(stages, day),
    collectPathResolvedForDate(pathBundle, day),
  );
  const notes = mergeCompletedItems(
    selfEntry.projects?.notes,
    lifelineEntry.projectSnapshot?.notes,
    collectNotesCreatedForDate(projectActivity, day),
    collectJournalNotesForDate(selfEntry.journal?.notes || lifelineEntry.notes, day),
  );
  const scheduled = mergeCompletedItems(
    selfEntry.projects?.scheduled,
    lifelineEntry.projectSnapshot?.scheduled,
    collectScheduledItemsForDate(projectActivity, day),
  );

  completed.sort((a, b) => String(b.completedAt || b.timestamp || '').localeCompare(String(a.completedAt || a.timestamp || '')));

  return {
    source: completed.length || notes.length || scheduled.length
      ? (day === today ? 'merged' : 'archive')
      : 'none',
    completed,
    notes,
    scheduled,
  };
}
