export const META_GRAPH_VERSION = 'v21.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

/** Discovery scopes only — publish permissions come in a later reconnect. */
export const META_SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
].join(',');

export type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type MetaPageAccount = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  } | null;
};

export type StoredDestination = {
  page_id: string;
  selected_for_facebook: boolean;
  selected_for_instagram: boolean;
};

export function getMetaConfig() {
  const appId = Deno.env.get('META_APP_ID');
  const appSecret = Deno.env.get('META_APP_SECRET');
  const redirectUri = Deno.env.get('META_REDIRECT_URI');
  if (!appId || !appSecret || !redirectUri) {
    throw new Error('Λείπουν META_APP_ID / META_APP_SECRET / META_REDIRECT_URI στα Edge Function secrets.');
  }
  return { appId, appSecret, redirectUri };
}

export function fallbackMetaRedirect(): string {
  return Deno.env.get('META_SUCCESS_REDIRECT') ?? 'http://127.0.0.1:17823/?meta=connected';
}

export function sanitizeReturnTo(value: unknown): string {
  const fallback = fallbackMetaRedirect();
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'lifev1:') return url.toString();
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function withMetaResult(returnTo: string, result: 'connected' | 'error'): string {
  try {
    const url = new URL(returnTo);
    if (url.protocol === 'lifev1:') {
      url.searchParams.set('success', result === 'connected' ? '1' : '0');
      if (result === 'error') url.searchParams.set('error', '1');
      else url.searchParams.delete('error');
      return url.toString();
    }
    url.searchParams.set('meta', result);
    return url.toString();
  } catch {
    return returnTo;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: META_SCOPES,
    display: 'popup',
  });
  return `${META_OAUTH_DIALOG}?${params.toString()}`;
}

export function tokenExpiresAt(expiresIn?: number): string {
  const seconds = Number.isFinite(expiresIn) && (expiresIn as number) > 0
    ? (expiresIn as number)
    : 60 * 60;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function readGraphError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    if (json?.error?.message) return json.error.message;
  } catch {
    /* raw text */
  }
  return text || `Graph request failed (${res.status})`;
}

export async function exchangeCodeForTokens(code: string): Promise<MetaTokenResponse> {
  const { appId, appSecret, redirectUri } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Meta token exchange failed: ${await readGraphError(res)}`);
  }
  return await res.json() as MetaTokenResponse;
}

export async function exchangeLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  const { appId, appSecret } = getMetaConfig();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Meta long-lived token exchange failed: ${await readGraphError(res)}`);
  }
  return await res.json() as MetaTokenResponse;
}

export async function fetchFacebookUserId(accessToken: string): Promise<string> {
  const params = new URLSearchParams({
    fields: 'id',
    access_token: accessToken,
  });
  const res = await fetch(`${META_GRAPH_BASE}/me?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Meta /me failed: ${await readGraphError(res)}`);
  }
  const json = await res.json() as { id?: string };
  if (!json?.id) throw new Error('Meta /me did not return a user id');
  return json.id;
}

export async function fetchPageAccounts(accessToken: string): Promise<MetaPageAccount[]> {
  const pages: MetaPageAccount[] = [];
  const params = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: accessToken,
    limit: '100',
  });
  let next: string | null = `${META_GRAPH_BASE}/me/accounts?${params.toString()}`;

  while (next) {
    const res = await fetch(next);
    if (!res.ok) {
      throw new Error(`Meta /me/accounts failed: ${await readGraphError(res)}`);
    }
    const json = await res.json() as {
      data?: MetaPageAccount[];
      paging?: { next?: string };
    };
    pages.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  return pages.filter((page) => page?.id && page.access_token);
}

export async function revokeMetaPermissions(accessToken: string): Promise<void> {
  const params = new URLSearchParams({ access_token: accessToken });
  const res = await fetch(`${META_GRAPH_BASE}/me/permissions?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Meta revoke failed: ${await readGraphError(res)}`);
  }
}

export function buildDestinationRows(
  userId: string,
  pages: MetaPageAccount[],
  previous: StoredDestination[] = [],
) {
  const prevByPage = new Map(previous.map((row) => [row.page_id, row]));
  const withIg = pages.filter((page) => page.instagram_business_account?.id);
  const autoFacebookId = pages.length === 1 ? pages[0].id : null;
  const autoInstagramPageId = withIg.length === 1 ? withIg[0].id : null;
  const hadFacebook = previous.some((row) => row.selected_for_facebook);
  const hadInstagram = previous.some((row) => row.selected_for_instagram);

  const rows = pages.map((page) => {
    const ig = page.instagram_business_account;
    const prev = prevByPage.get(page.id);
    let selectedForFacebook = Boolean(prev?.selected_for_facebook);
    let selectedForInstagram = Boolean(prev?.selected_for_instagram && ig?.id);

    if (!hadFacebook && autoFacebookId) {
      selectedForFacebook = page.id === autoFacebookId;
    }
    if (!hadInstagram && autoInstagramPageId) {
      selectedForInstagram = page.id === autoInstagramPageId && Boolean(ig?.id);
    }

    return {
      user_id: userId,
      page_id: page.id,
      page_name: page.name || page.id,
      page_access_token: page.access_token as string,
      ig_user_id: ig?.id || null,
      ig_username: ig?.username || null,
      selected_for_facebook: selectedForFacebook,
      selected_for_instagram: selectedForInstagram,
      updated_at: new Date().toISOString(),
    };
  });

  let facebookTaken = false;
  let instagramTaken = false;
  return rows.map((row) => {
    const selectedForFacebook = row.selected_for_facebook && !facebookTaken;
    if (selectedForFacebook) facebookTaken = true;
    const selectedForInstagram = row.selected_for_instagram && !instagramTaken;
    if (selectedForInstagram) instagramTaken = true;
    return {
      ...row,
      selected_for_facebook: selectedForFacebook,
      selected_for_instagram: selectedForInstagram,
    };
  });
}
