const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const MAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

const URGENT_RE = /επείγ|urgent|asap|deadline|σήμερα|ληγ/i;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export type MailConnection = {
  user_id: string;
  email: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export function getMailConfig() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = Deno.env.get('MAIL_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Gmail OAuth configuration');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildMailAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getMailConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MAIL_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function tokenExpiresAt(expiresIn: number): string {
  const seconds = Number.isFinite(expiresIn) ? expiresIn : 3600;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function safeError(text: string): string {
  return text.replace(/ya29\.[A-Za-z0-9_\-]+/g, '[redacted]').slice(0, 280);
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Gmail token exchange failed: ${safeError(await res.text())}`);
  }
  return res.json();
}

export async function exchangeMailCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getMailConfig();
  return postToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }));
}

export async function refreshMailToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getMailConfig();
  return postToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }));
}

async function gmailFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GMAIL_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail request failed: ${safeError(await res.text())}`);
  }
  return res.json();
}

export async function fetchMailboxEmail(token: string): Promise<string | null> {
  const profile = await gmailFetch(token, 'profile');
  return typeof profile?.emailAddress === 'string' ? profile.emailAddress : null;
}

function headerValue(headers: Array<{ name?: string; value?: string }>, name: string): string {
  const found = headers.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

export async function syncMailbox(admin: { from: (table: string) => any }, userId: string, token: string) {
  const list = await gmailFetch(token, `messages?maxResults=20&q=${encodeURIComponent('newer_than:21d')}`);
  const ids: string[] = (list.messages || []).map((item: { id?: string }) => item.id).filter(Boolean);
  const rows = [];
  for (const id of ids) {
    const message = await gmailFetch(
      token,
      `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
    );
    const headers = message.payload?.headers || [];
    const subject = headerValue(headers, 'Subject').slice(0, 300);
    const snippet = String(message.snippet || '').slice(0, 500);
    const labels: string[] = message.labelIds || [];
    const unread = labels.includes('UNREAD');
    const urgent = unread && (labels.includes('IMPORTANT') || URGENT_RE.test(`${subject} ${snippet}`));
    const internalMs = Number(message.internalDate);
    rows.push({
      user_id: userId,
      gmail_id: id,
      thread_id: message.threadId || null,
      message_id_header: headerValue(headers, 'Message-ID').slice(0, 300) || null,
      from_addr: headerValue(headers, 'From').slice(0, 300),
      subject,
      snippet,
      received_at: Number.isFinite(internalMs) ? new Date(internalMs).toISOString() : null,
      unread,
      urgent,
      synced_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await admin.from('mail_messages').upsert(rows, { onConflict: 'user_id,gmail_id' });
    if (error) throw error;
  }
  await admin.from('mail_connections').update({
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  return { count: rows.length };
}

export async function accessTokenForUser(admin: { from: (table: string) => any }, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('mail_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token || !data.refresh_token) throw new Error('Mail is not connected');
  const expires = new Date(data.expires_at).getTime();
  if (expires > Date.now() + 60_000) return data.access_token;
  const refreshed = await refreshMailToken(data.refresh_token);
  const nextToken = refreshed.access_token;
  await admin.from('mail_connections').update({
    access_token: nextToken,
    refresh_token: refreshed.refresh_token || data.refresh_token,
    expires_at: tokenExpiresAt(refreshed.expires_in),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  return nextToken;
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function encodeRaw(message: string): string {
  const bytes = new TextEncoder().encode(message);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseEmailAddress(value: string): string {
  const match = String(value || '').match(/<([^>]+)>/);
  const email = (match ? match[1] : value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

export async function sendMailMessage(
  token: string,
  { to, subject, body, threadId, inReplyTo }: {
    to: string;
    subject: string;
    body: string;
    threadId?: string | null;
    inReplyTo?: string | null;
  },
) {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  const raw = encodeRaw(`${headers.join('\r\n')}\r\n\r\n${body}`);
  const payload: { raw: string; threadId?: string } = { raw };
  if (threadId) payload.threadId = threadId;
  return gmailFetch(token, 'messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
