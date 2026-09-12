import { generateId } from '../data/templates';
import { toDateString } from './lifeline';
import { computeCapacity, deriveCircadianContext, deriveCurrentState } from './capacityEngine';
import { extractOuraSummary } from './ouraInfo';
import { blocksForDate } from '../lib/path/logic';
import { createEmptyBlock } from '../lib/path/schema';

export const THOUGHT_PROMOTE_TYPES = ['task', 'idea', 'path-next'];
export const EVENING_CLOSE_HOUR = 21;

function nowIso() {
  return new Date().toISOString();
}

export function createThoughtId() {
  return `thought-${generateId()}`;
}

export function createEmptyThought(overrides = {}) {
  return {
    id: overrides.id || createThoughtId(),
    text: typeof overrides.text === 'string' ? overrides.text : '',
    at: typeof overrides.at === 'string' ? overrides.at : nowIso(),
    capacity: asNullableNumber(overrides.capacity),
    capacityLabel: asNullableString(overrides.capacityLabel || overrides.capacity_label),
    ouraReadiness: asNullableNumber(overrides.ouraReadiness ?? overrides.oura_readiness),
    pathBlockId: asNullableString(overrides.pathBlockId || overrides.path_block_id),
    pathBlockTitle: asNullableString(overrides.pathBlockTitle || overrides.path_block_title),
    pathBlockType: asNullableString(overrides.pathBlockType || overrides.path_block_type),
    pathBlockStartTime: asNullableString(overrides.pathBlockStartTime || overrides.path_block_start_time),
    promoted: normalizePromoted(overrides.promoted),
    kept: overrides.kept === true ? true : overrides.kept === false ? false : null,
  };
}

export function normalizeThought(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || raw.body || raw.title || '').trim();
  if (!text) return null;
  return createEmptyThought({ ...raw, text });
}

export function normalizeThoughts(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const thought = normalizeThought(item);
    if (!thought || seen.has(thought.id)) continue;
    seen.add(thought.id);
    out.push(thought);
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function appendThought(thoughts, text, context = {}, at = new Date()) {
  const body = String(text || '').trim();
  if (!body) return thoughts || [];
  const when = at instanceof Date ? at : new Date(at);
  const iso = Number.isNaN(when.getTime()) ? nowIso() : when.toISOString();
  const block = context.pathBlock || null;
  const next = createEmptyThought({
    text: body,
    at: iso,
    capacity: context.capacity,
    capacityLabel: context.capacityLabel,
    ouraReadiness: context.ouraReadiness,
    pathBlockId: block?.id,
    pathBlockTitle: block?.title,
    pathBlockType: block?.blockType,
    pathBlockStartTime: block?.startTime,
  });
  return [...normalizeThoughts(thoughts), next];
}

export function updateThought(thoughts, thoughtId, patch) {
  return normalizeThoughts(thoughts).map((thought) => (
    thought.id === thoughtId ? createEmptyThought({ ...thought, ...patch }) : thought
  ));
}

export function removeThought(thoughts, thoughtId) {
  return normalizeThoughts(thoughts).filter((thought) => thought.id !== thoughtId);
}

export function visibleThoughts(thoughts, { includeDismissed = false } = {}) {
  return normalizeThoughts(thoughts).filter((thought) => includeDismissed || thought.kept !== false);
}

export function pendingEveningThoughts(thoughts) {
  return visibleThoughts(thoughts).filter((thought) => thought.kept == null);
}

export function isEveningCloseWindow(now = new Date()) {
  return now.getHours() >= EVENING_CLOSE_HOUR;
}

export function formatThoughtClock(isoOrDate = new Date()) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatThoughtBlockLabel(thought) {
  if (!thought) return '';
  const title = thought.pathBlockTitle || thought.pathBlockType;
  if (!title) return '';
  return thought.pathBlockStartTime ? `${title} ${thought.pathBlockStartTime}` : title;
}

export function formatThoughtCapacityLabel(thought) {
  if (!thought) return '';
  const parts = [];
  if (thought.capacity != null) {
    parts.push(thought.capacityLabel ? `${thought.capacity} ${thought.capacityLabel}` : `capacity ${thought.capacity}`);
  } else if (thought.ouraReadiness != null) {
    parts.push(`Oura ${thought.ouraReadiness}`);
  }
  return parts.join(' · ');
}

export function formatThoughtContext(thought) {
  return [formatThoughtBlockLabel(thought), formatThoughtCapacityLabel(thought)].filter(Boolean).join(' · ');
}

export function parseHmToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function matchPathBlockAt(blocks, date, at = new Date()) {
  const day = toDateString(date);
  if (!day) return null;
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  const minutes = when.getHours() * 60 + when.getMinutes();
  const dayBlocks = blocksForDate(blocks, day).filter((block) => block.status !== 'Skipped');

  for (const block of dayBlocks) {
    const start = parseHmToMinutes(block.startTime);
    if (start == null) continue;
    const duration = Number(block.duration) || Number(block.normalDuration) || 60;
    const end = start + Math.max(15, duration);
    if (minutes >= start && minutes < end) return block;
  }
  return null;
}

export function nextOpenBlock(blocks, date, at = new Date()) {
  const day = toDateString(date);
  if (!day) return null;
  const when = at instanceof Date ? at : new Date(at);
  const minutes = Number.isNaN(when.getTime()) ? 0 : when.getHours() * 60 + when.getMinutes();
  const dayBlocks = blocksForDate(blocks, day).filter((block) => block.status !== 'Skipped');
  return dayBlocks.find((block) => {
    const start = parseHmToMinutes(block.startTime);
    return start == null || start >= minutes || block.status === 'Planned';
  }) || dayBlocks[dayBlocks.length - 1] || null;
}

export function resolvePathBlockForPromote(blocks, thought) {
  if (thought?.pathBlockId) {
    const hit = (blocks || []).find((block) => block.id === thought.pathBlockId);
    if (hit) return hit;
  }
  const date = toDateString(thought?.at);
  const at = thought?.at ? new Date(thought.at) : new Date();
  return matchPathBlockAt(blocks, date, at) || nextOpenBlock(blocks, date, at);
}

export function applyThoughtToPathNextStep(bundle, thought) {
  const blocks = bundle?.blocks || [];
  const block = resolvePathBlockForPromote(blocks, thought);
  if (!block) return { bundle, block: null };
  const nextStep = String(thought?.text || '').trim();
  if (!nextStep) return { bundle, block };
  const nextBlocks = blocks.map((item) => (
    item.id === block.id
      ? createEmptyBlock({ ...item, nextStep, updatedAt: nowIso() })
      : item
  ));
  return {
    bundle: { ...bundle, blocks: nextBlocks, updatedAt: nowIso() },
    block,
  };
}

export function snapshotThoughtContext({ ouraRow, pathBundle, at = new Date() } = {}) {
  try {
    const when = at instanceof Date ? at : new Date(at);
    const summary = extractOuraSummary(ouraRow);
    const readiness = summary?.readinessScore ?? null;
    const currentState = deriveCurrentState(summary?.stressSummary, readiness) || {};
    const circadianContext = deriveCircadianContext(Number.isNaN(when.getTime()) ? new Date() : when) || {};
    const capacity = computeCapacity({
      recovery: readiness,
      currentState,
      circadianContext,
    });
    const date = toDateString(when);
    const pathBlock = matchPathBlockAt(pathBundle?.blocks, date, when);
    return {
      capacity: capacity?.value ?? null,
      capacityLabel: capacity?.value != null ? capacity.label : null,
      ouraReadiness: readiness,
      pathBlock,
    };
  } catch {
    return {
      capacity: null,
      capacityLabel: null,
      ouraReadiness: null,
      pathBlock: null,
    };
  }
}

export function collectDayThoughts(lifelineDays, dateStr, { includeDismissed = true } = {}) {
  const key = toDateString(dateStr);
  const entry = lifelineDays?.[key];
  const thoughts = visibleThoughts(entry?.thoughts, { includeDismissed });
  return thoughts;
}

export function collectThoughtsForRange(lifelineDays, dates, { includeDismissed = false } = {}) {
  return (dates || []).flatMap((date) => (
    collectDayThoughts(lifelineDays, date, { includeDismissed }).map((thought) => ({
      ...thought,
      date,
    }))
  ));
}

export function groupThoughtsByPathBlock(thoughts) {
  const groups = new Map();
  for (const thought of thoughts || []) {
    const key = thought.pathBlockId || 'open';
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        title: thought.pathBlockId ? formatThoughtBlockLabel(thought) || 'Path block' : 'Χωρίς block',
        thoughts: [],
      });
    }
    groups.get(key).thoughts.push(thought);
  }
  return [...groups.values()];
}

function normalizePromoted(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = THOUGHT_PROMOTE_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  return {
    type,
    at: asNullableString(raw.at) || nowIso(),
    itemId: asNullableString(raw.itemId || raw.item_id),
    projectId: asNullableString(raw.projectId || raw.project_id),
    blockId: asNullableString(raw.blockId || raw.block_id),
  };
}

function asNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNullableNumber(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}
