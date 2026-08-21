/** Canvas insert shortcuts (Settings → Shortcuts). */
export const CANVAS_INSERT_SHORTCUTS = [
  { key: 'N', action: 'note', label: 'Note' },
  { key: 'M', action: 'milestone', label: 'Milestone' },
  { key: 'T', action: 'task', label: 'Task' },
  { key: 'O', action: 'obstacle', label: 'Obstacle' },
  { key: 'R', action: 'resource', label: 'Resource' },
];

/** Match Latin or Greek keyboard letters to an insert action. */
export function matchInsertShortcut(key) {
  if (!key || key.length !== 1) return null;
  const k = key.toLowerCase();
  if (k === 'n' || k === 'ν') return 'note';
  if (k === 'm' || k === 'μ') return 'milestone';
  if (k === 't' || k === 'τ') return 'task';
  if (k === 'o' || k === 'ο') return 'obstacle';
  if (k === 'r' || k === 'ρ') return 'resource';
  return null;
}
