import { toDateString } from './lifeline';

/** @typedef {Object} SelfHubDayProjectSnapshot
 * @property {import('./lifelineDays').CompletedItem[]} completed
 * @property {import('./lifelineDays').CompletedItem[]} notes
 * @property {import('./lifelineDays').CompletedItem[]} scheduled
 * @property {string|null} syncedAt
 */

/** @typedef {Object} SelfHubDayHubSnapshot
 * @property {import('./selfHubSchema').SelfHubDeepWork} [deepWork]
 * @property {import('./selfHubSchema').SelfHubTodayThree} [todayThree]
 * @property {import('./selfHubSchema').SelfHubNextAction} [nextAction]
 * @property {import('./selfHubSchema').SelfHubCapacity} [capacity]
 * @property {import('./selfHubSchema').SelfHubMetric[]} [summaryStrip]
 * @property {string|null} capturedAt
 */

/** @typedef {Object} SelfHubDayJournal
 * @property {string} notes
 * @property {Array<{id:string,text:string,done:boolean}>} todos
 * @property {Record<string,{done:boolean,time:string}>} routines
 */

/** @typedef {Object} SelfHubDayEntry
 * @property {string|null} updatedAt
 * @property {Object|null} health — Day Lab metrics patch (from healthToLifeline)
 * @property {SelfHubDayHubSnapshot|null} hub
 * @property {SelfHubDayProjectSnapshot|null} projects
 * @property {SelfHubDayJournal} journal
 */

export function createEmptySelfHubJournal() {
  return { notes: '', todos: [], routines: {} };
}

export function createEmptySelfHubDayEntry() {
  return {
    updatedAt: null,
    health: null,
    hub: null,
    projects: null,
    journal: createEmptySelfHubJournal(),
  };
}

function normalizeJournal(raw) {
  if (!raw || typeof raw !== 'object') return createEmptySelfHubJournal();
  return {
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    todos: Array.isArray(raw.todos)
      ? raw.todos.map((todo) => ({
          id: todo?.id || `day-todo-${Date.now()}`,
          text: todo?.text || '',
          done: todo?.done === true,
        }))
      : [],
    routines:
      raw.routines && typeof raw.routines === 'object' && !Array.isArray(raw.routines)
        ? raw.routines
        : {},
  };
}

function normalizeProjectSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mapItems = (items) =>
    Array.isArray(items)
      ? items.filter((item) => item && typeof item === 'object' && item.id && item.title)
      : [];
  return {
    completed: mapItems(raw.completed),
    notes: mapItems(raw.notes),
    scheduled: mapItems(raw.scheduled),
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : null,
  };
}

function normalizeHubSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    deepWork: raw.deepWork && typeof raw.deepWork === 'object' ? raw.deepWork : undefined,
    todayThree: raw.todayThree && typeof raw.todayThree === 'object' ? raw.todayThree : undefined,
    nextAction: raw.nextAction && typeof raw.nextAction === 'object' ? raw.nextAction : undefined,
    capacity: raw.capacity && typeof raw.capacity === 'object' ? raw.capacity : undefined,
    summaryStrip: Array.isArray(raw.summaryStrip) ? raw.summaryStrip : undefined,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
  };
}

export function normalizeSelfHubDayEntry(raw) {
  if (!raw || typeof raw !== 'object') return createEmptySelfHubDayEntry();
  return {
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    health: raw.health && typeof raw.health === 'object' ? raw.health : null,
    hub: normalizeHubSnapshot(raw.hub),
    projects: normalizeProjectSnapshot(raw.projects),
    journal: normalizeJournal(raw.journal),
  };
}

export function normalizeSelfHubDays(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [date, entry] of Object.entries(raw)) {
    const key = toDateString(date);
    if (!key) continue;
    out[key] = normalizeSelfHubDayEntry(entry);
  }
  return out;
}

export function getSelfHubDayEntry(selfHubDays, dateStr) {
  const key = toDateString(dateStr);
  if (!key) return createEmptySelfHubDayEntry();
  return normalizeSelfHubDayEntry(selfHubDays?.[key]);
}

export function patchSelfHubDayEntry(selfHubDays, dateStr, patch) {
  const key = toDateString(dateStr);
  if (!key) return selfHubDays || {};
  const current = getSelfHubDayEntry(selfHubDays, key);
  return {
    ...(selfHubDays || {}),
    [key]: normalizeSelfHubDayEntry({
      ...current,
      ...patch,
      journal: patch?.journal
        ? normalizeJournal({ ...current.journal, ...patch.journal })
        : current.journal,
      projects: patch?.projects
        ? normalizeProjectSnapshot({ ...current.projects, ...patch.projects })
        : current.projects,
      hub: patch?.hub
        ? normalizeHubSnapshot({ ...current.hub, ...patch.hub })
        : current.hub,
      updatedAt: patch?.updatedAt || new Date().toISOString(),
    }),
  };
}
