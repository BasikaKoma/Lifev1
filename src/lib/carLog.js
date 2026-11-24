import { waitForAuthSession } from './auth';
import { applyCarTrips } from './path/carTrips';
import { nowIso } from './path/schema';
import { loadPathBundle, queuePathSave, readPathBundleLocal } from './path/store';
import { getSupabaseClient, getSupabaseUrl, isSupabaseConfigured } from './supabase';
import { isCloudSyncEnabled } from './vault/mirror';

/**
 * A trip is read this long after it ended: a reconnect sooner than that is the same
 * drive, and the server joins the two (REJOIN_MS in supabase/functions/_shared/car.ts).
 */
const SETTLE_MS = 3 * 60000;

async function signedIn() {
  if (!isSupabaseConfigured()) return null;
  const session = await waitForAuthSession();
  const supabase = getSupabaseClient();
  return session?.user && supabase ? { supabase, userId: session.user.id } : null;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The link the phone opens when it connects to the car ('connect') or leaves it ('disconnect'). */
export function carLogUrl(token, event) {
  return `${getSupabaseUrl()}/functions/v1/car-log?event=${event}&token=${token}`;
}

/** The secret of the user's car links; null when none were made yet. */
export async function fetchCarToken() {
  const auth = await signedIn();
  if (!auth) return null;
  const { data, error } = await auth.supabase
    .from('car_links')
    .select('token')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (error) throw error;
  return data?.token || null;
}

/** Makes the links, or new ones: the links made before stop working. */
export async function createCarToken() {
  const auth = await signedIn();
  if (!auth) throw new Error('Συνδέσου για να φτιάξεις τους συνδέσμους.');
  const token = randomToken();
  const { error } = await auth.supabase
    .from('car_links')
    .upsert({ user_id: auth.userId, token, created_at: nowIso() });
  if (error) throw error;
  return token;
}

export async function removeCarToken() {
  const auth = await signedIn();
  if (!auth) return;
  const { error } = await auth.supabase.from('car_links').delete().eq('user_id', auth.userId);
  if (error) throw error;
}

async function importCarTrips() {
  // A Path kept on this device only would hide the trips from every other device.
  if (!isCloudSyncEnabled()) return 0;
  const auth = await signedIn();
  if (!auth) return 0;
  const { data: trips, error } = await auth.supabase
    .from('car_trips')
    .select('id, started_at, ended_at')
    .eq('user_id', auth.userId)
    .is('imported_at', null)
    .not('ended_at', 'is', null)
    .lt('ended_at', new Date(Date.now() - SETTLE_MS).toISOString())
    .order('started_at', { ascending: true })
    .limit(50);
  if (error || !trips?.length) return 0;

  // Another device may have changed the Path since this one read it; saving from an old copy would undo that.
  await loadPathBundle();
  const result = applyCarTrips(readPathBundleLocal(), trips);
  if (result.added) queuePathSave({ ...result.bundle, updatedAt: nowIso() });

  // Marked read whether or not a block came of it (a trip under a minute gives none),
  // so a block deleted in the Path does not come back.
  await auth.supabase
    .from('car_trips')
    .update({ imported_at: nowIso() })
    .in('id', trips.map((trip) => trip.id));
  return result.added;
}

let running = null;

/**
 * Puts the finished car trips the Path does not hold yet into it as blocks; resolves to how
 * many were added. Quiet when offline, signed out, or before the car tables exist.
 */
export function syncCarTrips() {
  if (!running) {
    running = importCarTrips()
      .catch(() => 0)
      .finally(() => {
        running = null;
      });
  }
  return running;
}
