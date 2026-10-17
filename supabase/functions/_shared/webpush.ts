/**
 * Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291),
 * implemented on WebCrypto so it runs in the Supabase Edge runtime without Node shims.
 * Used for the iPhone home-screen app (Safari) and any desktop/Android browser.
 */

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type WebPushResult = {
  ok: boolean;
  status: number;
  /** Subscription is gone (404/410) — delete it. */
  expired: boolean;
  error?: string;
};

const encoder = new TextEncoder();

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

type VapidKeys = { publicKey: string; privateKey: string; subject: string };

let cachedSigningKey: { raw: string; key: CryptoKey } | null = null;

async function getVapidSigningKey(vapid: VapidKeys): Promise<CryptoKey> {
  if (cachedSigningKey?.raw === vapid.privateKey) return cachedSigningKey.key;
  const pub = base64UrlToBytes(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 point');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(pub.slice(1, 33)),
    y: bytesToBase64Url(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: false,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cachedSigningKey = { raw: vapid.privateKey, key };
  return key;
}

async function vapidAuthorization(endpoint: string, vapid: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const key = await getVapidSigningKey(vapid);
  // WebCrypto ECDSA returns the raw r||s form JWS expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned))
  );
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`;
}

async function encryptPayload(subscription: WebPushSubscription, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = base64UrlToBytes(subscription.keys.p256dh);
  const authSecret = base64UrlToBytes(subscription.keys.auth);

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256)
  );

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // Single record: payload followed by the 0x02 "last record" delimiter.
  const plaintext = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export function getVapidKeys(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() || 'https://lifev1-app.pages.dev';
  return { publicKey, privateKey, subject };
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  message: unknown,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {}
): Promise<WebPushResult> {
  try {
    const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(message)));
    const headers: Record<string, string> = {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
      Urgency: options.urgency ?? 'high',
    };
    // Topic replaces an undelivered message with the same topic (max 32 url-safe chars).
    if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

    const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
    const expired = res.status === 404 || res.status === 410;
    if (res.ok) return { ok: true, status: res.status, expired: false };
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, expired, error: text.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, expired: false, error: err instanceof Error ? err.message : String(err) };
  }
}
