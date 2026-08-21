/** Shared category taxonomy for milestones, notes, nodes, checkpoints, etc. */

export const ENTITY_TYPES = [
  { id: 'milestone', label: 'Milestone' },
  { id: 'note', label: 'Note' },
  { id: 'checkpoint', label: 'Checkpoint' },
  { id: 'sticky', label: 'Sticky' },
  { id: 'obstacle', label: 'Obstacle' },
  { id: 'resource', label: 'Resource' },
  { id: 'task', label: 'Task' },
];

export const DEFAULT_CATEGORIES = [
  'General',
  'Inbox',
  'Marketing',
  'Product',
  'Sales',
  'Operations',
  'Finance',
  'Growth',
  'Personal',
];

export function normalizeCategory(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function categoryLabel(value) {
  const cat = normalizeCategory(value);
  return cat || 'General';
}

export function collectProjectCategories(project = {}) {
  const found = new Set(DEFAULT_CATEGORIES);
  const add = (value) => {
    const cat = normalizeCategory(value);
    if (cat) found.add(cat);
  };

  (project.stages || []).forEach((stage) => {
    add(stage.category);
    (stage.checkpoints || []).forEach((cp) => add(cp.category));
    (stage.ideas || []).forEach((idea) => add(idea.category));
    (stage.blockers || []).forEach((b) => add(b.category));
    (stage.decisions || []).forEach((d) => add(d.category));
  });
  (project.notes || []).forEach((n) => add(n.category));
  (project.backlog || []).forEach((idea) => add(idea.category));
  (project.canvasStickies || []).forEach((s) => add(s.category));
  (project.canvasObstacles || []).forEach((o) => add(o.category));
  (project.canvasResources || []).forEach((r) => add(r.category));
  (project.canvasTasks || []).forEach((t) => add(t.category));
  (project.goals || []).forEach((g) => add(g.category));

  return Array.from(found).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
