import { generateId } from '../data/templates';

export const FRONT_COLORS = [
  '#f5c542',
  '#3ee0a0',
  '#ff5fa2',
  '#c084fc',
  '#38bdf8',
  '#fb923c',
];

const FRONT_MAX = 8;

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 28);
}

function cleanColor(value, fallback) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

export function normalizeFronts(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const fronts = [];
  const seen = new Set();
  for (const item of list) {
    const id = String(item?.id || '').trim();
    const label = cleanLabel(item?.label);
    const atY = Number(item?.atY);
    if (!id || !label || seen.has(id) || !Number.isFinite(atY) || fronts.length >= FRONT_MAX) continue;
    seen.add(id);
    const offsetX = Number(item?.offsetX);
    fronts.push({
      id,
      label,
      atY,
      color: cleanColor(item?.color, FRONT_COLORS[fronts.length % FRONT_COLORS.length]),
      ...(Number.isFinite(offsetX) ? { offsetX } : {}),
    });
  }
  return fronts;
}

export function addFront(fronts, { atY, label }) {
  const list = normalizeFronts(fronts);
  const text = cleanLabel(label);
  if (!text || !Number.isFinite(Number(atY)) || list.length >= FRONT_MAX) return list;
  return [
    ...list,
    {
      id: `front-${generateId()}`,
      label: text,
      atY: Number(atY),
      color: FRONT_COLORS[list.length % FRONT_COLORS.length],
    },
  ];
}

export function renameFront(fronts, id, label) {
  const text = cleanLabel(label);
  if (!text) return normalizeFronts(fronts);
  return normalizeFronts(fronts).map((front) => (front.id === id ? { ...front, label: text } : front));
}

export function recolorFront(fronts, id, color) {
  const list = normalizeFronts(fronts);
  const current = list.find((front) => front.id === id);
  const next = cleanColor(color, current?.color);
  if (!next || next === current?.color) return list;
  return list.map((front) => (front.id === id ? { ...front, color: next } : front));
}

export function removeFront(fronts, id) {
  return normalizeFronts(fronts).filter((front) => front.id !== id);
}

export function shiftFronts(fronts, dy) {
  if (!dy) return normalizeFronts(fronts);
  return normalizeFronts(fronts).map((front) => ({ ...front, atY: front.atY + dy }));
}

const FRONT_OFFSET_MIN = 150;
const FRONT_OFFSET_MAX = 1100;

export function frontOffsetX(front, index) {
  const value = Number(front?.offsetX);
  if (Number.isFinite(value) && Math.abs(value) >= FRONT_OFFSET_MIN) return value;
  const side = index % 2 === 0 ? -1 : 1;
  const slot = Math.floor(index / 2) + 1;
  return side * slot * 210;
}

export function setFrontOffset(fronts, id, offsetX) {
  const next = Number(offsetX);
  if (!Number.isFinite(next)) return normalizeFronts(fronts);
  const sign = next < 0 ? -1 : 1;
  const clamped = sign * Math.min(FRONT_OFFSET_MAX, Math.max(FRONT_OFFSET_MIN, Math.abs(next)));
  return normalizeFronts(fronts).map((front) => (
    front.id === id ? { ...front, offsetX: clamped } : front
  ));
}

export function frontAnchorX(centerX, index, front) {
  return centerX + frontOffsetX(front, index);
}

export function frontsForLayout(fronts, layout = {}) {
  const centerX = layout.centerX ?? 480;
  const top = typeof layout.top === 'number' ? layout.top : 0;
  return normalizeFronts(fronts).map((front, index) => ({
    id: front.id,
    x: frontAnchorX(centerX, index, front),
    top,
    bottom: front.atY,
  }));
}
