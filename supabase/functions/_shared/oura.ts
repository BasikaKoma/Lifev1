const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2';

/** Match scopes enabled on the Oura developer app. Users must reconnect after scope changes. */
export const OURA_SCOPES =
  'email personal daily heartrate workout tag session spo2Daily';

export const OURA_SYNC_DAYS = 30;

export type OuraTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export function getOuraConfig() {
  const clientId = Deno.env.get('OURA_CLIENT_ID');
  const clientSecret = Deno.env.get('OURA_CLIENT_SECRET');
  const redirectUri = Deno.env.get('OURA_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Oura OAuth configuration');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getOuraConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: OURA_SCOPES,
  });
  return `${OURA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<OuraTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getOuraConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura token exchange failed: ${text}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<OuraTokenResponse> {
  const { clientId, clientSecret } = getOuraConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura token refresh failed: ${text}`);
  }

  return res.json();
}

type OuraCollectionResponse<T> = {
  data: T[];
  next_token?: string | null;
};

type DateRangeParams = Record<string, string>;

async function fetchOuraPaged<T>(
  accessToken: string,
  path: string,
  params: DateRangeParams,
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | null = null;

  do {
    const query = new URLSearchParams(params);
    if (nextToken) query.set('next_token', nextToken);

    const url = `${OURA_API_BASE}${path}?${query.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Oura API ${path} failed: ${text}`);
    }

    const json = (await res.json()) as OuraCollectionResponse<T>;
    items.push(...(json.data ?? []));
    nextToken = json.next_token ?? null;
  } while (nextToken);

  return items;
}

async function fetchOuraCollectionSafe<T>(
  accessToken: string,
  path: string,
  startDate: string,
  endDate: string,
): Promise<T[]> {
  try {
    return await fetchOuraPaged<T>(accessToken, path, {
      start_date: startDate,
      end_date: endDate,
    });
  } catch (error) {
    console.error(`Oura fetch failed for ${path}:`, error);
    return [];
  }
}

async function fetchHeartRateSafe(accessToken: string, startDate: string, _endDate: string) {
  try {
    return await fetchOuraPaged<{ timestamp: string; bpm: number; source?: string }>(
      accessToken,
      '/usercollection/heartrate',
      {
        start_datetime: `${startDate}T00:00:00.000Z`,
        end_datetime: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Oura fetch failed for heartrate:', error);
    return [];
  }
}

type HeartRateSample = { timestamp: string; bpm: number; source?: string };

function itemsToHeartRateSamples({
  items,
  timestamp,
  interval = 300,
  source = 'sleep',
}: {
  items: unknown;
  timestamp?: string;
  interval?: number;
  source?: string;
}): HeartRateSample[] {
  if (!Array.isArray(items) || !timestamp) return [];

  const startMs = new Date(timestamp).getTime();
  if (Number.isNaN(startMs)) return [];

  const stepMs = interval * 1000;
  const samples: HeartRateSample[] = [];

  items.forEach((bpm, index) => {
    if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return;
    samples.push({
      timestamp: new Date(startMs + index * stepMs).toISOString(),
      bpm,
      source,
    });
  });

  return samples;
}

export function extractSleepSessionHeartRateSamples(
  sleepSessions: Record<string, unknown>[],
): HeartRateSample[] {
  if (!Array.isArray(sleepSessions)) return [];

  return sleepSessions.flatMap((session) =>
    itemsToHeartRateSamples({
      items: (session?.heart_rate as Record<string, unknown> | undefined)?.items,
      timestamp:
        ((session?.heart_rate as Record<string, unknown> | undefined)?.timestamp as string | undefined)
        ?? (session?.bedtime_start as string | undefined),
      interval: ((session?.heart_rate as Record<string, unknown> | undefined)?.interval as number | undefined)
        ?? 300,
      source: 'sleep',
    }),
  );
}

export function mergeHeartRateSamples(...sampleGroups: HeartRateSample[][]): HeartRateSample[] {
  const byTimestamp = new Map<string, HeartRateSample>();
  for (const group of sampleGroups) {
    for (const sample of group) {
      if (!sample?.timestamp || !Number.isFinite(sample.bpm)) continue;
      byTimestamp.set(sample.timestamp, sample);
    }
  }
  return [...byTimestamp.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

async function fetchPersonalInfoSafe(accessToken: string) {
  try {
    const res = await fetch(`${OURA_API_BASE}/usercollection/personal_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Oura fetch failed for personal_info:', error);
    return null;
  }
}

async function fetchRingConfigurationSafe(accessToken: string) {
  try {
    return await fetchOuraCollectionSafe<Record<string, unknown>>(
      accessToken,
      '/usercollection/ring_configuration',
      isoDateDaysAgo(OURA_SYNC_DAYS),
      todayIsoDate(),
    );
  } catch (error) {
    console.error('Oura fetch failed for ring_configuration:', error);
    return [];
  }
}

type DayKeyed = { day?: string };

function groupByDay<T extends DayKeyed>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.day) continue;
    const list = map.get(row.day) ?? [];
    list.push(row);
    map.set(row.day, list);
  }
  return map;
}

function summarizeHeartRate(samples: { timestamp: string; bpm: number; source?: string }[]) {
  if (samples.length === 0) return null;
  const bpms = samples.map((sample) => sample.bpm).filter((bpm) => Number.isFinite(bpm));
  if (bpms.length === 0) return null;

  const sleepSamples = samples.filter((sample) => sample.source === 'sleep');
  const sleepBpms = sleepSamples.map((sample) => sample.bpm).filter((bpm) => Number.isFinite(bpm));
  const restingPool = sleepBpms.length > 0 ? sleepBpms : bpms;

  return {
    avg_bpm: Math.round(bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length),
    min_bpm: Math.min(...bpms),
    max_bpm: Math.max(...bpms),
    resting_bpm: Math.round(restingPool.reduce((sum, bpm) => sum + bpm, 0) / restingPool.length),
    sample_count: bpms.length,
  };
}

function groupHeartRateByDay(
  samples: { timestamp: string; bpm: number; source?: string }[],
): Map<string, typeof samples> {
  const map = new Map<string, typeof samples>();
  for (const sample of samples) {
    const day = sample.timestamp?.slice(0, 10);
    if (!day) continue;
    const list = map.get(day) ?? [];
    list.push(sample);
    map.set(day, list);
  }
  return map;
}

export async function fetchOuraAllData(accessToken: string, startDate: string, endDate: string) {
  const [
    dailySleep,
    dailyReadiness,
    dailyActivity,
    dailyStress,
    dailySpo2,
    sleepSessions,
    sleepTime,
    workouts,
    sessions,
    tags,
    restModePeriods,
    heartRateSamples,
    personalInfo,
    ringConfiguration,
  ] = await Promise.all([
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/daily_sleep', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/daily_readiness', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/daily_activity', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/daily_stress', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/daily_spo2', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/sleep', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/sleep_time', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/workout', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/session', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/tag', startDate, endDate),
    fetchOuraCollectionSafe<Record<string, unknown>>(accessToken, '/usercollection/rest_mode_period', startDate, endDate),
    fetchHeartRateSafe(accessToken, startDate, endDate),
    fetchPersonalInfoSafe(accessToken),
    fetchRingConfigurationSafe(accessToken),
  ]);

  return {
    dailySleep,
    dailyReadiness,
    dailyActivity,
    dailyStress,
    dailySpo2,
    sleepSessions,
    sleepTime,
    workouts,
    sessions,
    tags,
    restModePeriods,
    heartRateSamples,
    personalInfo,
    ringConfiguration,
    grouped: {
      sleepByDay: groupByDay(dailySleep),
      readinessByDay: groupByDay(dailyReadiness),
      activityByDay: groupByDay(dailyActivity),
      stressByDay: groupByDay(dailyStress),
      spo2ByDay: groupByDay(dailySpo2),
      sleepSessionsByDay: groupByDay(sleepSessions),
      sleepTimeByDay: groupByDay(sleepTime),
      workoutsByDay: groupByDay(workouts),
      sessionsByDay: groupByDay(sessions),
      tagsByDay: groupByDay(tags),
      restModeByDay: groupByDay(restModePeriods),
      heartRateByDay: groupHeartRateByDay(heartRateSamples),
    },
    summarizeHeartRate,
  };
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function syncEndIsoDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function tokenExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** @deprecated use fetchOuraAllData */
export async function fetchOuraDailyData(accessToken: string, startDate: string, endDate: string) {
  const data = await fetchOuraAllData(accessToken, startDate, endDate);
  return {
    dailySleep: data.dailySleep,
    dailyReadiness: data.dailyReadiness,
    dailyActivity: data.dailyActivity,
    sleepSessions: data.sleepSessions,
  };
}
