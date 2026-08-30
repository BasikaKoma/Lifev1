import { localTodayIsoDate } from '../../utils/selfDateUtils';
import {
  createEmptyBlock,
  parseLocalDate,
  roleRank,
  startOfWeekMonday,
  toIsoDate,
  weekDates,
  weekdayFromDate,
} from './schema';

function toNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function activeGoals(goals = []) {
  return (goals || []).filter((goal) => goal.status === 'Active' || goal.status === 'Paused');
}

export function visibleGoals(goals = [], { includeArchived = false } = {}) {
  return (goals || []).filter((goal) => {
    if (goal.status === 'Archived') return includeArchived;
    return true;
  });
}

export function metricsForGoal(metrics = [], goalId) {
  return (metrics || []).filter((metric) => metric.goalId === goalId);
}

export function latestMetricValue(metric) {
  if (!metric?.entries?.length) return null;
  const sorted = [...metric.entries]
    .filter((entry) => entry.value != null && entry.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return sorted[0]?.value ?? null;
}

export function resolveCurrentValue(goal, metrics = []) {
  if (!goal) return null;
  if (toNum(goal.currentValue) != null) return goal.currentValue;
  const linked = metricsForGoal(metrics, goal.id);
  const outcome = linked.find((metric) => metric.type === 'Outcome');
  const fromOutcome = outcome ? latestMetricValue(outcome) : null;
  if (fromOutcome != null) return fromOutcome;
  for (const metric of linked) {
    const value = latestMetricValue(metric);
    if (value != null) return value;
  }
  return null;
}

export function computeGoalProgress(goal, metrics = []) {
  const current = resolveCurrentValue(goal, metrics);
  const target = toNum(goal?.target);
  const baseline = toNum(goal?.baseline);
  if (current == null || target == null) return null;
  const start = baseline == null ? 0 : baseline;
  const span = target - start;
  if (span === 0) return current === target ? 1 : 0;
  return (current - start) / span;
}

function inferDirection(goal, metrics = []) {
  const linked = metricsForGoal(metrics, goal?.id);
  const outcome = linked.find((metric) => metric.type === 'Outcome');
  if (outcome?.direction) return outcome.direction;
  const baseline = toNum(goal?.baseline);
  const target = toNum(goal?.target);
  if (baseline != null && target != null && target < baseline) return 'Decrease';
  return 'Increase';
}

export function computeTrackStatus(goal, metrics = []) {
  const current = resolveCurrentValue(goal, metrics);
  const target = toNum(goal?.target);
  if (current == null || target == null) return 'No data';

  const direction = inferDirection(goal, metrics);
  const baseline = toNum(goal?.baseline);
  const startDate = parseLocalDate(goal?.createdAt?.slice(0, 10)) || parseLocalDate(goal?.deadline);
  const endDate = parseLocalDate(goal?.deadline);
  const today = parseLocalDate(localTodayIsoDate());

  if (direction === 'Maintain') {
    const tolerance = Math.abs(target) * 0.08 || 1;
    return Math.abs(current - target) <= tolerance ? 'On track' : 'At risk';
  }

  if (startDate && endDate && today && endDate.getTime() > startDate.getTime()) {
    const total = endDate.getTime() - startDate.getTime();
    const elapsed = Math.min(total, Math.max(0, today.getTime() - startDate.getTime()));
    const t = elapsed / total;
    const startValue = baseline == null ? current : baseline;
    const expected = startValue + (target - startValue) * t;
    const slack = Math.abs(target - startValue) * 0.05;
    if (direction === 'Decrease') {
      return current <= expected + slack ? 'On track' : 'At risk';
    }
    return current >= expected - slack ? 'On track' : 'At risk';
  }

  const progress = computeGoalProgress(goal, metrics);
  if (progress == null) return 'No data';
  return progress >= 0 ? 'On track' : 'At risk';
}

export function weekBlockStats(blocks = [], goalId, weekStart) {
  const dates = new Set(weekDates(weekStart));
  const weekBlocks = (blocks || []).filter((block) => block.goalId === goalId && dates.has(block.date));
  return {
    planned: weekBlocks.filter((block) => block.status === 'Planned' || block.status === 'Moved').length,
    done: weekBlocks.filter((block) => block.status === 'Done').length,
    skipped: weekBlocks.filter((block) => block.status === 'Skipped').length,
    total: weekBlocks.length,
  };
}

export function blocksForDate(blocks = [], date) {
  return (blocks || [])
    .filter((block) => block.date === date)
    .sort(compareBlocks);
}

export function compareBlocks(a, b) {
  const timeA = a.startTime || '99:99';
  const timeB = b.startTime || '99:99';
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

export function sortGoals(goals = []) {
  return [...(goals || [])].sort((a, b) => {
    const statusRank = (status) => {
      if (status === 'Active') return 0;
      if (status === 'Paused') return 1;
      if (status === 'Completed') return 2;
      return 3;
    };
    if (statusRank(a.status) !== statusRank(b.status)) {
      return statusRank(a.status) - statusRank(b.status);
    }
    if (roleRank(a.role) !== roleRank(b.role)) return roleRank(a.role) - roleRank(b.role);
    return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
  });
}

function goalForBlock(block, goals = []) {
  return (goals || []).find((goal) => goal.id === block.goalId) || null;
}

export function sortBlocksByPriority(blocks = [], goals = []) {
  return [...(blocks || [])].sort((a, b) => {
    const goalA = goalForBlock(a, goals);
    const goalB = goalForBlock(b, goals);
    const rankA = roleRank(goalA?.role);
    const rankB = roleRank(goalB?.role);
    if (rankA !== rankB) return rankA - rankB;
    return compareBlocks(a, b);
  });
}

export function todayPathBlocks(bundle, date = localTodayIsoDate()) {
  return blocksForDate(bundle?.blocks, date).filter((block) => block.status !== 'Skipped');
}

export function buildTodayThreeFromPath(bundle, date = localTodayIsoDate()) {
  const blocks = todayPathBlocks(bundle, date);
  if (!blocks.length) return null;

  const items = [];
  const seen = new Set();
  for (const block of sortBlocksByPriority(blocks, bundle?.goals)) {
    const key = block.taskId || block.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: key,
      text: block.title,
      done: block.status === 'Done',
    });
    if (items.length >= 3) break;
  }
  return { source: 'computed', items };
}

export function buildNextActionFromPath(bundle, date = localTodayIsoDate()) {
  const incomplete = todayPathBlocks(bundle, date).filter(
    (block) => block.status === 'Planned' || block.status === 'Moved',
  );
  if (!incomplete.length) return null;

  const top = sortBlocksByPriority(incomplete, bundle?.goals)[0];
  const goal = goalForBlock(top, bundle?.goals);
  const action = top.minimumAction || top.title;
  const message = goal?.title ? `${action}. ${goal.title}` : action;
  return {
    title: 'NEXT BEST ACTION',
    message,
    buttonLabel: 'Start Focus',
    source: 'computed',
  };
}

export function materializeWeekBlocks(bundle, weekStart) {
  const start = weekStart || startOfWeekMonday();
  const dates = weekDates(start);
  const existing = new Set(
    (bundle.blocks || [])
      .filter((block) => block.templateId && block.date)
      .map((block) => `${block.templateId}:${block.date}`),
  );
  const created = [];
  for (const template of bundle.templates || []) {
    if (!template.enabled) continue;
    const date = dates[(template.weekday || 1) - 1];
    if (!date) continue;
    const key = `${template.id}:${date}`;
    if (existing.has(key)) continue;
    created.push(createEmptyBlock({
      goalId: template.goalId,
      title: template.title,
      date,
      weekday: weekdayFromDate(date),
      startTime: template.startTime,
      duration: template.duration,
      blockType: template.blockType,
      normalDuration: template.normalDuration,
      minimumDuration: template.minimumDuration,
      minimumAction: template.minimumAction,
      taskId: template.taskId,
      taskTitle: template.taskTitle,
      templateId: template.id,
      status: 'Planned',
    }));
  }
  if (!created.length) return bundle;
  return {
    ...bundle,
    blocks: [...(bundle.blocks || []), ...created],
  };
}

export function formatDuration(minutes) {
  const value = toNum(minutes);
  if (value == null) return null;
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatDateLabel(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) return isoDate || '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatWeekRange(weekStart) {
  const dates = weekDates(weekStart);
  const start = parseLocalDate(dates[0]);
  const end = parseLocalDate(dates[6]);
  if (!start || !end) return '';
  const startLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(end);
  return `${startLabel} – ${endLabel}`;
}

export function collectLinkableTasks({ stages = [], canvasTasks = [], projectActivity = [], projectId, projectTitle } = {}) {
  const tasks = [];
  const seen = new Set();
  const addCheckpoint = (checkpoint, sourceProjectId, sourceTitle) => {
    if (!checkpoint?.id || checkpoint.archived || checkpoint.done || seen.has(checkpoint.id)) return;
    seen.add(checkpoint.id);
    tasks.push({
      id: checkpoint.id,
      title: checkpoint.title,
      source: 'checkpoint',
      projectId: sourceProjectId || null,
      projectTitle: sourceTitle || null,
    });
  };
  const addCanvas = (task, sourceProjectId, sourceTitle) => {
    if (!task?.id || task.status === 'Done' || seen.has(task.id)) return;
    seen.add(task.id);
    tasks.push({
      id: task.id,
      title: task.title,
      source: 'canvas',
      projectId: sourceProjectId || null,
      projectTitle: sourceTitle || null,
    });
  };

  for (const stage of stages || []) {
    for (const checkpoint of stage.checkpoints || []) {
      addCheckpoint(checkpoint, projectId, projectTitle);
    }
  }
  for (const task of canvasTasks || []) addCanvas(task, projectId, projectTitle);

  for (const project of projectActivity || []) {
    if (project.id && project.id === projectId) continue;
    for (const stage of project.stages || []) {
      for (const checkpoint of stage.checkpoints || []) {
        addCheckpoint(checkpoint, project.id, project.title);
      }
    }
    for (const task of project.canvasTasks || []) {
      addCanvas(task, project.id, project.title);
    }
  }

  return tasks;
}

export function progressPercent(progress) {
  if (progress == null || !Number.isFinite(progress)) return null;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

export function addDaysIso(isoDate, days) {
  const date = parseLocalDate(isoDate);
  if (!date) return isoDate;
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
