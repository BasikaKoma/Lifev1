import { generateId } from '../data/templates';
import { toDateString } from './lifeline';

export const EMPTY_CHECKPOINT_FORM = {
  title: '',
  category: '',
  priority: '',
  description: '',
  planDate: '',
};

export function isPlanDateInRange(planDate, planStartDate, planEndDate) {
  const date = toDateString(planDate);
  const start = toDateString(planStartDate);
  const end = toDateString(planEndDate);
  if (!date || !start || !end) return false;
  return date >= start && date <= end;
}

export function defaultPlanDateForForm(planStartDate, planEndDate) {
  const start = toDateString(planStartDate);
  const end = toDateString(planEndDate);
  if (!start || !end) return '';
  const today = toDateString(new Date());
  if (today && today >= start && today <= end) return today;
  return start;
}

export function emptyCheckpointForm({ requirePlanDate = false, planStartDate, planEndDate } = {}) {
  return {
    ...EMPTY_CHECKPOINT_FORM,
    planDate: requirePlanDate ? defaultPlanDateForForm(planStartDate, planEndDate) : '',
  };
}

export function checkpointToForm(checkpoint, { requirePlanDate = false, planStartDate, planEndDate } = {}) {
  if (!checkpoint) return emptyCheckpointForm({ requirePlanDate, planStartDate, planEndDate });
  const existing = toDateString(checkpoint.planDate) || '';
  return {
    title: checkpoint.title || '',
    category: checkpoint.category || '',
    priority: checkpoint.priority || '',
    description: checkpoint.description || '',
    planDate: existing || (requirePlanDate ? defaultPlanDateForForm(planStartDate, planEndDate) : ''),
  };
}

function resolvePlanDate(form, { requirePlanDate = false, planStartDate, planEndDate } = {}) {
  if (!requirePlanDate) return undefined;
  const planDate = toDateString(form.planDate);
  if (!planDate || !isPlanDateInRange(planDate, planStartDate, planEndDate)) return null;
  return planDate;
}

export function buildCheckpointPatchFromForm(form, options = {}) {
  const title = form.title?.trim();
  if (!title) return null;

  const patch = {
    title,
    category: form.category || '',
    priority: form.priority || '',
    description: form.description?.trim() || '',
  };

  if (options.requirePlanDate) {
    const planDate = resolvePlanDate(form, options);
    if (!planDate) return null;
    patch.planDate = planDate;
  }

  return patch;
}

export function buildCheckpointFromForm(form, options = {}) {
  const title = form.title?.trim();
  if (!title) return null;

  const checkpoint = {
    id: generateId(),
    title,
    checkpointType: 'Number',
    metricName: title,
    currentValue: 0,
    targetValue: 1,
    unit: '',
    currency: 'EUR',
    checklistItems: [],
    category: form.category || '',
    priority: form.priority || '',
    description: form.description?.trim() || '',
    done: false,
    completedAt: null,
    archived: false,
    archivedAt: null,
  };

  if (options.requirePlanDate) {
    const planDate = resolvePlanDate(form, options);
    if (!planDate) return null;
    checkpoint.planDate = planDate;
  }

  return checkpoint;
}

export function isCheckpointFormValid(form, options = {}) {
  if (!form?.title?.trim()) return false;
  if (!options.requirePlanDate) return true;
  return Boolean(resolvePlanDate(form, options));
}
