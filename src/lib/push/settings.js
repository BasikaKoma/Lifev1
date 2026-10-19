import { getSupabaseClient } from '../supabase';

const CACHE_KEY = 'lifev1-push-settings';
const listeners = new Set();

export const BLOCK_LEAD_OPTIONS = [0, 5, 10, 15, 30];
export const HEART_RATE_LIMITS = { min: 60, max: 220 };

export const DEFAULT_PUSH_SETTINGS = {
  /** Master switch: reminders are scheduled for every device of this account. */
  enabled: false,
  blocks: true,
  blockLeadMinutes: 5,
  timer: true,
  dayPlan: true,
  dayPlanTime: '07:30',
  routines: false,
  rhythm: false,
  /** Read by the database trigger on Oura data (supabase/048_heart_rate_alerts.sql). */
  heartRate: true,
  heartRateThreshold: 100,
  /** Morning mood 1–10: with the Oura sleep sync, or 07:00 (supabase/050_mood_checkins.sql). */
  moodCheckin: true,
  /** No weight logged that day by this time → one push (supabase/052_weight_reminder.sql). */
  weightMissing: true,
  weightMissingTime: '11:00',
};

function normalizeTime(value, fallback) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return fallback;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function normalizePushSettings(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const bool = (key) => (typeof source[key] === 'boolean' ? source[key] : DEFAULT_PUSH_SETTINGS[key]);
  const lead = Number(source.blockLeadMinutes);
  const threshold = Number(source.heartRateThreshold);
  return {
    enabled: bool('enabled'),
    blocks: bool('blocks'),
    blockLeadMinutes: BLOCK_LEAD_OPTIONS.includes(lead) ? lead : DEFAULT_PUSH_SETTINGS.blockLeadMinutes,
    timer: bool('timer'),
    dayPlan: bool('dayPlan'),
    dayPlanTime: normalizeTime(source.dayPlanTime, DEFAULT_PUSH_SETTINGS.dayPlanTime),
    routines: bool('routines'),
    rhythm: bool('rhythm'),
    heartRate: bool('heartRate'),
    heartRateThreshold:
      Number.isFinite(threshold) && threshold >= HEART_RATE_LIMITS.min && threshold <= HEART_RATE_LIMITS.max
        ? Math.round(threshold)
        : DEFAULT_PUSH_SETTINGS.heartRateThreshold,
    moodCheckin: bool('moodCheckin'),
    weightMissing: bool('weightMissing'),
    weightMissingTime: normalizeTime(source.weightMissingTime, DEFAULT_PUSH_SETTINGS.weightMissingTime),
  };
}

let current = (() => {
  try {
    return normalizePushSettings(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'));
  } catch {
    return normalizePushSettings(null);
  }
})();

function commit(next) {
  current = normalizePushSettings(next);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(current));
  } catch {
    /* storage full or blocked */
  }
  listeners.forEach((listener) => listener(current));
  return current;
}

export function getPushSettings() {
  return current;
}

export function subscribePushSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadPushSettings(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return current;
  const { data, error } = await supabase
    .from('push_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return current;
  return data ? commit(data.settings) : current;
}

export async function savePushSettings(userId, patch) {
  const next = commit({ ...current, ...patch });
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return next;
  const { error } = await supabase
    .from('push_settings')
    .upsert({ user_id: userId, settings: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

export function clearPushSettingsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  current = normalizePushSettings(null);
}
