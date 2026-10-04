import { getServiceClient } from '../_shared/supabase.ts';
import {
  exchangeSymphonCode,
  listSymphonOrgs,
  syncSymphonSales,
  tokenExpiresAt,
  type SymphonConnection,
} from '../_shared/symphon.ts';

function withErpFlag(returnTo: string, flag: string): string {
  try {
    const url = new URL(returnTo);
    url.searchParams.set('erp', flag);
    return url.toString();
  } catch {
    return returnTo;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const fallbackRedirect = Deno.env.get('SYMPHON_SUCCESS_REDIRECT') ?? 'https://lifev1-app.pages.dev/?erp=connected';

  if (oauthError || !code || !state) return Response.redirect(withErpFlag(fallbackRedirect, 'error'), 302);

  const admin = getServiceClient();
  try {
    const { data: pending, error: stateError } = await admin
      .from('erp_oauth_states')
      .select('user_id, return_to, code_verifier, expires_at')
      .eq('state', state)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!pending?.code_verifier || new Date(pending.expires_at).getTime() < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const tokens = await exchangeSymphonCode(code, pending.code_verifier);
    if (!tokens.refresh_token) throw new Error('Symphon did not return a refresh token');
    const orgs = await listSymphonOrgs(tokens.access_token);
    const chosen = orgs.length === 1 ? orgs[0] : null;
    const now = new Date().toISOString();
    const { error: upsertError } = await admin.from('erp_connections').upsert({
      user_id: pending.user_id,
      provider: 'symphon',
      label: chosen?.name || 'Symphon',
      base_url: null,
      api_key: null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokenExpiresAt(tokens.expires_in),
      org_id: chosen?.org_id || null,
      org_name: chosen?.name || null,
      connected_at: now,
      updated_at: now,
    });
    if (upsertError) throw upsertError;

    if (chosen) {
      const row: SymphonConnection = {
        user_id: pending.user_id,
        provider: 'symphon',
        base_url: null,
        api_key: null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokenExpiresAt(tokens.expires_in),
        org_id: chosen.org_id,
        org_name: chosen.name,
      };
      try {
        await syncSymphonSales(admin, row);
      } catch (syncErr) {
        console.error('Initial Symphon sync failed', syncErr instanceof Error ? syncErr.message : '');
      }
    }

    const flag = chosen ? 'connected' : orgs.length ? 'choose' : 'no-org';
    return Response.redirect(withErpFlag(pending.return_to || fallbackRedirect, flag), 302);
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'symphon oauth failed');
    return Response.redirect(withErpFlag(fallbackRedirect, 'error'), 302);
  } finally {
    if (state) await admin.from('erp_oauth_states').delete().eq('state', state);
  }
});
