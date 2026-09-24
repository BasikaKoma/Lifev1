import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { accessTokenForUser, syncMailbox } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const admin = getServiceClient();
    const token = await accessTokenForUser(admin, user.id);
    const result = await syncMailbox(admin, user.id, token);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail sync failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
