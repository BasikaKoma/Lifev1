import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  exchangeLongLivedToken,
  fetchPageAccounts,
  publishFacebookPost,
  publishInstagramImage,
  tokenExpiresAt,
  type StoredDestination,
  buildDestinationRows,
} from '../_shared/meta.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type PublishPlatform = 'facebook' | 'instagram';

type PlatformResult = {
  ok: boolean;
  media_id?: string;
  permalink?: string | null;
  error?: string;
};

function asPlatforms(value: unknown): PublishPlatform[] {
  const list = Array.isArray(value) ? value : [];
  const allowed: PublishPlatform[] = [];
  for (const item of list) {
    if (item === 'facebook' || item === 'instagram') {
      if (!allowed.includes(item)) allowed.push(item);
    }
  }
  return allowed;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const platforms = asPlatforms(body?.platforms);
    const caption = String(body?.caption || '').trim();
    const imageUrl = String(body?.image_url || '').trim() || null;
    const itemId = body?.item_id ? String(body.item_id) : null;

    if (!platforms.length) {
      return errorResponse('Διάλεξε Facebook, Instagram ή και τα δύο.', 400);
    }
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        if (parsed.protocol !== 'https:') {
          return errorResponse('Η εικόνα πρέπει να είναι δημόσιο https URL.', 400);
        }
      } catch {
        return errorResponse('Άκυρο URL εικόνας.', 400);
      }
    }
    if (platforms.includes('instagram') && !imageUrl) {
      return errorResponse('Το Instagram χρειάζεται εικόνα.', 400);
    }
    if (platforms.includes('facebook') && !caption && !imageUrl) {
      return errorResponse('Γράψε κείμενο ή πρόσθεσε εικόνα για το Facebook.', 400);
    }

    const admin = getServiceClient();
    const { data: connection, error: connError } = await admin
      .from('meta_connections')
      .select('user_access_token, user_token_expires_at, scopes')
      .eq('user_id', user.id)
      .maybeSingle();
    if (connError) throw connError;
    if (!connection) {
      return errorResponse('Το Meta δεν είναι συνδεδεμένο.', 400);
    }

    const scopes = String(connection.scopes || '');
    const canFacebook = scopes.includes('pages_manage_posts');
    const canInstagram = scopes.includes('instagram_content_publish');
    if (platforms.includes('facebook') && !canFacebook) {
      return errorResponse('Ξανασύνδεσε το Meta για δικαίωμα δημοσίευσης στο Facebook (pages_manage_posts).', 403);
    }
    if (platforms.includes('instagram') && !canInstagram) {
      return errorResponse('Ξανασύνδεσε το Meta για δικαίωμα δημοσίευσης στο Instagram (instagram_content_publish).', 403);
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
        await admin.from('meta_connections').update({
          user_access_token: accessToken,
          user_token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      } catch (refreshError) {
        console.error('Meta token refresh failed:', refreshError);
        if (expiresMs < Date.now()) {
          return errorResponse('Το token του Meta έληξε. Ξανασύνδεσε τον λογαριασμό.', 401);
        }
      }
    }

    const pages = await fetchPageAccounts(accessToken);
    if (pages.length) {
      const { data: previousRows } = await admin
        .from('meta_destinations')
        .select('page_id, selected_for_facebook, selected_for_instagram')
        .eq('user_id', user.id);
      const previous = (previousRows || []) as StoredDestination[];
      const destinations = buildDestinationRows(user.id, pages, previous);
      await admin.from('meta_destinations').delete().eq('user_id', user.id);
      const { error: destError } = await admin.from('meta_destinations').insert(destinations);
      if (destError) throw destError;
    }

    const { data: destRows, error: destReadError } = await admin
      .from('meta_destinations')
      .select('page_id, page_name, page_access_token, ig_user_id, ig_username, selected_for_facebook, selected_for_instagram')
      .eq('user_id', user.id);
    if (destReadError) throw destReadError;
    const destinations = destRows || [];

    const facebookDest = destinations.find((row) => row.selected_for_facebook);
    const instagramDest = destinations.find((row) => row.selected_for_instagram && row.ig_user_id);

    const results: Record<string, PlatformResult> = {};

    if (platforms.includes('facebook')) {
      if (!facebookDest) {
        results.facebook = { ok: false, error: 'Δεν έχει επιλεγεί Facebook Page.' };
      } else {
        try {
          const published = await publishFacebookPost({
            pageId: facebookDest.page_id,
            pageAccessToken: facebookDest.page_access_token,
            caption,
            imageUrl,
          });
          results.facebook = { ok: true, media_id: published.media_id, permalink: published.permalink };
          await admin.from('meta_publishes').insert({
            user_id: user.id,
            item_id: itemId,
            platform: 'facebook',
            page_id: facebookDest.page_id,
            media_id: published.media_id,
            permalink: published.permalink,
            caption,
            image_url: imageUrl,
            status: 'published',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Αποτυχία Facebook.';
          results.facebook = { ok: false, error: message };
          await admin.from('meta_publishes').insert({
            user_id: user.id,
            item_id: itemId,
            platform: 'facebook',
            page_id: facebookDest.page_id,
            caption,
            image_url: imageUrl,
            status: 'error',
            error: message,
          });
        }
      }
    }

    if (platforms.includes('instagram')) {
      if (!instagramDest?.ig_user_id) {
        results.instagram = { ok: false, error: 'Δεν έχει επιλεγεί Instagram Professional.' };
      } else {
        try {
          const published = await publishInstagramImage({
            igUserId: instagramDest.ig_user_id,
            pageAccessToken: instagramDest.page_access_token,
            caption,
            imageUrl: imageUrl as string,
          });
          results.instagram = { ok: true, media_id: published.media_id, permalink: published.permalink };
          await admin.from('meta_publishes').insert({
            user_id: user.id,
            item_id: itemId,
            platform: 'instagram',
            page_id: instagramDest.page_id,
            ig_user_id: instagramDest.ig_user_id,
            media_id: published.media_id,
            permalink: published.permalink,
            caption,
            image_url: imageUrl,
            status: 'published',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Αποτυχία Instagram.';
          results.instagram = { ok: false, error: message };
          await admin.from('meta_publishes').insert({
            user_id: user.id,
            item_id: itemId,
            platform: 'instagram',
            page_id: instagramDest.page_id,
            ig_user_id: instagramDest.ig_user_id,
            caption,
            image_url: imageUrl,
            status: 'error',
            error: message,
          });
        }
      }
    }

    const anyOk = Object.values(results).some((row) => row.ok);
    if (!anyOk) {
      const firstError = Object.values(results).find((row) => row.error)?.error;
      return errorResponse(firstError || 'Αποτυχία δημοσίευσης.', 400);
    }

    return jsonResponse({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία δημοσίευσης Meta';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
