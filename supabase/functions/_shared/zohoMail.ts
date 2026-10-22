const URGENT_RE = /επείγ|urgent|asap|deadline|σήμερα|ληγ/i;

export const ZOHO_SCOPES = [
  'ZohoMail.accounts.READ',
  'ZohoMail.folders.READ',
  'ZohoMail.messages.READ',
  'ZohoMail.messages.CREATE',
].join(',');

const REGIONS = {
  eu: { id: 'eu', accountsHost: 'https://accounts.zoho.eu', apiBase: 'https://mail.zoho.eu/api' },
  us: { id: 'us', accountsHost: 'https://accounts.zoho.com', apiBase: 'https://mail.zoho.com/api' },
  in: { id: 'in', accountsHost: 'https://accounts.zoho.in', apiBase: 'https://mail.zoho.in/api' },
  au: { id: 'au', accountsHost: 'https://accounts.zoho.com.au', apiBase: 'https://mail.zoho.com.au/api' },
} as const;

type ZohoRegion = (typeof REGIONS)[keyof typeof REGIONS];

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export type ZohoAccount = {
  accountId: string;
  email: string | null;
};

export type ZohoSession = {
  token: string;
  accountId: string | null;
  apiBase: string | null;
  email: string | null;
  projectId?: string | null;
  connectionKey?: string;
  connectionId?: string | null;
};

export function zohoRegion(value: unknown): ZohoRegion {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (id === 'eu' || id === 'us' || id === 'in' || id === 'au') return REGIONS[id];
  return REGIONS.eu;
}

export function assertZohoAccountsHost(value: string | null | undefined): string {
  const host = String(value || '');
  const found = Object.values(REGIONS).find((region) => region.accountsHost === host);
  if (!found) throw new Error('Zoho data center is not supported');
  return found.accountsHost;
}

function assertZohoApiBase(value: string | null | undefined): string {
  const base = String(value || '').replace(/\/$/, '');
  const found = Object.values(REGIONS).find((region) => region.apiBase === base);
  if (!found) throw new Error('Zoho mail host is not supported');
  return found.apiBase;
}

export function getZohoConfig() {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
  const redirectUri = Deno.env.get('MAIL_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Zoho OAuth configuration');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildZohoAuthorizeUrl(state: string, regionId: string): string {
  const { clientId, redirectUri } = getZohoConfig();
  const region = zohoRegion(regionId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ZOHO_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${region.accountsHost}/oauth/v2/auth?${params.toString()}`;
}

function safeError(text: string): string {
  return text
    .replace(/ya29\.[A-Za-z0-9_\-]+/g, '[redacted]')
    .replace(/Zoho-oauthtoken\s+\S+/gi, 'Zoho-oauthtoken [redacted]')
    .replace(/(access_token|refresh_token|client_secret)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 280);
}

async function postZohoToken(accountsHost: string, body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${accountsHost}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let payload: (TokenResponse & { error?: string }) | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok || payload?.error || !payload?.access_token) {
    throw new Error(`Zoho token exchange failed: ${safeError(String(payload?.error || text || res.status))}`);
  }
  return payload;
}

export async function exchangeZohoCode(code: string, regionId: string): Promise<{ region: ZohoRegion; tokens: TokenResponse }> {
  const region = zohoRegion(regionId);
  const { clientId, clientSecret, redirectUri } = getZohoConfig();
  const tokens = await postZohoToken(region.accountsHost, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }));
  return { region, tokens };
}

export async function refreshZohoToken(accountsHost: string, refreshToken: string): Promise<TokenResponse> {
  const host = assertZohoAccountsHost(accountsHost);
  const { clientId, clientSecret } = getZohoConfig();
  return postZohoToken(host, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }));
}

/** Zoho ids pass 2^53, so a bare integer of 16+ digits is read as text before JSON.parse. */
export function parseZohoJson(text: string) {
  return JSON.parse(text.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
}

async function zohoFetch(apiBase: string, token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Zoho-oauthtoken ${token}`);
  headers.set('Accept', 'application/json');
  const res = await fetch(`${assertZohoApiBase(apiBase)}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let body: { status?: { code?: number; description?: string }; error?: string; data?: unknown } | null = null;
  try {
    body = text ? parseZohoJson(text) : null;
  } catch {
    body = null;
  }
  const code = Number(body?.status?.code);
  if (!res.ok || (Number.isFinite(code) && code >= 400)) {
    throw new Error(`Zoho Mail request failed: ${safeError(String(body?.status?.description || body?.error || text || res.status))}`);
  }
  return body;
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  return [];
}

export async function fetchZohoAccount(apiBase: string, token: string): Promise<ZohoAccount> {
  const payload = await zohoFetch(apiBase, token, 'accounts');
  const data = payload?.data;
  const list = asList(data).length
    ? asList(data)
    : asList(data && typeof data === 'object' ? (data as { accounts?: unknown }).accounts : null);
  const account = list.find((item) => item.accountId != null);
  if (!account) throw new Error('Zoho Mail account was not found');
  const sendDetails = asList(account.sendMailDetails);
  const fromAddress = sendDetails.find((item) => typeof item.fromAddress === 'string')?.fromAddress;
  const email = [fromAddress, account.primaryEmailAddress, account.mailboxAddress, account.incomingUserName]
    .find((item) => typeof item === 'string' && item.includes('@'));
  return {
    accountId: String(account.accountId),
    email: typeof email === 'string' ? email : null,
  };
}

function decodeBasic(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanSnippet(value: unknown): string {
  return decodeBasic(String(value || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function isUnread(status: unknown): boolean {
  const value = String(status ?? '').toLowerCase();
  return value === '0' || value === 'unread';
}

function isImportant(message: Record<string, unknown>): boolean {
  const flag = String(message.flagid ?? '').toLowerCase();
  const priority = String(message.priority ?? '');
  return flag === 'important' || flag === '2' || priority === '1';
}

function receivedAt(value: unknown): string | null {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const ms = raw < 1e12 ? raw * 1000 : raw;
  return new Date(ms).toISOString();
}

function formatFrom(message: Record<string, unknown>): string {
  const email = String(message.fromAddress || '').trim();
  const name = String(message.sender || '').trim();
  if (name && email && name.toLowerCase() !== email.toLowerCase()) return `${name} <${email}>`.slice(0, 300);
  return (email || name).slice(0, 300);
}

type ZohoFolder = { id: string; kind: 'inbox' | 'archive' };
type FolderCursor = { receivedTime?: string };

const PAGE_SIZE = 50;
const MAX_PAGES = 4;
// With no cursor yet, a folder is read back this far.
export const FIRST_SYNC_DAYS = 3;

async function syncFolders(apiBase: string, token: string, accountId: string): Promise<ZohoFolder[]> {
  const payload = await zohoFetch(apiBase, token, `accounts/${encodeURIComponent(accountId)}/folders`);
  const folders: ZohoFolder[] = [];
  for (const folder of asList(payload?.data)) {
    if (folder.folderId == null) continue;
    const type = String(folder.folderType || '').toLowerCase();
    const name = String(folder.folderName || '').toLowerCase();
    const kind = type === 'inbox' || name === 'inbox'
      ? 'inbox'
      : type === 'archive' || name === 'archive'
        ? 'archive'
        : null;
    if (kind) folders.push({ id: String(folder.folderId), kind });
  }
  return folders;
}

function addressList(value: unknown): string {
  return decodeBasic(String(value || '')).replace(/\s+/g, ' ').trim().slice(0, 1000);
}

/**
 * Inbox + Archive from each folder's cursor (newest receivedTime already seen), paging back
 * until it reaches that point. The first page is always written so read/unread stays current.
 */
export async function syncZohoMailbox(
  admin: { from: (table: string) => any },
  userId: string,
  session: ZohoSession,
) {
  if (!session.apiBase || !session.accountId) throw new Error('Zoho Mail account is incomplete');
  const apiBase = session.apiBase;
  const accountId = session.accountId;
  const connectionKey = session.connectionKey || (session.projectId ? session.projectId : 'account');

  let connectionQuery = admin.from('mail_connections').select('sync_cursor').eq('user_id', userId);
  connectionQuery = session.connectionId
    ? connectionQuery.eq('id', session.connectionId)
    : connectionQuery.eq('connection_key', connectionKey);
  const { data: connection, error: cursorError } = await connectionQuery.maybeSingle();
  if (cursorError) throw cursorError;
  const cursor: Record<string, FolderCursor> = connection?.sync_cursor && typeof connection.sync_cursor === 'object'
    ? { ...connection.sync_cursor }
    : {};

  const folders = await syncFolders(apiBase, session.token, accountId);
  if (!folders.some((folder) => folder.kind === 'inbox')) throw new Error('Zoho Inbox folder was not found');

  let count = 0;
  let newCount = 0;
  for (const folder of folders) {
    const since = Number(cursor[folder.id]?.receivedTime) || Date.now() - FIRST_SYNC_DAYS * 86400000;
    let newest = since;
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        folderId: folder.id,
        start: String(1 + page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
        status: 'all',
        includeto: 'true',
        sortBy: 'date',
        sortorder: 'false',
      });
      const payload = await zohoFetch(
        apiBase,
        session.token,
        `accounts/${encodeURIComponent(accountId)}/messages/view?${params.toString()}`,
      );
      const messages = asList(payload?.data).filter((message) => message.messageId != null);
      let reachedCursor = false;
      for (const message of messages) {
        const time = Number(message.receivedTime);
        const isNew = Number.isFinite(time) && time > since;
        if (!isNew) reachedCursor = true;
        if (!isNew && page > 0) break;
        if (isNew) {
          newCount += 1;
          newest = Math.max(newest, time);
        }
        const subject = String(message.subject || '').slice(0, 300);
        const snippet = cleanSnippet(message.summary);
        const unread = isUnread(message.status);
        rows.push({
          user_id: userId,
          project_id: session.projectId || null,
          connection_key: connectionKey,
          gmail_id: String(message.messageId),
          thread_id: message.threadId != null ? String(message.threadId) : null,
          message_id_header: null,
          from_addr: formatFrom(message),
          to_addr: addressList(message.toAddress),
          cc_addr: addressList(message.ccAddress),
          folder_id: folder.id,
          folder: folder.kind,
          has_attachment: String(message.hasAttachment ?? '') === '1' || message.hasAttachment === true,
          subject,
          snippet,
          received_at: receivedAt(message.receivedTime),
          unread,
          urgent: unread && (isImportant(message) || URGENT_RE.test(`${subject} ${snippet}`)),
          synced_at: new Date().toISOString(),
        });
      }
      if (reachedCursor || messages.length < PAGE_SIZE) break;
    }
    if (rows.length) {
      const { error } = await admin.from('mail_messages').upsert(rows, { onConflict: 'user_id,connection_key,gmail_id' });
      if (error) throw error;
      count += rows.length;
    }
    cursor[folder.id] = { receivedTime: String(newest) };
  }

  let touch = admin.from('mail_connections').update({
    sync_cursor: cursor,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  touch = session.connectionId ? touch.eq('id', session.connectionId) : touch.eq('connection_key', connectionKey);
  const { error: touchError } = await touch;
  if (touchError) throw touchError;
  return { count, newCount };
}

function fromCodePoint(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
}

function htmlToText(html: string): string {
  return decodeBasic(
    html
      .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => fromCodePoint(parseInt(code, 16))),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text of one message (its own content, without quoted earlier mail). */
export async function fetchZohoMessageText(session: ZohoSession, folderId: string, messageId: string, maxChars = 8000) {
  if (!session.apiBase || !session.accountId) throw new Error('Zoho Mail account is incomplete');
  const payload = await zohoFetch(
    session.apiBase,
    session.token,
    `accounts/${encodeURIComponent(session.accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content`,
  );
  const data = payload?.data as { content?: unknown } | undefined;
  return htmlToText(typeof data?.content === 'string' ? data.content : '').slice(0, maxChars);
}

/** Reads one header from a raw MIME message, joining folded lines. */
function mimeHeader(raw: string, name: string): string {
  const head = raw.split(/\r?\n\r?\n/, 1)[0] || '';
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ');
  const prefix = `${name.toLowerCase()}:`;
  const line = unfolded.split(/\r?\n/).find((item) => item.toLowerCase().startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

/** Message-ID and References of a received mail, so a draft lands in the same thread. */
async function zohoThreadHeaders(session: ZohoSession, messageId: string) {
  const payload = await zohoFetch(
    session.apiBase!,
    session.token,
    `accounts/${encodeURIComponent(session.accountId!)}/messages/${encodeURIComponent(messageId)}/originalmessage`,
  );
  const data = payload?.data as { content?: unknown } | undefined;
  const raw = typeof data?.content === 'string' ? data.content : '';
  const inReplyTo = mimeHeader(raw, 'Message-ID');
  if (!inReplyTo) throw new Error('Zoho message has no Message-ID');
  const refHeader = [mimeHeader(raw, 'References'), inReplyTo].filter(Boolean).join(' ').slice(0, 4000);
  return { inReplyTo, refHeader };
}

/**
 * Saves a draft in the Zoho mailbox. Nothing is sent: mode "draft" is required by the API,
 * and the user sends it from Zoho. A reply draft carries the thread headers of the original.
 */
export async function createZohoDraft(
  session: ZohoSession,
  { to, subject, body, replyToMessageId }: { to: string; subject: string; body: string; replyToMessageId?: string | null },
) {
  if (!session.apiBase || !session.accountId) throw new Error('Zoho Mail account is incomplete');
  if (!session.email) throw new Error('Zoho sender address is missing');
  const payload: Record<string, string> = {
    mode: 'draft',
    fromAddress: session.email,
    toAddress: to,
    subject,
    content: body,
    mailFormat: 'plaintext',
    encoding: 'UTF-8',
    askReceipt: 'no',
  };
  if (replyToMessageId) {
    Object.assign(payload, await zohoThreadHeaders(session, replyToMessageId));
  }
  return zohoFetch(
    session.apiBase,
    session.token,
    `accounts/${encodeURIComponent(session.accountId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}
