export const PRIORITY_LEVELS = [
  { value: '', label: '—', shortLabel: '—', className: 'none' },
  { value: 'low', label: 'Χαμηλή', shortLabel: 'L', className: 'low' },
  { value: 'normal', label: 'Κανονική', shortLabel: 'N', className: 'normal' },
  { value: 'high', label: 'Υψηλή', shortLabel: 'H', className: 'high' },
  { value: 'urgent', label: 'Επείγον', shortLabel: '!', className: 'urgent' },
];

export function normalizePriority(value) {
  const v = String(value || '').trim().toLowerCase();
  if (PRIORITY_LEVELS.some((p) => p.value && p.value === v)) return v;
  return '';
}

export function getPriorityMeta(value) {
  const normalized = normalizePriority(value);
  return PRIORITY_LEVELS.find((p) => p.value === normalized) || PRIORITY_LEVELS[0];
}

export function hasPriority(value) {
  return Boolean(normalizePriority(value));
}
