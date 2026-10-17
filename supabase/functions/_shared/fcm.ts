/**
 * Firebase Cloud Messaging (HTTP v1) for the Android app.
 * Needs the Firebase service-account JSON in the FCM_SERVICE_ACCOUNT secret.
 */
import { bytesToBase64Url } from './webpush.ts';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  tag?: string;
};

export type FcmResult = {
  ok: boolean;
  status: number;
  /** Token is no longer registered — delete it. */
  expired: boolean;
  error?: string;
};

const encoder = new TextEncoder();
const ANDROID_CHANNEL_ID = 'lifev1_reminders';

let cachedAccount: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;

export function getFcmServiceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')?.trim();
  if (!raw) {
    cachedAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedAccount =
      parsed?.project_id && parsed?.client_email && parsed?.private_key
        ? { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key }
        : null;
  } catch {
    cachedAccount = null;
  }
  return cachedAccount;
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned)));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${bytesToBase64Url(signature)}`,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new Error(`FCM auth failed (${res.status})`);
  }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

export async function sendFcm(token: string, message: FcmMessage, account: ServiceAccount): Promise<FcmResult> {
  try {
    const accessToken = await getAccessToken(account);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          data: message.data ?? {},
          android: {
            priority: 'high',
            notification: {
              channel_id: ANDROID_CHANNEL_ID,
              ...(message.tag ? { tag: message.tag } : {}),
            },
          },
        },
      }),
    });
    if (res.ok) return { ok: true, status: res.status, expired: false };
    const text = await res.text().catch(() => '');
    const expired = res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text);
    return { ok: false, status: res.status, expired, error: text.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, expired: false, error: err instanceof Error ? err.message : String(err) };
  }
}
