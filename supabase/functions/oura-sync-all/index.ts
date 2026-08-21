import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { assertServiceOrCronAuth } from '../_shared/supabase.ts';
import { syncOuraForAllUsers } from '../_shared/sync.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    await assertServiceOrCronAuth(req);
    const result = await syncOuraForAllUsers();
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
