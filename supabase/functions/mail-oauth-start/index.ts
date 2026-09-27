import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { buildMailAuthorizeUrl } from '../_shared/mail.ts';
import { buildZohoAuthorizeUrl, zohoRegion } from '../_shared/zohoMail.ts';

function sanitizeReturnTo(value: unknown): string {
  const fallback = Deno.env.get('MAIL_SUCCESS_REDIRECT') ?? 'http://127.0.0.1:17823/?mail=connected';
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const returnTo = sanitizeReturnTo(body?.return_to);
    const provider = body?.provider === 'zoho' ? 'zoho' : 'gmail';
    const region = provider === 'zoho' ? zohoRegion(body?.region).id : null;
    const state = crypto.randomUUID();
    const admin = getServiceClient();

    await admin.from('mail_oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error: stateError } = await admin.from('mail_oauth_states').insert({
      state,
      user_id: user.id,
      return_to: returnTo,
      provider,
      region,
    });
    if (stateError) throw stateError;

    const url = provider === 'zoho'
      ? buildZohoAuthorizeUrl(state, region || 'eu')
      : buildMailAuthorizeUrl(state);
    return jsonResponse({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start mail OAuth';
    const status = message === 'Missing authorization' ? 401 : 500;
    return errorResponse(message, status);
  }
});
