import { weekDates } from './schema';
import { LIFE_WHEEL_AREAS, normalizeLifeAreaId, normalizeWheel } from './wheel';

function positive(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** Minutes given to a block: the time tracked on it, or its length once it is done. */
export function blockLoggedMinutes(block) {
  const worked = positive(block?.workedMinutes);
  if (worked) return worked;
  return block?.status === 'Done' ? positive(block.duration) : 0;
}

function emptyRow() {
  return { planned: 0, logged: 0, parts: new Map() };
}

function addToRow(row, { key, title, kind }, planned, logged) {
  row.planned += planned;
  row.logged += logged;
  const part = row.parts.get(key) || { key, title, kind, planned: 0, logged: 0 };
  part.planned += planned;
  part.logged += logged;
  row.parts.set(key, part);
}

function closeRow(row) {
  const weight = (part) => Math.max(part.planned, part.logged);
  return {
    planned: row.planned,
    logged: row.logged,
    parts: [...row.parts.values()].sort((a, b) => weight(b) - weight(a) || a.title.localeCompare(b.title)),
  };
}

/**
 * Where a week's block time went, by life-wheel area. A block counts for its goal's
 * area, or for its own when it serves no goal. Blocks with neither are returned
 * apart as `unassigned`, so nothing is guessed. Skipped blocks are not planned time.
 */
export function weekLifeAreaTime(bundle, weekStart) {
  const dates = new Set(weekDates(weekStart));
  const goalsById = new Map((bundle?.goals || []).map((goal) => [goal.id, goal]));
  const scores = normalizeWheel(bundle?.plan?.wheel).scores;
  const rows = new Map(LIFE_WHEEL_AREAS.map((area) => [area.id, emptyRow()]));
  const unassigned = emptyRow();

  for (const block of bundle?.blocks || []) {
    if (!dates.has(block.date)) continue;
    const planned = block.status === 'Skipped' ? 0 : positive(block.duration);
    const logged = blockLoggedMinutes(block);
    if (!planned && !logged) continue;
    const goal = block.goalId ? goalsById.get(block.goalId) || null : null;
    const areaId = normalizeLifeAreaId(goal ? goal.lifeAreaId : block.lifeAreaId);
    const title = String((goal ? goal.title : block.title) || '').trim() || (goal ? 'Goal' : 'Block');
    const part = goal
      ? { key: `goal:${goal.id}`, title, kind: 'goal' }
      : { key: `block:${title.toLowerCase()}`, title, kind: 'block' };
    addToRow(areaId ? rows.get(areaId) : unassigned, part, planned, logged);
  }

  const areas = LIFE_WHEEL_AREAS.map((area) => ({
    ...area,
    score: scores[area.id] ?? null,
    ...closeRow(rows.get(area.id)),
  }));
  return {
    areas,
    unassigned: closeRow(unassigned),
    planned: areas.reduce((sum, area) => sum + area.planned, unassigned.planned),
    logged: areas.reduce((sum, area) => sum + area.logged, unassigned.logged),
  };
}

/** Areas scored at or under `ceiling` on the wheel that got no block at all this week. */
export function neglectedLifeAreas(areas = [], ceiling = 6) {
  return areas
    .filter((area) => area.score != null && area.score <= ceiling && !area.planned && !area.logged)
    .sort((a, b) => a.score - b.score);
}
