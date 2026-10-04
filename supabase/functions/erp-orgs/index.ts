import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  ensureSymphonAccessToken,
  isSymphonConnection,
  listSymphonOrgs,
  SYMPHON_CONNECTION_COLUMNS,
  syncSymphonSales,
  type SymphonConnection,
} from '../_shared/symphon.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');
    const admin = getServiceClient();
    const { data, error } = await admin
      .from('erp_connections')
      .select(SYMPHON_CONNECTION_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    const row = data as SymphonConnection | null;
    if (!row || !isSymphonConnection(row)) {
      return jsonResponse({ connected: false, orgs: [] });
    }

    const accessToken = await ensureSymphonAccessToken(admin, row);
    const orgs = await listSymphonOrgs(accessToken);

    if (action === 'select') {
      const orgId = String(body?.orgId || '').trim();
      const chosen = orgs.find((org) => org.org_id === orgId);
      if (!chosen) return errorResponse('Unknown organization');
      const now = new Date().toISOString();
      const { error: updateError } = await admin.from('erp_connections').update({
        org_id: chosen.org_id,
        org_name: chosen.name,
        label: chosen.name,
        updated_at: now,
      }).eq('user_id', user.id);
      if (updateError) throw updateError;
      row.org_id = chosen.org_id;
      row.org_name = chosen.name;
      const synced = await syncSymphonSales(admin, row);
      return jsonResponse({
        connected: true,
        org_id: chosen.org_id,
        org_name: chosen.name,
        fetchedAt: synced.fetchedAt,
      });
    }

    return jsonResponse({ connected: true, orgs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Symphon organizations failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
