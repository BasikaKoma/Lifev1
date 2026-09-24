import { getServiceClient } from '../_shared/supabase.ts';
import {
  buildDestinationRows,
  exchangeCodeForTokens,
  exchangeLongLivedToken,
  fallbackMetaRedirect,
  fetchFacebookUserId,
  fetchGrantedScopes,
  fetchPageAccounts,
  tokenExpiresAt,
  withMetaResult,
  type StoredDestination,
} from '../_shared/meta.ts';

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const fallback = fallbackMetaRedirect();

  if (oauthError) {
    return Response.redirect(withMetaResult(fallback, 'error'), 302);
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  try {
    const admin = getServiceClient();
    const { data: pending, error: stateError } = await admin
      .from('meta_oauth_states')
      .select('user_id, return_to, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (stateError) throw stateError;
    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const shortLived = await exchangeCodeForTokens(code);
    let userToken = shortLived.access_token;
    let expiresIn = shortLived.expires_in;
    try {
      const longLived = await exchangeLongLivedToken(shortLived.access_token);
      userToken = longLived.access_token;
      expiresIn = longLived.expires_in ?? expiresIn;
    } catch (longLivedError) {
      console.error('Meta long-lived exchange failed, keeping short-lived token:', longLivedError);
    }

    const fbUserId = await fetchFacebookUserId(userToken);
    const pages = await fetchPageAccounts(userToken);
    const grantedScopes = await fetchGrantedScopes(userToken);

    const { data: previousRows } = await admin
      .from('meta_destinations')
      .select('page_id, selected_for_facebook, selected_for_instagram')
      .eq('user_id', pending.user_id);
    const previous = (previousRows || []) as StoredDestination[];

    const now = new Date().toISOString();
    const { error: upsertError } = await admin.from('meta_connections').upsert({
      user_id: pending.user_id,
      fb_user_id: fbUserId,
      user_access_token: userToken,
      user_token_expires_at: tokenExpiresAt(expiresIn),
      scopes: grantedScopes,
      connected_at: now,
      updated_at: now,
    });
    if (upsertError) throw upsertError;

    const destinations = buildDestinationRows(pending.user_id, pages, previous);
    await admin.from('meta_destinations').delete().eq('user_id', pending.user_id);
    if (destinations.length) {
      const { error: destError } = await admin.from('meta_destinations').insert(destinations);
      if (destError) throw destError;
    }

    await admin.from('meta_oauth_states').delete().eq('state', state);

    return Response.redirect(withMetaResult(pending.return_to, 'connected'), 302);
  } catch (err) {
    console.error(err);
    return Response.redirect(withMetaResult(fallback, 'error'), 302);
  }
});
