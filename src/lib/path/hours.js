import { blockAccentColor, blockKindLabel, blockNetMinutes, isReminder, weekDates } from './schema';
import { foldSearchText } from './logic';
import { blockLoggedMinutes } from './areaTime';
import { WORK_WHEEL_AREAS } from './wheel';

/**
 * The category a block type stands for by itself. The types left out (Deep Work, Operations,
 * Sales / Demo, Growth) are kinds of work: they count for a business, not for themselves.
 */
const TYPE_CATEGORY = {
  Meal: 'Γεύμα',
  Workout: 'Προπόνηση',
  Meditation: 'Διαλογισμός',
  Recovery: 'Αποκατάσταση',
  Learning: 'Μάθηση',
  Planning: 'Οργάνωση',
  Personal: 'Προσωπικά',
};

const BUSINESSES = WORK_WHEEL_AREAS.map((area) => area.label);

// Names looked for in a title, the businesses first: "Symphon - product" counts for Symphon
// whatever its type, and "Γευμα 1" for Γεύμα.
const TITLE_NAMES = [...BUSINESSES, ...Object.values(TYPE_CATEGORY)];

function positive(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** Same name whatever the case, accents or spacing: "MarketPortal" is "Market Portal". */
function nameKey(name) {
  return foldSearchText(name).replace(/[\s\-–—_/:·.]+/g, '');
}

function nameIn(text, names) {
  const key = nameKey(text);
  return (key && names.find((name) => key.includes(nameKey(name)))) || null;
}

function isBusiness(name) {
  return BUSINESSES.includes(name);
}

function count(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function leading(counts) {
  if (!counts) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || BUSINESSES.indexOf(a[0]) - BUSINESSES.indexOf(b[0]))[0]?.[0] || null;
}

/**
 * Says which category a block or template counts for, from what it already carries; nothing
 * is picked by hand. In order:
 *  1. a known name in its title (a business, or "Γεύμα" and the like);
 *  2. what its type stands for (Workout → Προπόνηση);
 *  3. for a kind of work (Sales / Demo, Deep Work…): the business its goal names, else the
 *     one most blocks of that goal name, else the one most of the work names. So a
 *     "Ραντεβού" typed Sales / Demo counts under Symphon instead of standing apart.
 * Only when no business is named anywhere does a kind of work count for itself.
 */
export function categorizer(bundle) {
  const goals = new Map((bundle?.goals || []).map((goal) => [goal.id, goal]));
  const byGoal = new Map();
  const overall = new Map();
  for (const item of [...(bundle?.templates || []), ...(bundle?.blocks || [])]) {
    const business = isReminder(item) ? null : nameIn(item.title, BUSINESSES);
    if (!business) continue;
    count(overall, business);
    if (item.goalId) {
      if (!byGoal.has(item.goalId)) byGoal.set(item.goalId, new Map());
      count(byGoal.get(item.goalId), business);
    }
  }
  return (item) => {
    const named = nameIn(item?.title, TITLE_NAMES);
    if (named) return named;
    const byType = TYPE_CATEGORY[item?.blockType];
    if (byType) return byType;
    const goal = goals.get(item?.goalId);
    const goalNames = goal ? nameIn(`${goal.title || ''} ${goal.projectTitle || ''} ${goal.lifeArea || ''}`, BUSINESSES) : null;
    return goalNames || leading(byGoal.get(item?.goalId)) || leading(overall) || item?.blockType || 'Άλλο';
  };
}

/**
 * What an item is listed as inside its category: in a business its area (Sales / Demo,
 * Support…; with none, whether it is deep or shallow work), elsewhere its title.
 */
function partName(item, category) {
  if (isBusiness(category) && blockKindLabel(item)) return blockKindLabel(item);
  return String(item?.title || '').trim() || '—';
}

function addEntry(rows, item, category, { planned, logged, color }) {
  const row = rows.get(category) || { name: category, planned: 0, logged: 0, colors: new Map(), parts: new Map() };
  rows.set(category, row);
  row.planned += planned;
  row.logged += logged;
  if (color) row.colors.set(color, (row.colors.get(color) || 0) + Math.max(planned, logged));
  const name = partName(item, category);
  const key = nameKey(name);
  const part = row.parts.get(key) || { key, name, planned: 0, logged: 0 };
  row.parts.set(key, part);
  part.planned += planned;
  part.logged += logged;
}

function closeRows(rows) {
  const weight = (item) => Math.max(item.planned, item.logged);
  const bySize = (a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name, 'el');
  const list = [...rows.values()].map((row) => ({
    key: row.name,
    name: row.name,
    planned: row.planned,
    logged: row.logged,
    // The colour most of its time is drawn in on the week.
    color: [...row.colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      || WORK_WHEEL_AREAS.find((area) => area.label === row.name)?.color
      || null,
    parts: [...row.parts.values()].sort(bySize),
  })).sort(bySize);
  return {
    rows: list,
    planned: list.reduce((sum, row) => sum + row.planned, 0),
    logged: list.reduce((sum, row) => sum + row.logged, 0),
  };
}

function goalColors(bundle) {
  return new Map((bundle?.goals || []).map((goal) => [goal.id, goal.color]));
}

/**
 * A week's block time by category: `planned` is what the week holds (skipped blocks left
 * out), `logged` what was really done (time tracked, or a done block's length).
 * Reminders have no length and are not counted.
 */
export function weekHours(bundle, weekStart) {
  const dates = new Set(weekDates(weekStart));
  const categoryOf = categorizer(bundle);
  const colors = goalColors(bundle);
  const rows = new Map();
  for (const block of bundle?.blocks || []) {
    if (!dates.has(block.date) || isReminder(block)) continue;
    const planned = block.status === 'Skipped' ? 0 : positive(blockNetMinutes(block));
    const logged = blockLoggedMinutes(block);
    if (!planned && !logged) continue;
    addEntry(rows, block, categoryOf(block), { planned, logged, color: blockAccentColor(block, colors.get(block.goalId)) });
  }
  return closeRows(rows);
}

/** The template week's time by category: what every new week starts with. Nothing is logged here. */
export function templateHours(bundle) {
  const categoryOf = categorizer(bundle);
  const colors = goalColors(bundle);
  const rows = new Map();
  for (const template of bundle?.templates || []) {
    const planned = template.enabled === false ? 0 : positive(template.duration);
    if (!planned) continue;
    addEntry(rows, template, categoryOf(template), { planned, logged: 0, color: blockAccentColor(template, colors.get(template.goalId)) });
  }
  return closeRows(rows);
}
