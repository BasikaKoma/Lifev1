import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const admin = getServiceClient();
    const { data, error } = await admin
      .from('oura_connections')
      .select('connected_at, last_synced_at, scopes, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return jsonResponse({
      connected: Boolean(data),
      connected_at: data?.connected_at ?? null,
      last_synced_at: data?.last_synced_at ?? null,
      scopes: data?.scopes ?? null,
      token_valid: data ? new Date(data.expires_at).getTime() > Date.now() : false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
