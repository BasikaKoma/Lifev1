import { minutesToClock, nextBlockOrder } from './logic';
import { applyBlockStatus, createEmptyBlock, toIsoDate } from './schema';

export const CAR_BLOCK_TITLE = 'Οδήγηση';
/** Longer than this is a disconnect that never arrived, not a drive. */
const MAX_TRIP_MINUTES = 12 * 60;

/** A trip always becomes the same block, so reading it twice (two devices) adds it once. */
export function carBlockId(tripId) {
  return `block-car-${tripId}`;
}

/**
 * The Path block a finished trip stands for: done, at the hours it was driven, with its
 * length as tracked time. 'Personal' so it counts under Προσωπικά instead of a business.
 * Null for a trip under a minute or too long to be one.
 */
export function carTripBlock(trip, blocks = []) {
  const start = new Date(trip?.started_at);
  const end = new Date(trip?.ended_at);
  if (!trip?.id || !trip.ended_at || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1 || minutes > MAX_TRIP_MINUTES) return null;
  const date = toIsoDate(start);
  return applyBlockStatus(createEmptyBlock({
    id: carBlockId(trip.id),
    title: CAR_BLOCK_TITLE,
    blockType: 'Personal',
    date,
    startTime: minutesToClock(start.getHours() * 60 + start.getMinutes()),
    duration: minutes,
    workedMinutes: minutes,
    startedAt: start.toISOString(),
    order: nextBlockOrder(blocks, date),
  }), 'Done', end.toISOString());
}

/**
 * Adds a block for every trip the Path does not hold yet; `added` says how many.
 * Blocks already there are left as they are.
 */
export function applyCarTrips(bundle, trips = []) {
  const blocks = [...(bundle?.blocks || [])];
  const known = new Set(blocks.map((block) => block.id));
  let added = 0;
  const inOrder = [...(trips || [])].sort((a, b) => new Date(a?.started_at) - new Date(b?.started_at));
  for (const trip of inOrder) {
    const block = carTripBlock(trip, blocks);
    if (!block || known.has(block.id)) continue;
    blocks.push(block);
    known.add(block.id);
    added += 1;
  }
  return added ? { bundle: { ...bundle, blocks }, added } : { bundle, added };
}
