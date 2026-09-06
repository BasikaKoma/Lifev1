export const PATH_TABS = [
  { id: 'goals', label: 'Goals' },
  { id: 'week', label: 'Week' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'review', label: 'Review' },
];

export const GOAL_ROLES = ['Primary', 'Growth', 'Maintenance'];
export const GOAL_STATUSES = ['Active', 'Paused', 'Completed', 'Archived'];
export const BLOCK_TYPES = [
  'Deep Work',
  'Operations',
  'Sales / Demo',
  'Growth',
  'Learning',
  'Meditation',
  'Workout',
  'Recovery',
];
export const BLOCK_STATUSES = ['Planned', 'Done', 'Moved', 'Skipped'];
export const METRIC_TYPES = ['Outcome', 'Action'];
export const METRIC_DIRECTIONS = ['Increase', 'Decrease', 'Maintain'];
export const METRIC_FREQUENCIES = ['Daily', 'Weekly', 'Monthly'];
export const WEEKDAYS = [
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
  { id: 7, label: 'Sunday', short: 'Sun' },
];

export const GOAL_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#22d3ee',
  '#fb923c',
  '#f472b6',
  '#4ade80',
  '#60a5fa',
  '#c084fc',
  '#facc15',
];

export function normalizeGoalColor(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function nextGoalColor(goals = []) {
  const taken = new Set((goals || []).map((goal) => normalizeGoalColor(goal?.color)).filter(Boolean));
  return GOAL_COLORS.find((color) => !taken.has(color)) || GOAL_COLORS[(goals || []).length % GOAL_COLORS.length];
}

export function assignMissingGoalColors(goals = []) {
  const used = new Set();
  return (goals || []).map((goal, index) => {
    const existing = normalizeGoalColor(goal?.color);
    if (existing) {
      used.add(existing);
      return goal.color === existing ? goal : { ...goal, color: existing };
    }
    const color = GOAL_COLORS.find((item) => !used.has(item)) || GOAL_COLORS[index % GOAL_COLORS.length];
    used.add(color);
    return { ...goal, color };
  });
}

export function goalColorStyle(color) {
  const hex = normalizeGoalColor(color);
  if (!hex) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    '--path-goal-color': hex,
    '--path-goal-soft': `rgba(${r}, ${g}, ${b}, 0.16)`,
    '--path-goal-border': `rgba(${r}, ${g}, ${b}, 0.48)`,
  };
}

export function createPathId(prefix = 'path') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function pick(list, value, fallback = null) {
  return list.includes(value) ? value : fallback;
}

function asString(value) {
  if (value == null) return '';
  return String(value);
}

function asNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNullableNumber(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function normalizePlanSourceFile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = asNullableString(raw.name);
  const id = asNullableString(raw.id);
  if (!name && !id) return null;
  return {
    id: id || createPathId('planfile'),
    name: name || 'plan.pdf',
    size: asNullableNumber(raw.size),
    type: asNullableString(raw.type) || 'application/pdf',
    uploadedAt: asNullableString(raw.uploadedAt || raw.uploaded_at),
    storagePath: asNullableString(raw.storagePath || raw.storage_path),
  };
}

export function createEmptyPlan(overrides = {}) {
  return {
    title: asString(overrides.title),
    startDate: asNullableString(overrides.startDate || overrides.start_date),
    endDate: asNullableString(overrides.endDate || overrides.end_date),
    sourceFile: normalizePlanSourceFile(overrides.sourceFile || overrides.source_file),
  };
}

export function normalizePlan(raw) {
  return createEmptyPlan(raw && typeof raw === 'object' ? raw : {});
}

export function createEmptyGoal(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('goal'),
    title: asString(overrides.title),
    projectId: asNullableString(overrides.projectId || overrides.project_id),
    projectTitle: asNullableString(overrides.projectTitle || overrides.project_title),
    lifeArea: asNullableString(overrides.lifeArea || overrides.life_area),
    role: overrides.role === null ? null : pick(GOAL_ROLES, overrides.role, 'Growth'),
    baseline: asNullableString(overrides.baseline),
    target: asNullableString(overrides.target),
    currentValue: asNullableNumber(overrides.currentValue || overrides.current_value),
    unit: asNullableString(overrides.unit),
    deadline: asNullableString(overrides.deadline),
    why: asNullableString(overrides.why),
    weeklyAllocation: asNullableString(overrides.weeklyAllocation || overrides.weekly_allocation),
    minimumAction: asNullableString(overrides.minimumAction || overrides.minimum_action),
    status: pick(GOAL_STATUSES, overrides.status, 'Active'),
    color: normalizeGoalColor(overrides.color) || null,
    notes: asNullableString(overrides.notes),
    createdAt: overrides.createdAt || overrides.created_at || now,
    updatedAt: overrides.updatedAt || overrides.updated_at || now,
    archivedAt: asNullableString(overrides.archivedAt || overrides.archived_at),
  };
}

export function normalizeGoal(raw = {}) {
  return createEmptyGoal(raw);
}

export function createEmptyBlockStatusEvent(overrides = {}) {
  return {
    status: pick(BLOCK_STATUSES, overrides.status, 'Planned'),
    at: asNullableString(overrides.at) || nowIso(),
    from: asNullableString(overrides.from),
  };
}

export function applyBlockStatus(block, status, at = nowIso()) {
  const current = createEmptyBlock(block || {});
  const nextStatus = pick(BLOCK_STATUSES, status, current.status);
  if (nextStatus === current.status) return current;

  const history = [
    ...(current.statusHistory || []),
    createEmptyBlockStatusEvent({
      status: nextStatus,
      at,
      from: current.status,
    }),
  ].slice(-30);

  return createEmptyBlock({
    ...current,
    status: nextStatus,
    statusAt: nextStatus === 'Planned' ? null : at,
    completedAt: nextStatus === 'Done' ? at : (nextStatus === 'Planned' ? null : current.completedAt),
    skippedAt: nextStatus === 'Skipped' ? at : (nextStatus === 'Planned' ? null : current.skippedAt),
    movedAt: nextStatus === 'Moved' ? at : (nextStatus === 'Planned' ? null : current.movedAt),
    statusHistory: history,
    updatedAt: at,
  });
}

export function createEmptyBlock(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('block'),
    goalId: asNullableString(overrides.goalId || overrides.goal_id),
    projectId: asNullableString(overrides.projectId || overrides.project_id),
    projectTitle: asNullableString(overrides.projectTitle || overrides.project_title),
    title: asString(overrides.title) || 'Time block',
    date: asNullableString(overrides.date),
    weekday: Number.isInteger(overrides.weekday) ? overrides.weekday : weekdayFromDate(overrides.date),
    startTime: asNullableString(overrides.startTime || overrides.start_time),
    order: Number.isFinite(Number(overrides.order)) ? Number(overrides.order) : 0,
    duration: asNullableNumber(overrides.duration),
    blockType: pick(BLOCK_TYPES, overrides.blockType || overrides.block_type, 'Deep Work'),
    normalDuration: asNullableNumber(overrides.normalDuration || overrides.normal_duration),
    minimumDuration: asNullableNumber(overrides.minimumDuration || overrides.minimum_duration),
    minimumAction: asNullableString(overrides.minimumAction || overrides.minimum_action),
    status: pick(BLOCK_STATUSES, overrides.status, 'Planned'),
    taskId: asNullableString(overrides.taskId || overrides.task_id),
    taskTitle: asNullableString(overrides.taskTitle || overrides.task_title),
    taskSource: asNullableString(overrides.taskSource || overrides.task_source),
    completeLinkedTask: Boolean(overrides.completeLinkedTask),
    templateId: asNullableString(overrides.templateId || overrides.template_id),
    notes: asNullableString(overrides.notes),
    desiredOutcome: asNullableString(overrides.desiredOutcome || overrides.desired_outcome),
    resultSummary: asNullableString(overrides.resultSummary || overrides.result_summary),
    remaining: asNullableString(overrides.remaining),
    nextStep: asNullableString(overrides.nextStep || overrides.next_step),
    statusAt: asNullableString(overrides.statusAt || overrides.status_at),
    completedAt: asNullableString(overrides.completedAt || overrides.completed_at),
    skippedAt: asNullableString(overrides.skippedAt || overrides.skipped_at),
    movedAt: asNullableString(overrides.movedAt || overrides.moved_at),
    statusHistory: (Array.isArray(overrides.statusHistory) ? overrides.statusHistory : [])
      .map(createEmptyBlockStatusEvent)
      .filter((item) => item.at),
    actions: sortBlockActions(
      Array.isArray(overrides.actions)
        ? overrides.actions.map(createEmptyBlockAction)
        : [],
    ),
    resources: (Array.isArray(overrides.resources) ? overrides.resources : [])
      .map(createEmptyBlockResource)
      .filter((item) => item.url || item.title),
    createdAt: overrides.createdAt || overrides.created_at || now,
    updatedAt: overrides.updatedAt || overrides.updated_at || now,
  };
}

export function createEmptyBlockAction(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('bact'),
    text: asString(overrides.text),
    completed: Boolean(overrides.completed),
    completedAt: Boolean(overrides.completed)
      ? asNullableString(overrides.completedAt || overrides.completed_at)
      : null,
    position: Number.isFinite(Number(overrides.position)) ? Number(overrides.position) : 0,
    createdAt: overrides.createdAt || overrides.created_at || now,
    updatedAt: overrides.updatedAt || overrides.updated_at || now,
  };
}

export function createEmptyBlockResource(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('bres'),
    title: asNullableString(overrides.title),
    url: asNullableString(overrides.url),
    createdAt: overrides.createdAt || overrides.created_at || now,
  };
}

export function sortBlockActions(actions = []) {
  return [...(actions || [])].sort((a, b) => {
    const pos = (Number(a.position) || 0) - (Number(b.position) || 0);
    if (pos) return pos;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

export function normalizeBlock(raw = {}) {
  return createEmptyBlock(raw);
}

export function createEmptyTemplate(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('tpl'),
    goalId: asNullableString(overrides.goalId || overrides.goal_id),
    title: asString(overrides.title) || 'Weekly block',
    weekday: Number.isInteger(overrides.weekday) ? overrides.weekday : 1,
    startTime: asNullableString(overrides.startTime || overrides.start_time),
    duration: asNullableNumber(overrides.duration),
    blockType: pick(BLOCK_TYPES, overrides.blockType || overrides.block_type, 'Deep Work'),
    normalDuration: asNullableNumber(overrides.normalDuration || overrides.normal_duration),
    minimumDuration: asNullableNumber(overrides.minimumDuration || overrides.minimum_duration),
    minimumAction: asNullableString(overrides.minimumAction || overrides.minimum_action),
    taskId: asNullableString(overrides.taskId || overrides.task_id),
    taskTitle: asNullableString(overrides.taskTitle || overrides.task_title),
    enabled: overrides.enabled !== false,
    createdAt: overrides.createdAt || overrides.created_at || now,
    updatedAt: overrides.updatedAt || overrides.updated_at || now,
  };
}

export function normalizeTemplate(raw = {}) {
  return createEmptyTemplate(raw);
}

export function createEmptyMetricEntry(overrides = {}) {
  return {
    id: overrides.id || createPathId('entry'),
    date: asNullableString(overrides.date),
    value: asNullableNumber(overrides.value),
    note: asNullableString(overrides.note),
  };
}

export function createEmptyMetric(overrides = {}) {
  const now = nowIso();
  return {
    id: overrides.id || createPathId('metric'),
    goalId: asNullableString(overrides.goalId || overrides.goal_id),
    name: asString(overrides.name) || 'Metric',
    type: pick(METRIC_TYPES, overrides.type, 'Outcome'),
    unit: asNullableString(overrides.unit),
    baseline: asNullableNumber(overrides.baseline),
    target: asNullableNumber(overrides.target),
    direction: pick(METRIC_DIRECTIONS, overrides.direction, 'Increase'),
    frequency: pick(METRIC_FREQUENCIES, overrides.frequency, 'Weekly'),
    entries: Array.isArray(overrides.entries)
      ? overrides.entries.map(createEmptyMetricEntry)
      : [],
    createdAt: overrides.createdAt || overrides.created_at || now,
    updatedAt: overrides.updatedAt || overrides.updated_at || now,
  };
}

export function normalizeMetric(raw = {}) {
  return createEmptyMetric(raw);
}

export function createEmptyBundle() {
  return {
    plan: createEmptyPlan(),
    goals: [],
    blocks: [],
    templates: [],
    metrics: [],
    updatedAt: null,
  };
}

export function pathBundleHasContent(bundle) {
  if (!bundle) return false;
  if ((bundle.goals || []).length) return true;
  if ((bundle.blocks || []).length) return true;
  if ((bundle.templates || []).length) return true;
  if ((bundle.metrics || []).length) return true;
  if (String(bundle.plan?.title || '').trim()) return true;
  if (bundle.plan?.sourceFile) return true;
  return false;
}

export function normalizeBundle(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    plan: normalizePlan(source.plan),
    goals: assignMissingGoalColors((Array.isArray(source.goals) ? source.goals : []).map(normalizeGoal)),
    blocks: (Array.isArray(source.blocks) ? source.blocks : []).map(normalizeBlock),
    templates: (Array.isArray(source.templates) ? source.templates : []).map(normalizeTemplate),
    metrics: (Array.isArray(source.metrics) ? source.metrics : []).map(normalizeMetric),
    updatedAt: source.updatedAt || source.updated_at || null,
  };
}

export function weekdayFromDate(isoDate) {
  if (!isoDate) return null;
  const date = parseLocalDate(isoDate);
  if (!date) return null;
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function parseLocalDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfWeekMonday(value = new Date()) {
  const date = typeof value === 'string' ? parseLocalDate(value) : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return toIsoDate(new Date());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return toIsoDate(monday);
}

export function shiftWeek(weekStart, delta) {
  const date = parseLocalDate(weekStart) || new Date();
  date.setDate(date.getDate() + delta * 7);
  return startOfWeekMonday(date);
}

export function weekDates(weekStart) {
  const start = parseLocalDate(weekStart) || parseLocalDate(startOfWeekMonday());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toIsoDate(date);
  });
}

export function missingGoalFields(goal) {
  const missing = [];
  if (!goal?.title?.trim()) missing.push('title');
  if (!goal?.role) missing.push('role');
  if (!goal?.projectTitle && !goal?.lifeArea) missing.push('project or life area');
  if (!goal?.baseline) missing.push('baseline');
  if (!String(goal?.target || '').trim()) missing.push('target');
  if (!goal?.deadline) missing.push('deadline');
  if (!goal?.why) missing.push('why');
  if (!goal?.weeklyAllocation) missing.push('weekly allocation');
  if (!goal?.minimumAction) missing.push('minimum action');
  return missing;
}

export function roleRank(role) {
  const index = GOAL_ROLES.indexOf(role);
  return index === -1 ? GOAL_ROLES.length : index;
}
