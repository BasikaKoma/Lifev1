import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { buildAuthorizeUrl } from '../_shared/oura.ts';

function sanitizeReturnTo(value: unknown): string {
  const fallback = Deno.env.get('OURA_SUCCESS_REDIRECT') ?? 'http://127.0.0.1:17823/?oura=connected';
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

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const returnTo = sanitizeReturnTo(body?.return_to);
    const state = crypto.randomUUID();
    const admin = getServiceClient();

    await admin.from('oura_oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error: stateError } = await admin.from('oura_oauth_states').insert({
      state,
      user_id: user.id,
      return_to: returnTo,
    });
    if (stateError) throw stateError;

    return jsonResponse({ url: buildAuthorizeUrl(state) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Oura OAuth';
    return errorResponse(message, err instanceof Error && message === 'Missing authorization' ? 401 : 500);
  }
});
