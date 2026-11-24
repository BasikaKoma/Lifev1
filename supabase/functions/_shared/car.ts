/** A drive left open longer than this had its disconnect lost; its length is unknown. */
export const MAX_TRIP_MS = 12 * 60 * 60_000;
/**
 * A reconnect this soon after a disconnect is the same drive (Bluetooth dropped, or a stop
 * at a kiosk). The app reads a trip only after this long (SETTLE_MS in src/lib/carLog.js).
 */
export const REJOIN_MS = 3 * 60_000;
/**
 * A connect this soon after the open drive started is the same connect sent twice. Later than this,
 * the disconnect before it never arrived (no signal where the car was parked): that drive's end is
 * unknown, so it is dropped rather than joined to this one.
 */
export const DOUBLE_CONNECT_MS = 3 * 60_000;

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
  const openFor = open ? nowMs - new Date(open.started_at).getTime() : 0;

  if (event === 'disconnect') {
    if (!open) return { do: 'none' };
    return openFor > MAX_TRIP_MS ? { do: 'drop', id: open.id } : { do: 'close', id: open.id };
  }

  if (open) return openFor <= DOUBLE_CONNECT_MS ? { do: 'none' } : { do: 'open', drop: open.id };
  if (
    last?.ended_at
    && !last.imported_at
    && nowMs - new Date(last.ended_at).getTime() <= REJOIN_MS
  ) {
    return { do: 'reopen', id: last.id };
  }
  return { do: 'open' };
}
