import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { revokeMetaPermissions } from '../_shared/meta.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const admin = getServiceClient();
    const { data: connection } = await admin
      .from('meta_connections')
      .select('user_access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connection?.user_access_token) {
      try {
        await revokeMetaPermissions(connection.user_access_token);
      } catch (revokeError) {
        console.error('Meta revoke failed:', revokeError);
      }
    }

    const { error } = await admin.from('meta_connections').delete().eq('user_id', user.id);
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία αποσύνδεσης Meta';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
