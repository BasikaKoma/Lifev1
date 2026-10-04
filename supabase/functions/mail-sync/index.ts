import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { accessTokenForUser, listMailSessions, parseProjectId, syncMailbox } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const projectId = parseProjectId(body?.projectId ?? body?.project_id);
    const admin = getServiceClient();
    const sessions = projectId
      ? [await accessTokenForUser(admin, user.id, projectId)]
      : await listMailSessions(admin, user.id);
    if (!sessions.length) throw new Error('Mail is not connected');
    let count = 0;
    for (const session of sessions) {
      const result = await syncMailbox(admin, user.id, session);
      count += result.count || 0;
    }
    return jsonResponse({ ok: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail sync failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
