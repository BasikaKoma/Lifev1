// Saves a DRAFT in the mailbox; it never sends. The name stays mail-send so a deploy replaces the old sender.
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { accessTokenForUser, createMailDraft, parseEmailAddress, parseProjectId } from '../_shared/mail.ts';

function replySubject(original: string): string {
  const subject = original.trim();
  if (!subject) return '';
  return /^(re|απ|aw|sv)\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let subject = String(body?.subject || '').trim().slice(0, 200);
    const text = String(body?.body || '').trim().slice(0, 20000);
    const gmailId = String(body?.gmailId || '').trim();
    const projectTitle = String(body?.projectTitle || '').trim();
    let projectId = parseProjectId(body?.projectId ?? body?.project_id);
    let to = parseEmailAddress(String(body?.to || ''));
    if (!text) return errorResponse('Body is required');

    const admin = getServiceClient();
    if (gmailId) {
      const { data: message, error } = await admin
        .from('mail_messages')
        .select('from_addr, subject, project_id')
        .eq('user_id', user.id)
        .eq('gmail_id', gmailId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!message) return errorResponse('Message not found', 404);
      projectId = message.project_id || null;
      // A reply goes back to the original sender; the caller cannot redirect it.
      to = parseEmailAddress(message.from_addr || '');
      subject = replySubject(message.subject || '') || subject;
    }
    if (!to) return errorResponse('Recipient is required');
    if (!subject) return errorResponse('Subject is required');
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
    await createMailDraft(session, { to, subject, body: text, replyToMessageId: gmailId || null });
    return jsonResponse({ ok: true, draft: true, to, subject });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail draft failed';
    const status = message === 'Missing authorization' || message === 'Invalid session' ? 401 : 500;
    return errorResponse(message, status);
  }
});
