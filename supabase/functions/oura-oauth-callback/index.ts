import { getServiceClient } from '../_shared/supabase.ts';
import {
  exchangeCodeForTokens,
  tokenExpiresAt,
  OURA_SCOPES,
} from '../_shared/oura.ts';
import { syncOuraForUser } from '../_shared/sync.ts';

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const fallbackRedirect = Deno.env.get('OURA_SUCCESS_REDIRECT') ?? 'http://127.0.0.1:17823/?oura=connected';

  if (oauthError) {
    return Response.redirect(fallbackRedirect, 302);
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  try {
    const admin = getServiceClient();
    const { data: pending, error: stateError } = await admin
      .from('oura_oauth_states')
      .select('user_id, return_to, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (stateError) throw stateError;
    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const tokens = await exchangeCodeForTokens(code);
    const { error: upsertError } = await admin.from('oura_connections').upsert({
      user_id: pending.user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokenExpiresAt(tokens.expires_in),
      scopes: OURA_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;

    await admin.from('oura_oauth_states').delete().eq('state', state);

    try {
      await syncOuraForUser(pending.user_id);
    } catch (syncErr) {
      console.error('Initial Oura sync failed:', syncErr);
    }

    return Response.redirect(pending.return_to, 302);
  } catch (err) {
    console.error(err);
    return Response.redirect(fallbackRedirect, 302);
  }
});
