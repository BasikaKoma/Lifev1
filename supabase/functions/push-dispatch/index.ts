import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { assertServiceOrCronAuth, getServiceClient } from '../_shared/supabase.ts';
import { dispatchDuePushes } from '../_shared/push.ts';

/**
 * Cron (every minute, vault secret): sends everyone's due reminders.
 * Signed-in user (e.g. "send test"): sends only that user's due reminders.
 * verify_jwt is off so the cron secret gets through, so user tokens are verified here.
 */
async function signedInUserId(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.split('.').length !== 3) return null;
  const { data, error } = await getServiceClient().auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const userId = await signedInUserId(req);
    if (!userId) await assertServiceOrCronAuth(req);
    const result = await dispatchDuePushes(userId);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Dispatch failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
