import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { fetchErpDomain, isErpDomain } from '../_shared/erp.ts';
import {
  isSymphonConnection,
  SYMPHON_CONNECTION_COLUMNS,
  syncSymphonSales,
  type SymphonConnection,
} from '../_shared/symphon.ts';

const SYMPHON_ONLY_SALES = 'Το Symphon δίνει ημερήσια παραγγελία μόνο στον τομέα πωλήσεων.';

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
      .select(SYMPHON_CONNECTION_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    const row = connection as SymphonConnection | null;
    if (!row) return jsonResponse({ connected: false, domain, data: null });

    if (isSymphonConnection(row)) {
      if (!row.org_id) {
        return jsonResponse({ connected: true, needsOrg: true, domain, data: null });
      }
      if (domain !== 'sales') {
        return jsonResponse({
          connected: true,
          domain,
          data: { available: false, source: 'symphon', note: SYMPHON_ONLY_SALES },
        });
      }
      const reportDate = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : undefined;
      const synced = await syncSymphonSales(admin, row, reportDate);
      return jsonResponse({ connected: true, domain, fetchedAt: synced.fetchedAt, data: synced.data });
    }

    if (!row.base_url || !row.api_key) {
      return jsonResponse({ connected: false, domain, data: null });
    }

    const data = await fetchErpDomain(row.base_url, row.api_key, domain);
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
