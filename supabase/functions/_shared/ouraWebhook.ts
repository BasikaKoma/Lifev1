/**
 * Oura webhooks: Oura calls us ~30 s after the ring syncs through the phone app.
 * Heart rate is not a webhook data type, so activity/workout/session/sleep events are the
 * signal to re-read the last two days; the trigger on oura_daily_metrics then sends any alert.
 */
import { getServiceClient } from './supabase.ts';
import { syncOuraForUser } from './sync.ts';
import { dispatchDuePushes } from './push.ts';

const OURA_WEBHOOK_API = 'https://api.ouraring.com/v2/webhook/subscription';

/** Data types whose updates arrive when the ring syncs (heart rate itself has no webhook). */
export const WEBHOOK_DATA_TYPES = ['daily_activity', 'workout', 'session', 'sleep'];
export const WEBHOOK_EVENT_TYPES = ['create', 'update'];

/** One ring sync fires several events; they share one re-read. */
const DEBOUNCE_SECONDS = 60;
/** Let Oura finish processing the upload before reading it back. */
const SETTLE_MS = 15_000;
/** Renew subscriptions this long before they expire. */
const RENEW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;

type WebhookEvent = {
  event_type?: string;
  data_type?: string;
  object_id?: string;
  event_time?: string;
  user_id?: string;
};

function clientCredentials() {
  const clientId = Deno.env.get('OURA_CLIENT_ID');
  const clientSecret = Deno.env.get('OURA_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Missing Oura OAuth configuration');
  return { clientId, clientSecret };
}

export function getVerificationToken(): string {
  const token = Deno.env.get('OURA_WEBHOOK_VERIFICATION_TOKEN')?.trim();
  if (!token) throw new Error('Missing OURA_WEBHOOK_VERIFICATION_TOKEN');
  return token;
}

export function webhookCallbackUrl(): string {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('Missing SUPABASE_URL');
  return `${base.replace(/\/+$/, '')}/functions/v1/oura-webhook`;
}

async function hmacHexUpper(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Oura signs HMAC-SHA256(client secret, timestamp + JSON body), hex upper-case.
 * Their example re-serializes the parsed body, so both the raw and the compact form are accepted.
 */
export async function verifyOuraSignature(headers: Headers, rawBody: string): Promise<boolean> {
  const signature = headers.get('x-oura-signature')?.trim().toUpperCase();
  const timestamp = headers.get('x-oura-timestamp')?.trim();
  if (!signature || !timestamp) return false;
  const { clientSecret } = clientCredentials();
  const bodies = [rawBody];
  try {
    bodies.push(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    /* raw only */
  }
  for (const body of bodies) {
    if ((await hmacHexUpper(clientSecret, timestamp + body)) === signature) return true;
  }
  return false;
}

async function logEvent(event: WebhookEvent, signatureOk: boolean, outcome: string) {
  const admin = getServiceClient();
  await admin.from('oura_webhook_events').insert({
    event_type: event.event_type ?? null,
    data_type: event.data_type ?? null,
    oura_user_id: event.user_id ?? null,
    signature_ok: signatureOk,
    outcome: outcome.slice(0, 300),
  });
  await admin
    .from('oura_webhook_events')
    .delete()
    .lt('received_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
}

/** Re-read the user's last two days once per burst of events. */
async function syncFromEvent(event: WebhookEvent): Promise<string> {
  if (!event.data_type || !WEBHOOK_DATA_TYPES.includes(event.data_type)) return 'ignored data type';
  if (!event.user_id) return 'no user id';

  const admin = getServiceClient();
  const { data: connection, error } = await admin
    .from('oura_connections')
    .select('user_id')
    .eq('profile_payload->>id', event.user_id)
    .maybeSingle();
  if (error) return `lookup failed: ${error.message}`;
  if (!connection) return 'unknown Oura user';

  // First sleep sync after waking brings the morning mood prompt forward (07:00 is the fallback).
  let mood = '';
  if (event.data_type === 'sleep') {
    const { data: moodResult, error: moodError } = await admin.rpc('prompt_morning_mood', {
      p_user: connection.user_id,
    });
    mood = moodError ? `mood failed: ${moodError.message}` : `mood ${moodResult}`;
    if (moodResult === 'queued') await dispatchDuePushes(connection.user_id);
  }
  const withMood = (outcome: string) => (mood ? `${outcome}; ${mood}` : outcome);

  // Row lock + re-checked WHERE: only one event in a burst wins the claim.
  const cutoff = new Date(Date.now() - DEBOUNCE_SECONDS * 1000).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from('oura_connections')
    .update({ webhook_sync_at: new Date().toISOString() })
    .eq('user_id', connection.user_id)
    .or(`webhook_sync_at.is.null,webhook_sync_at.lt.${cutoff}`)
    .select('user_id');
  if (claimError) return withMood(`claim failed: ${claimError.message}`);
  if (!claimed?.length) return withMood('debounced');

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const result = await syncOuraForUser(connection.user_id, { days: 1 });
  return withMood(`synced ${result.syncedDays} days`);
}

/** Handles a POST from Oura; the work continues after the quick 200 (Oura wants < 10 s). */
export async function handleWebhookPost(req: Request, waitUntil: (task: Promise<unknown>) => void) {
  const rawBody = await req.text();
  let event: WebhookEvent = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    /* logged with whatever fields there are */
  }
  let signatureOk = false;
  try {
    signatureOk = await verifyOuraSignature(req.headers, rawBody);
  } catch (err) {
    // Log every call from Oura, even when our own setup is broken.
    waitUntil(logEvent(event, false, `error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {}));
    return new Response('Error', { status: 500 });
  }

  if (!signatureOk) {
    waitUntil(logEvent(event, false, 'rejected: bad signature').catch(() => {}));
    return new Response('Invalid signature', { status: 401 });
  }

  waitUntil(
    syncFromEvent(event)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`)
      .then((outcome) => logEvent(event, true, outcome))
      .catch(() => {})
  );
  return new Response('OK', { status: 200 });
}

type Subscription = {
  id: string;
  callback_url: string;
  event_type: string;
  data_type: string;
  expiration_time: string;
};

async function ouraWebhookApi(path: string, init: RequestInit = {}) {
  const { clientId, clientSecret } = clientCredentials();
  const res = await fetch(`${OURA_WEBHOOK_API}${path}`, {
    ...init,
    headers: {
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Oura webhook API ${init.method || 'GET'} ${path || '/'} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Creates missing subscriptions for our callback and renews ones close to expiring. */
export async function ensureWebhookSubscriptions() {
  const callbackUrl = webhookCallbackUrl();
  const verificationToken = getVerificationToken();
  const existing = ((await ouraWebhookApi('')) || []) as Subscription[];
  const ours = existing.filter((sub) => sub.callback_url === callbackUrl);

  const created: string[] = [];
  const renewed: string[] = [];
  const errors: string[] = [];
  for (const dataType of WEBHOOK_DATA_TYPES) {
    for (const eventType of WEBHOOK_EVENT_TYPES) {
      const label = `${dataType}:${eventType}`;
      const sub = ours.find((item) => item.data_type === dataType && item.event_type === eventType);
      try {
        if (!sub) {
          await ouraWebhookApi('', {
            method: 'POST',
            body: JSON.stringify({
              callback_url: callbackUrl,
              verification_token: verificationToken,
              event_type: eventType,
              data_type: dataType,
            }),
          });
          created.push(label);
        } else if (new Date(sub.expiration_time).getTime() - Date.now() < RENEW_BEFORE_MS) {
          await ouraWebhookApi(`/renew/${sub.id}`, { method: 'PUT' });
          renewed.push(label);
        }
      } catch (err) {
        errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const after = (((await ouraWebhookApi('')) || []) as Subscription[]).filter((sub) => sub.callback_url === callbackUrl);
  return {
    callbackUrl,
    created,
    renewed,
    errors,
    active: after.map((sub) => `${sub.data_type}:${sub.event_type} until ${sub.expiration_time}`),
  };
}
