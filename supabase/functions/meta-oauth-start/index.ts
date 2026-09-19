import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { buildAuthorizeUrl, sanitizeReturnTo } from '../_shared/meta.ts';

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

    await admin.from('meta_oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error: stateError } = await admin.from('meta_oauth_states').insert({
      state,
      user_id: user.id,
      return_to: returnTo,
    });
    if (stateError) throw stateError;

    return jsonResponse({ url: buildAuthorizeUrl(state) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Meta OAuth';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
