/** Morning mood check-in: one 1–10 score and an optional note per day (table mood_checkins). */
import { getSupabaseClient } from '../supabase';
import { waitForAuthSession } from '../auth';

const CACHE_KEY = 'lifev1-mood';
const listeners = new Set();

// A notification tap opens lifev1 at /self?mood=1; read it before the router rewrites the URL.
let promptRequested = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('mood');

export function localDayIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeEntry(raw) {
  const score = Number(raw?.score);
  if (!Number.isInteger(score) || score < 1 || score > 10) return null;
  const note = typeof raw?.note === 'string' ? raw.note : '';
  return { score, note };
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeCache(day, entry) {
  // Only the last two weeks: this is a display cache, the table is the record.
  const cache = readCache();
  if (entry) cache[day] = entry;
  else delete cache[day];
  const recent = Object.keys(cache).sort().slice(-14);
  const next = Object.fromEntries(recent.map((key) => [key, cache[key]]));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked */
  }
}

function emit(type) {
  listeners.forEach((listener) => listener(type));
}

export function subscribeMood(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCachedMood(day) {
  return normalizeEntry(readCache()[day]);
}

async function sessionUserId() {
  const session = await waitForAuthSession(40, 50);
  return session?.user?.id || null;
}

export async function loadMood(day) {
  const supabase = getSupabaseClient();
  if (!supabase || !(await sessionUserId())) return getCachedMood(day);
  const { data, error } = await supabase
    .from('mood_checkins')
    .select('score, note')
    .eq('day', day)
    .maybeSingle();
  if (error) return getCachedMood(day);
  const entry = normalizeEntry(data);
  writeCache(day, entry);
  return entry;
}

export async function saveMood(day, { score, note }) {
  const entry = normalizeEntry({ score, note: String(note || '').trim().slice(0, 1000) });
  if (!entry) throw new Error('Διάλεξε από 1 έως 10.');
  const supabase = getSupabaseClient();
  const userId = await sessionUserId();
  if (!supabase || !userId) throw new Error('Δεν είσαι συνδεδεμένος.');

  const { error } = await supabase.from('mood_checkins').upsert({
    user_id: userId,
    day,
    score: entry.score,
    note: entry.note || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  // Answered already: the 07:00 reminder for this day is no longer needed.
  await supabase
    .from('push_schedule')
    .delete()
    .eq('user_id', userId)
    .eq('key', `mood:${day}`)
    .is('sent_at', null);

  writeCache(day, entry);
  emit('saved');
  return entry;
}

/**
 * When the day's mood locks: one hour after the Oura wake-up (supabase/051_mood_lock.sql).
 * lockAt is the end of the day while Oura has no wake-up yet.
 */
export async function loadMoodWindow(day) {
  const supabase = getSupabaseClient();
  if (!supabase || !(await sessionUserId())) return { wakeAt: null, lockAt: null };
  const { data, error } = await supabase.rpc('mood_window', { p_day: day });
  if (error) return { wakeAt: null, lockAt: null };
  const row = Array.isArray(data) ? data[0] : data;
  const toDate = (value) => (value ? new Date(value) : null);
  return { wakeAt: toDate(row?.wake_at), lockAt: toDate(row?.lock_at) };
}

/** Ask the mood card to open its dialog (notification tap while the app is running). */
export function requestMoodPrompt() {
  promptRequested = true;
  emit('prompt');
}

export function consumeMoodPrompt() {
  const requested = promptRequested;
  promptRequested = false;
  return requested;
}
