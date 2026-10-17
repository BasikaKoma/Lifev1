import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { assertServiceOrCronAuth } from '../_shared/supabase.ts';
import { ensureWebhookSubscriptions } from '../_shared/ouraWebhook.ts';

/** Daily cron (or manual run): creates missing Oura webhook subscriptions and renews expiring ones. */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    await assertServiceOrCronAuth(req);
    const result = await ensureWebhookSubscriptions();
    return jsonResponse({ ok: result.errors.length === 0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscription update failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
