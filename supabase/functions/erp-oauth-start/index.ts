import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { buildSymphonAuthorizeUrl, createCodeChallenge, createCodeVerifier } from '../_shared/symphon.ts';

function sanitizeReturnTo(value: unknown): string {
  const fallback = Deno.env.get('SYMPHON_SUCCESS_REDIRECT') ?? 'https://lifev1-app.pages.dev/?erp=connected';
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
    const state = crypto.randomUUID();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const admin = getServiceClient();

    await admin.from('erp_oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error: stateError } = await admin.from('erp_oauth_states').insert({
      state,
      user_id: user.id,
      code_verifier: codeVerifier,
      return_to: returnTo,
    });
    if (stateError) throw stateError;

    const url = await buildSymphonAuthorizeUrl(state, codeChallenge);
    return jsonResponse({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Symphon OAuth';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
