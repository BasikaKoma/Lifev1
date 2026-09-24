export const META_GRAPH_VERSION = 'v21.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

/** business_management is required for Pages owned by a Business Portfolio.
 *  pages_read_user_content is omitted: Meta rejects it unless the Page use case
 *  has that permission enabled, and listing Pages/IG does not need it.
 *  Enable pages_manage_posts + instagram_content_publish on the Meta app
 *  (Page + Instagram use cases) before reconnecting, or Login returns Invalid Scopes. */
export const META_SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'pages_manage_posts',
  'instagram_content_publish',
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
    auth_type: 'rerequest',
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function graphGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(query);
  const res = await fetch(`${META_GRAPH_BASE}/${path}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(await readGraphError(res));
  }
  return await res.json() as T;
}

export async function graphPost<T>(path: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`${META_GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(await readGraphError(res));
  }
  return await res.json() as T;
}

export async function fetchGrantedScopes(accessToken: string): Promise<string> {
  try {
    const json = await graphGet<{ data?: { permission?: string; status?: string }[] }>('me/permissions', {
      access_token: accessToken,
    });
    const granted = (json.data || [])
      .filter((row) => row.status === 'granted' && row.permission)
      .map((row) => String(row.permission));
    if (granted.length) return granted.join(',');
  } catch (err) {
    console.error('Meta /me/permissions failed:', err);
  }
  return META_SCOPES;
}

function clipCaption(text: string, max: number) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export async function publishFacebookPost(options: {
  pageId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl?: string | null;
}): Promise<{ media_id: string; permalink: string | null }> {
  const caption = clipCaption(options.caption, 5000);
  if (!caption && !options.imageUrl) {
    throw new Error('Άδειο κείμενο — δεν υπάρχει τίποτα για δημοσίευση στο Facebook.');
  }

  if (options.imageUrl) {
    const created = await graphPost<{ id?: string; post_id?: string }>(`${options.pageId}/photos`, {
      url: options.imageUrl,
      caption,
      published: 'true',
      access_token: options.pageAccessToken,
    });
    const mediaId = created.post_id || created.id;
    if (!mediaId) throw new Error('Το Facebook δεν γύρισε id δημοσίευσης.');
    let permalink: string | null = null;
    try {
      const details = await graphGet<{ permalink_url?: string; link?: string }>(mediaId, {
        fields: 'permalink_url,link',
        access_token: options.pageAccessToken,
      });
      permalink = details.permalink_url || details.link || null;
    } catch {
      permalink = `https://www.facebook.com/${mediaId}`;
    }
    return { media_id: mediaId, permalink };
  }

  const created = await graphPost<{ id?: string }>(`${options.pageId}/feed`, {
    message: caption,
    access_token: options.pageAccessToken,
  });
  if (!created.id) throw new Error('Το Facebook δεν γύρισε id δημοσίευσης.');
  let permalink: string | null = null;
  try {
    const details = await graphGet<{ permalink_url?: string }>(created.id, {
      fields: 'permalink_url',
      access_token: options.pageAccessToken,
    });
    permalink = details.permalink_url || null;
  } catch {
    permalink = `https://www.facebook.com/${created.id}`;
  }
  return { media_id: created.id, permalink };
}

export async function publishInstagramImage(options: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}): Promise<{ media_id: string; permalink: string | null }> {
  if (!options.imageUrl) {
    throw new Error('Το Instagram χρειάζεται εικόνα. Το API δεν δέχεται σκέτο κείμενο.');
  }
  const caption = clipCaption(options.caption, 2200);
  const container = await graphPost<{ id?: string }>(`${options.igUserId}/media`, {
    image_url: options.imageUrl,
    caption,
    access_token: options.pageAccessToken,
  });
  if (!container.id) throw new Error('Το Instagram δεν έφτιαξε media container.');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await graphGet<{ status_code?: string; status?: string }>(container.id, {
      fields: 'status_code,status',
      access_token: options.pageAccessToken,
    });
    const code = String(status.status_code || '').toUpperCase();
    if (code === 'FINISHED' || code === 'PUBLISHED') break;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(status.status || 'Αποτυχία προετοιμασίας εικόνας Instagram.');
    }
    if (!code && attempt >= 1) break;
    await sleep(1500);
  }

  const published = await graphPost<{ id?: string }>(`${options.igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: options.pageAccessToken,
  });
  if (!published.id) throw new Error('Το Instagram δεν ολοκλήρωσε τη δημοσίευση.');

  let permalink: string | null = null;
  try {
    const details = await graphGet<{ permalink?: string }>(published.id, {
      fields: 'permalink',
      access_token: options.pageAccessToken,
    });
    permalink = details.permalink || null;
  } catch {
    permalink = null;
  }
  return { media_id: published.id, permalink };
}
