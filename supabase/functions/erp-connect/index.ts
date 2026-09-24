import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { assertErpBaseUrl } from '../_shared/erp.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const baseUrl = assertErpBaseUrl(String(body?.baseUrl || ''));
    const apiKey = String(body?.apiKey || '').trim();
    const label = String(body?.label || '').trim().slice(0, 80);
    if (!apiKey) return errorResponse('API key is required');

    const admin = getServiceClient();
    const { error } = await admin.from('erp_connections').upsert({
      user_id: user.id,
      label,
      base_url: baseUrl,
      api_key: apiKey,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return jsonResponse({ ok: true, connected: true, label });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ERP connect failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
