import { generateId } from '../data/templates';

export const MAX_NORTH_STARS = 3;

export function createNorthStar(overrides = {}) {
  return {
    id: `star-${generateId()}`,
    title: '',
    ...overrides,
  };
}

export function normalizeNorthStars(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title || '').trim();
    const id = String(item.id || '').trim() || `star-${generateId()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title });
    if (out.length >= MAX_NORTH_STARS) break;
  }
  return out;
}

export function northStarsEqual(a, b) {
  return JSON.stringify(normalizeNorthStars(a)) === JSON.stringify(normalizeNorthStars(b));
}
