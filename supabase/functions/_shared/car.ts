/** A drive left open longer than this had its disconnect lost; its length is unknown. */
export const MAX_TRIP_MS = 12 * 60 * 60_000;
/**
 * A reconnect this soon after a disconnect is the same drive (Bluetooth dropped, or a stop
 * at a kiosk). The app reads a trip only after this long (SETTLE_MS in src/lib/carLog.js).
 */
export const REJOIN_MS = 3 * 60_000;

export type CarEvent = 'connect' | 'disconnect';

export type CarTrip = {
  id: string;
  started_at: string;
  ended_at: string | null;
  imported_at: string | null;
};

export type CarStep =
  | { do: 'none' }
  | { do: 'open'; drop?: string }
  | { do: 'reopen'; id: string }
  | { do: 'close'; id: string }
  | { do: 'drop'; id: string };

export function carEventOf(value: unknown): CarEvent | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (['connect', 'connected', 'start', 'on', 'in'].includes(text)) return 'connect';
  if (['disconnect', 'disconnected', 'stop', 'off', 'out'].includes(text)) return 'disconnect';
  return null;
}

/** What an event does to the user's trips, given the latest one. Sent twice, an event changes nothing more. */
export function carStep(last: CarTrip | null, event: CarEvent, nowMs: number): CarStep {
  const open = last && !last.ended_at ? last : null;
  const stale = open ? nowMs - new Date(open.started_at).getTime() > MAX_TRIP_MS : false;

  if (event === 'disconnect') {
    if (!open) return { do: 'none' };
    return stale ? { do: 'drop', id: open.id } : { do: 'close', id: open.id };
  }

  if (open) return stale ? { do: 'open', drop: open.id } : { do: 'none' };
  if (
    last?.ended_at
    && !last.imported_at
    && nowMs - new Date(last.ended_at).getTime() <= REJOIN_MS
  ) {
    return { do: 'reopen', id: last.id };
  }
  return { do: 'open' };
}
