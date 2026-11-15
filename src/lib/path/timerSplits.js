import { blockStartMinutes } from './logic';
import { createEmptyBlock, nowIso, toIsoDate } from './schema';

/**
 * Before stops stayed inside their block, resuming a paused work timer opened a copy of the
 * block from that minute, so one sitting shows as several cards. This joins each run of such
 * copies back into the block the sitting began in, with every gap kept as a stop.
 */

// The copy was created and stamped started in the same call.
const SAME_MOMENT_MS = 5000;

const STATUS_FIELDS = ['status', 'statusAt', 'completedAt', 'skippedAt', 'movedAt', 'statusHistory'];

function clockOf(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function workedOf(block) {
  const worked = Number(block?.workedMinutes);
  return worked > 0 ? worked : 0;
}

/** The minutes the timer wrote: the window a pause gave the block, else the time a stop added. */
function timedLength(block) {
  const length = Number(block?.duration);
  return length > 0 ? length : workedOf(block);
}

function hasOwnContent(block) {
  return Boolean(
    block.actions?.length || block.resources?.length || block.noteSketches?.length
    || block.notes || block.desiredOutcome || block.resultSummary || block.remaining || block.nextStep
    || block.templateId || block.ouraActivityId,
  );
}

/** A copy the older timer opened on resume: created and started the same moment, at its start time, nothing added since. */
function isResumedCopy(block) {
  if (block.kind !== 'block' || block.pauses?.length || hasOwnContent(block)) return false;
  const started = new Date(block.startedAt || '');
  const created = Date.parse(block.createdAt || '');
  if (Number.isNaN(started.getTime()) || !(Math.abs(created - started.getTime()) <= SAME_MOMENT_MS)) return false;
  return block.startTime === clockOf(started) && block.date === toIsoDate(started);
}

/** A block the timer ran on and wrote time to; only such a block can begin a sitting. */
function isTimed(block) {
  return block.kind === 'block' && Boolean(block.startedAt) && workedOf(block) > 0 && blockStartMinutes(block) != null;
}

/** The fields a copy took from its block, so copies of one block share them. */
function sittingKey(block) {
  return JSON.stringify([
    block.date, block.title, block.goalId, block.projectId, block.blockType, block.taskId, block.taskSource,
  ]);
}

/** One block for the sitting: the first one's, ending where the last copy ends, the gaps between them as stops. */
function joinSitting([first, ...copies]) {
  const base = blockStartMinutes(first);
  const pauses = [...(first.pauses || [])];
  let end = timedLength(first);
  let worked = workedOf(first);
  copies.forEach((copy) => {
    const length = timedLength(copy);
    if (!length) return;
    // A minute of overlap is rounding, not work at the same time.
    const from = Math.max(end, blockStartMinutes(copy) - base);
    if (from > end) pauses.push({ at: end, minutes: from - end });
    end = from + length;
    worked += workedOf(copy);
  });
  const statusFrom = first.status === 'Planned'
    ? [...copies].reverse().find((copy) => copy.status !== 'Planned')
    : null;
  return createEmptyBlock({
    ...first,
    ...(statusFrom ? Object.fromEntries(STATUS_FIELDS.map((field) => [field, statusFrom[field]])) : {}),
    duration: end,
    workedMinutes: worked || null,
    pauses,
    updatedAt: nowIso(),
  });
}

/**
 * The bundle with each sitting the older timer split into copies joined back into one block,
 * or the same bundle when there is none. A sitting holding a block in `busyBlockIds` (the
 * running timer's) waits, and so does one of `today` whose last copy has no time yet: it may
 * still be running on another device.
 */
export function joinTimerSplits(bundle, { busyBlockIds = [], today = toIsoDate(new Date()) } = {}) {
  const blocks = bundle?.blocks || [];
  const copyKeys = new Set(blocks.filter(isResumedCopy).map(sittingKey));
  if (!copyKeys.size) return bundle;

  const groups = new Map();
  blocks.forEach((block) => {
    const key = sittingKey(block);
    if (!copyKeys.has(key) || !(isTimed(block) || isResumedCopy(block))) return;
    groups.set(key, [...(groups.get(key) || []), block]);
  });

  const sittings = [];
  groups.forEach((group) => {
    const ordered = [...group].sort((a, b) => (
      blockStartMinutes(a) - blockStartMinutes(b) || String(a.createdAt).localeCompare(String(b.createdAt))
    ));
    let sitting = null;
    let end = 0;
    ordered.forEach((block) => {
      const start = blockStartMinutes(block);
      if (sitting && isResumedCopy(block) && start >= end - 1) {
        sitting.push(block);
        end = Math.max(end, start + timedLength(block));
        return;
      }
      if (!isTimed(block)) return;
      sitting = [block];
      sittings.push(sitting);
      end = start + timedLength(block);
    });
  });

  const busy = new Set(busyBlockIds.filter(Boolean));
  const joined = new Map();
  const dropped = new Set();
  sittings.forEach((sitting) => {
    if (sitting.length < 2 || sitting.some((block) => busy.has(block.id))) return;
    const last = sitting[sitting.length - 1];
    if (last.date === today && !workedOf(last)) return;
    joined.set(sitting[0].id, joinSitting(sitting));
    sitting.slice(1).forEach((copy) => dropped.add(copy.id));
  });
  if (!dropped.size) return bundle;

  return {
    ...bundle,
    blocks: blocks
      .filter((block) => !dropped.has(block.id))
      .map((block) => joined.get(block.id) || block),
    updatedAt: nowIso(),
  };
}
