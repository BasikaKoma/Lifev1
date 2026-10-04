import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { accessTokenForUser, parseEmailAddress, parseProjectId, sendMailMessage } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject || '').trim().slice(0, 200);
    const text = String(body?.body || '').trim().slice(0, 20000);
    const gmailId = String(body?.gmailId || '').trim();
    const projectTitle = String(body?.projectTitle || '').trim();
    let projectId = parseProjectId(body?.projectId ?? body?.project_id);
    let to = parseEmailAddress(String(body?.to || ''));
    if (!subject || !text) return errorResponse('Subject and body are required');

    const admin = getServiceClient();
    let threadId: string | null = null;
    let inReplyTo: string | null = null;
    if (gmailId) {
      const { data: message, error } = await admin
        .from('mail_messages')
        .select('from_addr, thread_id, message_id_header, project_id')
        .eq('user_id', user.id)
        .eq('gmail_id', gmailId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!message) return errorResponse('Message not found', 404);
      projectId = message.project_id || null;
      threadId = message.thread_id || null;
      inReplyTo = message.message_id_header || null;
      if (!to) to = parseEmailAddress(message.from_addr || '');
    }
    if (!to) return errorResponse('Recipient is required');
    if (!projectId && projectTitle) {
      const { data: project, error: projectError } = await admin
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .ilike('title', projectTitle)
        .limit(1)
        .maybeSingle();
      if (projectError) throw projectError;
      projectId = project?.id || null;
    }

    const session = await accessTokenForUser(admin, user.id, projectId);
    await sendMailMessage(session, { to, subject, body: text, threadId, inReplyTo, messageId: gmailId || null });
    return jsonResponse({ ok: true, to, subject });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail send failed';
    return errorResponse(message, message === 'Missing authorization' ? 401 : 500);
  }
});
