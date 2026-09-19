import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  buildDestinationRows,
  exchangeLongLivedToken,
  fetchPageAccounts,
  tokenExpiresAt,
  type StoredDestination,
} from '../_shared/meta.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const admin = getServiceClient();
    const { data: connection, error: connError } = await admin
      .from('meta_connections')
      .select('user_access_token, user_token_expires_at, scopes, fb_user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError) throw connError;
    if (!connection) {
      return errorResponse('Το Meta δεν είναι συνδεδεμένο.', 400);
    }

    let accessToken = connection.user_access_token as string;
    let expiresAt = connection.user_token_expires_at as string;
    const expiresMs = new Date(expiresAt).getTime();
    const shouldRefresh = !Number.isFinite(expiresMs) || expiresMs < Date.now() + SEVEN_DAYS_MS;

    if (shouldRefresh) {
      try {
        const refreshed = await exchangeLongLivedToken(accessToken);
        accessToken = refreshed.access_token;
        expiresAt = tokenExpiresAt(refreshed.expires_in);
        const { error: updateError } = await admin.from('meta_connections').update({
          user_access_token: accessToken,
          user_token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
        if (updateError) throw updateError;
      } catch (refreshError) {
        console.error('Meta token refresh failed:', refreshError);
        if (expiresMs < Date.now()) {
          return errorResponse('Το token του Meta έληξε. Ξανασύνδεσε τον λογαριασμό.', 401);
        }
      }
    }

    const pages = await fetchPageAccounts(accessToken);
    const { data: previousRows } = await admin
      .from('meta_destinations')
      .select('page_id, selected_for_facebook, selected_for_instagram')
      .eq('user_id', user.id);
    const previous = (previousRows || []) as StoredDestination[];
    const destinations = buildDestinationRows(user.id, pages, previous);

    await admin.from('meta_destinations').delete().eq('user_id', user.id);
    if (destinations.length) {
      const { error: destError } = await admin.from('meta_destinations').insert(destinations);
      if (destError) throw destError;
    }

    return jsonResponse({
      ok: true,
      page_count: destinations.length,
      instagram_count: destinations.filter((row) => row.ig_user_id).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία ενημέρωσης Meta Pages';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
