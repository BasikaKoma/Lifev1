import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { assertServiceOrCronAuth, getUserFromRequest } from '../_shared/supabase.ts';
import { runMailAgent, runMailAgentForAll, withinAgentHours } from '../_shared/mailAgent.ts';

/**
 * Hourly cron (assistant cron secret): every Zoho mailbox, 08:00–20:00 Athens only.
 * Signed-in user ("Τρέξε τώρα"): that user's mailboxes, or one by connectionKey, at any hour.
 * verify_jwt is off so the cron secret gets through; user tokens are verified in code.
 */
async function signedInUserId(req: Request): Promise<string | null> {
  try {
    return (await getUserFromRequest(req)).id;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const userId = await signedInUserId(req);
    if (userId) {
      const body = await req.json().catch(() => ({}));
      const connectionKey = typeof body?.connectionKey === 'string' && body.connectionKey.trim()
        ? body.connectionKey.trim()
        : null;
      const runs = await runMailAgent({ userId, trigger: 'manual', connectionKey });
      return jsonResponse({ ok: true, runs });
    }

    await assertServiceOrCronAuth(req);
    if (!withinAgentHours()) return jsonResponse({ ok: true, skipped: 'outside agent hours' });
    return jsonResponse({ ok: true, ...(await runMailAgentForAll()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail agent failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
