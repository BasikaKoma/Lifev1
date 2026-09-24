import { getSupabaseForAssistant, invokeAssistantFunction } from './invoke';

export function getMailReturnUrl() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return 'lifev1://mail-callback?success=1';
  }
  const configured = import.meta.env.VITE_APP_URL?.trim();
  const origin = configured || window.location.origin;
  const url = new URL(origin);
  url.searchParams.set('mail', 'connected');
  return url.toString();
}

export function openMailAuthorizeUrl(url) {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    import('@capacitor/browser').then(({ Browser }) => {
      Browser.open({ url });
    }).catch(() => {
      window.location.href = url;
    });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function startMailConnect() {
  const payload = await invokeAssistantFunction('mail-oauth-start', { return_to: getMailReturnUrl() });
  if (payload?.url) openMailAuthorizeUrl(payload.url);
  return payload;
}

export async function syncMail() {
  return invokeAssistantFunction('mail-sync', {});
}

export async function sendMail({ gmailId, to, subject, body }) {
  return invokeAssistantFunction('mail-send', {
    gmailId: gmailId || '',
    to: to || '',
    subject,
    body,
  });
}

export async function getMailStatus() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase.rpc('get_my_mail_status');
  if (error) throw error;
  return data;
}

export async function disconnectMail() {
  const supabase = getSupabaseForAssistant();
  const { error } = await supabase.rpc('disconnect_my_mail');
  if (error) throw error;
  return { ok: true };
}

export async function listMailMessages({ urgentOnly = false, limit = 20 } = {}) {
  const supabase = getSupabaseForAssistant();
  let query = supabase
    .from('mail_messages')
    .select('gmail_id, from_addr, subject, snippet, received_at, unread, urgent')
    .order('received_at', { ascending: false })
    .limit(limit);
  if (urgentOnly) query = query.eq('urgent', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
