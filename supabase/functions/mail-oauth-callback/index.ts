import { getServiceClient } from '../_shared/supabase.ts';
import {
  exchangeMailCode,
  fetchMailboxEmail,
  MAIL_SCOPES,
  syncMailbox,
  tokenExpiresAt,
} from '../_shared/mail.ts';
import { exchangeZohoCode, fetchZohoAccount, ZOHO_SCOPES } from '../_shared/zohoMail.ts';

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
      .select('user_id, return_to, expires_at, provider, region, project_id')
      .eq('state', state)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const provider = pending.provider === 'zoho' ? 'zoho' : 'gmail';
    const projectId = pending.project_id || null;
    const connectionKey = projectId || 'account';
    let email: string | null = null;
    let accessToken = '';
    let accountId: string | null = null;
    let apiBase: string | null = null;
    let accountsHost: string | null = null;
    let connectionId: string | null = null;
    if (provider === 'zoho') {
      const connected = await exchangeZohoCode(code, pending.region || 'eu');
      if (!connected.tokens.refresh_token) throw new Error('Zoho did not return a refresh token');
      const account = await fetchZohoAccount(connected.region.apiBase, connected.tokens.access_token);
      email = account.email;
      accessToken = connected.tokens.access_token;
      accountId = account.accountId;
      apiBase = connected.region.apiBase;
      accountsHost = connected.region.accountsHost;
      const { data: saved, error: upsertError } = await admin.from('mail_connections').upsert({
        user_id: pending.user_id,
        project_id: projectId,
        connection_key: connectionKey,
        provider: 'zoho',
        email,
        account_id: accountId,
        api_base: apiBase,
        accounts_host: accountsHost,
        access_token: accessToken,
        refresh_token: connected.tokens.refresh_token,
        expires_at: tokenExpiresAt(connected.tokens.expires_in),
        scopes: ZOHO_SCOPES,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,connection_key' }).select('id').single();
      if (upsertError) throw upsertError;
      connectionId = saved?.id || null;
    } else {
      const tokens = await exchangeMailCode(code);
      if (!tokens.refresh_token) throw new Error('Gmail did not return a refresh token');
      email = await fetchMailboxEmail(tokens.access_token);
      accessToken = tokens.access_token;
      const { data: saved, error: upsertError } = await admin.from('mail_connections').upsert({
        user_id: pending.user_id,
        project_id: projectId,
        connection_key: connectionKey,
        provider: 'gmail',
        email,
        account_id: null,
        api_base: null,
        accounts_host: null,
        access_token: accessToken,
        refresh_token: tokens.refresh_token,
        expires_at: tokenExpiresAt(tokens.expires_in),
        scopes: MAIL_SCOPES,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,connection_key' }).select('id').single();
      if (upsertError) throw upsertError;
      connectionId = saved?.id || null;
    }
    await admin.from('mail_oauth_states').delete().eq('state', state);

    try {
      await syncMailbox(admin, pending.user_id, {
        provider,
        token: accessToken,
        accountId,
        apiBase,
        accountsHost,
        email,
        projectId,
        connectionKey,
        connectionId,
      });
    } catch (syncErr) {
      console.error('Initial mail sync failed', syncErr instanceof Error ? syncErr.message : '');
    }

    return Response.redirect(pending.return_to, 302);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'mail oauth failed');
    return Response.redirect(fallbackRedirect, 302);
  }
});
