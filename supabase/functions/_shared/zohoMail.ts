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
    body = text ? JSON.parse(text) : null;
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

async function inboxFolderId(apiBase: string, token: string, accountId: string): Promise<string | null> {
  const payload = await zohoFetch(apiBase, token, `accounts/${encodeURIComponent(accountId)}/folders`);
  const folders = asList(payload?.data);
  const inbox = folders.find((folder) => {
    const type = String(folder.folderType || '').toLowerCase();
    const name = String(folder.folderName || '').toLowerCase();
    return type === 'inbox' || name === 'inbox';
  });
  return inbox?.folderId != null ? String(inbox.folderId) : null;
}

export async function syncZohoMailbox(
  admin: { from: (table: string) => any },
  userId: string,
  session: ZohoSession,
) {
  if (!session.apiBase || !session.accountId) throw new Error('Zoho Mail account is incomplete');
  let folderId: string | null = null;
  try {
    folderId = await inboxFolderId(session.apiBase, session.token, session.accountId);
  } catch {
    folderId = null;
  }
  const params = new URLSearchParams({
    limit: '20',
    start: '1',
    status: 'all',
    includeto: 'true',
    sortBy: 'date',
    sortorder: 'false',
  });
  if (folderId) params.set('folderId', folderId);
  const payload = await zohoFetch(
    session.apiBase,
    session.token,
    `accounts/${encodeURIComponent(session.accountId)}/messages/view?${params.toString()}`,
  );
  const messages = asList(payload?.data);
  const rows = messages
    .filter((message) => message.messageId != null)
    .map((message) => {
      const subject = String(message.subject || '').slice(0, 300);
      const snippet = cleanSnippet(message.summary);
      const unread = isUnread(message.status);
      const urgent = unread && (isImportant(message) || URGENT_RE.test(`${subject} ${snippet}`));
      const connectionKey = session.connectionKey || (session.projectId ? session.projectId : 'account');
      return {
        user_id: userId,
        project_id: session.projectId || null,
        connection_key: connectionKey,
        gmail_id: String(message.messageId),
        thread_id: message.threadId != null ? String(message.threadId) : null,
        message_id_header: null,
        from_addr: formatFrom(message),
        subject,
        snippet,
        received_at: receivedAt(message.receivedTime),
        unread,
        urgent,
        synced_at: new Date().toISOString(),
      };
    });
  if (rows.length) {
    const { error } = await admin.from('mail_messages').upsert(rows, { onConflict: 'user_id,connection_key,gmail_id' });
    if (error) throw error;
  }
  const connectionKey = session.connectionKey || (session.projectId ? session.projectId : 'account');
  let touch = admin.from('mail_connections').update({
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  touch = session.connectionId ? touch.eq('id', session.connectionId) : touch.eq('connection_key', connectionKey);
  const { error: touchError } = await touch;
  if (touchError) throw touchError;
  return { count: rows.length };
}

export async function sendZohoMessage(
  session: ZohoSession,
  { to, subject, body, messageId }: { to: string; subject: string; body: string; messageId?: string | null },
) {
  if (!session.apiBase || !session.accountId) throw new Error('Zoho Mail account is incomplete');
  if (!session.email) throw new Error('Zoho sender address is missing');
  const payload: Record<string, string> = {
    fromAddress: session.email,
    toAddress: to,
    subject,
    content: body,
    mailFormat: 'plaintext',
    encoding: 'UTF-8',
    askReceipt: 'no',
  };
  if (messageId) {
    payload.action = 'reply';
    return zohoFetch(
      session.apiBase,
      session.token,
      `accounts/${encodeURIComponent(session.accountId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
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
