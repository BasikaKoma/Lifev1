const DEFAULT_SYMPHON_URL = 'https://mfcqoutzepneuxmaboix.supabase.co';

export type SymphonOrg = { org_id: string; name: string };

export type SymphonTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type SymphonConnection = {
  user_id: string;
  provider: string | null;
  base_url: string | null;
  api_key: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  org_id: string | null;
  org_name: string | null;
};

export const SYMPHON_CONNECTION_COLUMNS =
  'user_id, provider, base_url, api_key, access_token, refresh_token, expires_at, org_id, org_name';

type Admin = {
  from: (table: string) => any;
};

export function isSymphonConnection(row: Partial<SymphonConnection> | null | undefined): boolean {
  return row?.provider === 'symphon' || Boolean(row?.access_token && row?.refresh_token);
}

function symphonUrl(): string {
  return (Deno.env.get('SYMPHON_URL') || DEFAULT_SYMPHON_URL).replace(/\/$/, '');
}

export function getSymphonConfig() {
  const clientId = Deno.env.get('SYMPHON_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('SYMPHON_CLIENT_SECRET') || '';
  const publishableKey = Deno.env.get('SYMPHON_PUBLISHABLE_KEY') || '';
  const redirectUri = Deno.env.get('SYMPHON_REDIRECT_URI')
    || 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/erp-oauth-callback';
  if (!clientId || !clientSecret) {
    throw new Error('Missing Symphon OAuth configuration');
  }
  return { clientId, clientSecret, publishableKey, redirectUri, baseUrl: symphonUrl() };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function basicAuthorization(clientId: string, clientSecret: string): string {
  const raw = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = '';
  for (const byte of raw) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export async function buildSymphonAuthorizeUrl(state: string, codeChallenge: string): Promise<string> {
  const { clientId, redirectUri, baseUrl } = getSymphonConfig();
  const url = new URL(`${baseUrl}/auth/v1/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

async function requestTokens(body: URLSearchParams): Promise<SymphonTokens> {
  const { clientId, clientSecret, baseUrl } = getSymphonConfig();
  if (!body.get('client_id')) body.set('client_id', clientId);
  const res = await fetch(`${baseUrl}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthorization(clientId, clientSecret),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.access_token) {
    throw new Error('Symphon token exchange failed');
  }
  return {
    access_token: String(payload.access_token),
    refresh_token: String(payload.refresh_token || ''),
    expires_in: Number(payload.expires_in) || 3600,
  };
}

export function exchangeSymphonCode(code: string, codeVerifier: string): Promise<SymphonTokens> {
  const { redirectUri } = getSymphonConfig();
  return requestTokens(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }));
}

export function refreshSymphonToken(refreshToken: string): Promise<SymphonTokens> {
  return requestTokens(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
}

export function tokenExpiresAt(expiresIn: number): string {
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeOrgs(raw: unknown): SymphonOrg[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { orgs?: unknown }).orgs)
      ? (raw as { orgs: unknown[] }).orgs
      : [];
  const orgs: SymphonOrg[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const orgId = String(row.org_id || row.id || '').trim();
    if (!orgId) continue;
    orgs.push({
      org_id: orgId,
      name: String(row.name || row.org_name || 'Οργανισμός').slice(0, 120),
    });
  }
  return orgs;
}

async function symphonRpc(accessToken: string, name: string, body: Record<string, unknown>) {
  const { publishableKey, baseUrl } = getSymphonConfig();
  if (!publishableKey) throw new Error('Missing Symphon publishable key');
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Symphon ${name} failed (${res.status})`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Symphon ${name} did not return JSON`);
  }
}

export function listSymphonOrgs(accessToken: string): Promise<SymphonOrg[]> {
  return symphonRpc(accessToken, 'oauth_list_orgs', {}).then(normalizeOrgs);
}

export async function fetchSymphonDailyMetrics(accessToken: string, orgId: string, reportDate?: string) {
  const body: Record<string, unknown> = { p_org_id: orgId };
  if (reportDate) body.p_report_date = reportDate;
  const raw = await symphonRpc(accessToken, 'oauth_daily_order_metrics', body);
  const data = Array.isArray(raw) ? raw[0] : raw;
  const metrics = data && typeof data === 'object' ? data as Record<string, unknown> : { value: data };
  return {
    ...metrics,
    source: 'symphon',
    org_id: orgId,
    report_date: reportDate || null,
  };
}

export async function ensureSymphonAccessToken(admin: Admin, row: SymphonConnection): Promise<string> {
  if (!row.access_token || !row.refresh_token) throw new Error('Symphon is not connected');
  const expires = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expires > Date.now() + 60_000) return row.access_token;

  const tokens = await refreshSymphonToken(row.refresh_token);
  const nextRefresh = tokens.refresh_token || row.refresh_token;
  const expiresAt = tokenExpiresAt(tokens.expires_in);
  const { error } = await admin.from('erp_connections').update({
    access_token: tokens.access_token,
    refresh_token: nextRefresh,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', row.user_id);
  if (error) throw error;
  row.access_token = tokens.access_token;
  row.refresh_token = nextRefresh;
  row.expires_at = expiresAt;
  return tokens.access_token;
}

export async function syncSymphonSales(admin: Admin, row: SymphonConnection, reportDate?: string) {
  if (!row.org_id) throw new Error('Choose a Symphon organization');
  const accessToken = await ensureSymphonAccessToken(admin, row);
  const payload = await fetchSymphonDailyMetrics(accessToken, row.org_id, reportDate);
  const fetchedAt = new Date().toISOString();
  const { error } = await admin.from('erp_snapshots').upsert({
    user_id: row.user_id,
    domain: 'sales',
    payload,
    fetched_at: fetchedAt,
  });
  if (error) throw error;
  return { fetchedAt, data: payload };
}
