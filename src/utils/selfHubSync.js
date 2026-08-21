import { localTodayIsoDate } from './selfDateUtils';
import {
  collectCompletedItemsForDate,
  collectNotesCreatedForDate,
  collectScheduledItemsForDate,
  getDayEntry,
  patchDayEntry,
} from './lifelineDays';
import { getSelfHubDayEntry, normalizeSelfHubDayEntry, patchSelfHubDayEntry } from './selfHubDays';
import { healthMetricsToLifelinePatch } from '../lib/health/healthToLifeline';
import { ouraRowToLifelineMetrics } from './lifelineSelfMetrics';

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
    completed: collectCompletedItemsForDate(projectActivity, day),
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

  return {
    updatedAt: now,
    health,
    hub,
    projects,
  };
}

/**
 * Archive a Self Hub day entry into lifelineDays (historical record).
 */
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
export function resolveProjectDayForView({ selfHubDays, lifelineDays, date, projectActivity }) {
  const day = date || localTodayIsoDate();
  const today = localTodayIsoDate();
  const selfEntry = getSelfHubDayEntry(selfHubDays, day);
  const lifelineEntry = getDayEntry(lifelineDays, day);

  if (day === today && selfEntry.projects) {
    return {
      source: 'selfHub',
      completed: selfEntry.projects.completed || [],
      notes: selfEntry.projects.notes || [],
      scheduled: selfEntry.projects.scheduled || [],
    };
  }

  if (lifelineEntry.projectSnapshot) {
    return {
      source: 'archive',
      completed: lifelineEntry.projectSnapshot.completed || [],
      notes: lifelineEntry.projectSnapshot.notes || [],
      scheduled: lifelineEntry.projectSnapshot.scheduled || [],
    };
  }

  return {
    source: projectActivity?.length ? 'live' : 'none',
    completed: collectCompletedItemsForDate(projectActivity, day),
    notes: collectNotesCreatedForDate(projectActivity, day),
    scheduled: collectScheduledItemsForDate(projectActivity, day),
  };
}
