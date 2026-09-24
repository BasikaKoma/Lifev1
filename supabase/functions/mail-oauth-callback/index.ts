import { getServiceClient } from '../_shared/supabase.ts';
import {
  exchangeMailCode,
  fetchMailboxEmail,
  MAIL_SCOPES,
  syncMailbox,
  tokenExpiresAt,
} from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const fallbackRedirect = Deno.env.get('MAIL_SUCCESS_REDIRECT') ?? 'http://127.0.0.1:17823/?mail=connected';

  if (oauthError || !code || !state) return Response.redirect(fallbackRedirect, 302);

  try {
    const admin = getServiceClient();
    const { data: pending, error: stateError } = await admin
      .from('mail_oauth_states')
      .select('user_id, return_to, expires_at')
      .eq('state', state)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const tokens = await exchangeMailCode(code);
    if (!tokens.refresh_token) throw new Error('Gmail did not return a refresh token');
    const email = await fetchMailboxEmail(tokens.access_token);
    const { error: upsertError } = await admin.from('mail_connections').upsert({
      user_id: pending.user_id,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokenExpiresAt(tokens.expires_in),
      scopes: MAIL_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;
    await admin.from('mail_oauth_states').delete().eq('state', state);

    try {
      await syncMailbox(admin, pending.user_id, tokens.access_token);
    } catch (syncErr) {
      console.error('Initial mail sync failed', syncErr instanceof Error ? syncErr.message : '');
    }

    return Response.redirect(pending.return_to, 302);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'mail oauth failed');
    return Response.redirect(fallbackRedirect, 302);
  }
});
