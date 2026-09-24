import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { assertServiceOrCronAuth } from '../_shared/supabase.ts';
import { pullAssistantForAll } from '../_shared/daily.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    await assertServiceOrCronAuth(req);
    const result = await pullAssistantForAll();
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Daily pull failed';
    return errorResponse(message, message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500);
  }
});
