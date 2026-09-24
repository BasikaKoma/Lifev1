import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { fetchErpDomain, isErpDomain } from '../_shared/erp.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const domain = String(body?.domain || '').trim();
    if (!isErpDomain(domain)) return errorResponse('Unknown ERP domain');

    const admin = getServiceClient();
    const { data: connection, error } = await admin
      .from('erp_connections')
      .select('base_url, api_key')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!connection?.base_url || !connection?.api_key) {
      return jsonResponse({ connected: false, domain, data: null });
    }

    const data = await fetchErpDomain(connection.base_url, connection.api_key, domain);
    const fetchedAt = new Date().toISOString();
    await admin.from('erp_snapshots').upsert({
      user_id: user.id,
      domain,
      payload: data,
      fetched_at: fetchedAt,
    });
    return jsonResponse({ connected: true, domain, fetchedAt, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ERP query failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
