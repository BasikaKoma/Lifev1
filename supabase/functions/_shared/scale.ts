import { getServiceClient } from './supabase.ts';

const MIN_GAP_MS = 30_000;

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function shouldAppend(
  readings: Array<{ value?: number; recordedAt?: string }>,
  weightKg: number,
  recordedAt: string,
) {
  const last = readings[readings.length - 1];
  if (!last) return true;
  if (asNumber(last.value) !== weightKg) return true;
  const gap = new Date(recordedAt).getTime() - new Date(last.recordedAt ?? 0).getTime();
  return gap >= MIN_GAP_MS;
}

export async function ingestScaleWeight(params: {
  token: string;
  weightKg: number;
  impedance?: number | null;
  deviceId?: string | null;
  deviceName?: string | null;
  day: string;
  recordedAt: string;
  stable?: boolean;
}) {
  const hash = await sha256Hex(params.token);
  const admin = getServiceClient();

  const { data: profiles, error: lookupError } = await admin
    .from('profiles')
    .select('id, scale_device')
    .eq('scale_device->>ingest_token_hash', hash)
    .limit(1);

  if (lookupError) throw lookupError;
  const profile = profiles?.[0];
  if (!profile?.id) {
    throw new Error('Invalid ingest token');
  }

  const { data: existing, error: existingError } = await admin
    .from('health_metrics')
    .select('*')
    .eq('user_id', profile.id)
    .eq('day', params.day)
    .eq('metric_type', 'weight')
    .eq('source', 'qn_scale')
    .maybeSingle();
  if (existingError) throw existingError;

  const readings = Array.isArray(existing?.payload?.readings) ? [...existing.payload.readings] : [];
  if (existing && readings.length === 0 && existing.value != null) {
    readings.push({
      value: Number(existing.value),
      recordedAt: existing.recorded_at,
      impedance: existing.payload?.impedance ?? null,
    });
  }

  if (!shouldAppend(readings, params.weightKg, params.recordedAt)) {
    return { ok: true, appended: false, userId: profile.id };
  }

  readings.push({
    value: params.weightKg,
    recordedAt: params.recordedAt,
    impedance: params.impedance ?? null,
    deviceId: params.deviceId ?? null,
    deviceName: params.deviceName ?? null,
  });

  const payload = {
    readings,
    latestRecordedAt: params.recordedAt,
    deviceId: params.deviceId ?? null,
    deviceName: params.deviceName ?? null,
    stable: params.stable ?? true,
    impedance: params.impedance ?? null,
  };

  const { error: upsertError } = await admin.rpc('upsert_health_metrics_if_changed', {
    rows: [{
      user_id: profile.id,
      day: params.day,
      metric_type: 'weight',
      value: params.weightKg,
      unit: 'kg',
      source: 'qn_scale',
      payload,
      recorded_at: params.recordedAt,
    }],
  });
  if (upsertError) throw upsertError;

  return { ok: true, appended: true, userId: profile.id };
}
