export const MEMORY_KINDS = [
  'decision',
  'conclusion',
  'preference',
  'value',
  'goal',
  'style',
  'brand',
  'writing_example',
  'law',
  'insight',
  'draft',
];

export const IDENTITY_KINDS = ['preference', 'value', 'goal', 'style', 'brand', 'writing_example'];
export const DURABLE_KINDS = [...IDENTITY_KINDS, 'decision', 'conclusion', 'law'];

export const MEMORY_STATUSES = ['current', 'old', 'superseded', 'archived'];

export const SOURCE_KINDS = ['user', 'brain', 'project', 'self', 'lifeline', 'brand', 'import'];
