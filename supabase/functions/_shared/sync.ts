import { getServiceClient } from './supabase.ts';
import {
  extractSleepSessionHeartRateSamples,
  fetchOuraAllData,
  isoDateDaysAgo,
  mergeHeartRateSamples,
  OURA_SYNC_DAYS,
  refreshAccessToken,
  syncEndIsoDate,
  tokenExpiresAt,
} from './oura.ts';

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickScore(row: Record<string, unknown> | undefined): number | null {
  return asNumber(row?.score);
}

function pickActivityField(
  row: Record<string, unknown> | undefined,
  key: string,
): number | null {
  return asNumber(row?.[key]);
}

async function upsertSyncedMetrics(userId: string, accessToken: string) {
  const startDate = isoDateDaysAgo(OURA_SYNC_DAYS);
  const endDate = syncEndIsoDate();
  const data = await fetchOuraAllData(accessToken, startDate, endDate);
  const { grouped, summarizeHeartRate, personalInfo, ringConfiguration } = data;

  const days = new Set<string>([
    ...grouped.sleepByDay.keys(),
    ...grouped.readinessByDay.keys(),
    ...grouped.activityByDay.keys(),
    ...grouped.stressByDay.keys(),
    ...grouped.spo2ByDay.keys(),
    ...grouped.heartRateByDay.keys(),
    ...grouped.workoutsByDay.keys(),
    ...grouped.sessionsByDay.keys(),
  ]);

  const rows = [...days].map((day) => {
    const sleep = grouped.sleepByDay.get(day)?.[0] as Record<string, unknown> | undefined;
    const readiness = grouped.readinessByDay.get(day)?.[0] as Record<string, unknown> | undefined;
    const activity = grouped.activityByDay.get(day)?.[0] as Record<string, unknown> | undefined;
    const stress = grouped.stressByDay.get(day)?.[0] as Record<string, unknown> | undefined;
    const spo2 = grouped.spo2ByDay.get(day)?.[0] as Record<string, unknown> | undefined;
    const apiHeartRateSamples = grouped.heartRateByDay.get(day) ?? [];
    const sleepHeartRateSamples = extractSleepSessionHeartRateSamples(
      grouped.sleepSessionsByDay.get(day) ?? [],
    );
    const heartRateSamples = mergeHeartRateSamples(apiHeartRateSamples, sleepHeartRateSamples);
    const heartRate = summarizeHeartRate(heartRateSamples);
    const spo2Average = asNumber((spo2?.spo2_percentage as Record<string, unknown> | undefined)?.average);

    return {
      user_id: userId,
      day,
      sleep_score: pickScore(sleep),
      readiness_score: pickScore(readiness),
      activity_score: pickScore(activity),
      active_calories: pickActivityField(activity, 'active_calories'),
      total_calories: pickActivityField(activity, 'total_calories'),
      target_calories: pickActivityField(activity, 'target_calories'),
      steps: pickActivityField(activity, 'steps'),
      payload: {
        sleep,
        readiness,
        activity,
        stress,
        spo2,
        heart_rate: heartRate,
        heart_rate_samples: heartRateSamples.map((sample) => ({
          timestamp: sample.timestamp,
          bpm: sample.bpm,
          source: sample.source ?? null,
        })),
        sleep_sessions: grouped.sleepSessionsByDay.get(day) ?? [],
        sleep_time: grouped.sleepTimeByDay.get(day) ?? [],
        workouts: grouped.workoutsByDay.get(day) ?? [],
        sessions: grouped.sessionsByDay.get(day) ?? [],
        tags: grouped.tagsByDay.get(day) ?? [],
        rest_mode_periods: grouped.restModeByDay.get(day) ?? [],
      },
      synced_at: new Date().toISOString(),
      spo2_average: spo2Average,
      stress_high_seconds: asNumber(stress?.stress_high),
      recovery_high_seconds: asNumber(stress?.recovery_high),
      avg_heart_rate: heartRate?.avg_bpm ?? null,
      resting_heart_rate: heartRate?.resting_bpm ?? null,
    };
  });

  if (rows.length > 0) {
    const { error } = await getServiceClient()
      .from('oura_daily_metrics')
      .upsert(rows, { onConflict: 'user_id,day' });
    if (error) throw error;

    const healthRows = rows.flatMap((row) => {
      const metrics: Array<{
        user_id: string;
        day: string;
        metric_type: string;
        value: number | null;
        unit: string;
        source: string;
        payload: Record<string, unknown>;
        recorded_at: string;
      }> = [];
      const base = {
        user_id: userId,
        day: row.day,
        source: 'oura',
        payload: {},
        recorded_at: row.synced_at,
      };
      if (row.sleep_score != null) {
        metrics.push({ ...base, metric_type: 'sleep', value: row.sleep_score, unit: 'score' });
      }
      if (row.readiness_score != null) {
        metrics.push({ ...base, metric_type: 'readiness', value: row.readiness_score, unit: 'score' });
      }
      if (row.activity_score != null) {
        metrics.push({ ...base, metric_type: 'activity', value: row.activity_score, unit: 'score' });
      }
      if (row.active_calories != null) {
        metrics.push({ ...base, metric_type: 'active_calories', value: row.active_calories, unit: 'kcal' });
      }
      if (row.total_calories != null) {
        metrics.push({ ...base, metric_type: 'total_calories', value: row.total_calories, unit: 'kcal' });
      }
      if (row.steps != null) {
        metrics.push({ ...base, metric_type: 'steps', value: row.steps, unit: 'count' });
      }
      return metrics;
    });

    if (healthRows.length > 0) {
      const { error: healthError } = await getServiceClient().rpc(
        'upsert_health_metrics_if_changed',
        { rows: healthRows },
      );
      if (healthError) console.error('health_metrics upsert failed:', healthError);
    }
  }

  const admin = getServiceClient();
  await admin
    .from('oura_connections')
    .update({
      profile_payload: personalInfo ?? {},
      device_payload: { ring_configuration: ringConfiguration },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return rows.length;
}

export async function syncOuraForUser(userId: string) {
  const admin = getServiceClient();
  const { data: connection, error } = await admin
    .from('oura_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!connection) {
    throw new Error('Oura not connected');
  }

  let accessToken = connection.access_token;
  let refreshToken = connection.refresh_token;
  let expiresAt = connection.expires_at;

  if (new Date(expiresAt).getTime() <= Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token ?? refreshToken;
    expiresAt = tokenExpiresAt(refreshed.expires_in);

    const { error: updateError } = await admin
      .from('oura_connections')
      .update({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (updateError) throw updateError;
  }

  const syncedDays = await upsertSyncedMetrics(userId, accessToken);

  const { error: syncMetaError } = await admin
    .from('oura_connections')
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (syncMetaError) throw syncMetaError;

  return { syncedDays };
}

export async function syncOuraForAllUsers() {
  const admin = getServiceClient();
  const { data: connections, error } = await admin
    .from('oura_connections')
    .select('user_id');
  if (error) throw error;

  const results: Array<{
    userId: string;
    ok: boolean;
    syncedDays?: number;
    error?: string;
  }> = [];

  for (const connection of connections ?? []) {
    try {
      const result = await syncOuraForUser(connection.user_id);
      results.push({
        userId: connection.user_id,
        ok: true,
        syncedDays: result.syncedDays,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      console.error(`Oura sync failed for ${connection.user_id}:`, message);
      results.push({ userId: connection.user_id, ok: false, error: message });
    }
  }

  return {
    users: connections?.length ?? 0,
    succeeded: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}
