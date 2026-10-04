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

export const ZOHO_REGIONS = [
  { id: 'eu', label: 'Ευρώπη (zoho.eu)' },
  { id: 'us', label: 'ΗΠΑ (zoho.com)' },
  { id: 'in', label: 'Ινδία (zoho.in)' },
  { id: 'au', label: 'Αυστραλία (zoho.com.au)' },
];

export async function startMailConnect({ provider = 'zoho', region = 'eu', projectId = null } = {}) {
  const body = { return_to: getMailReturnUrl(), provider };
  if (provider === 'zoho') body.region = region;
  if (projectId) body.projectId = projectId;
  const payload = await invokeAssistantFunction('mail-oauth-start', body);
  if (payload?.url) openMailAuthorizeUrl(payload.url);
  return payload;
}

export async function syncMail(projectId = null) {
  return invokeAssistantFunction('mail-sync', projectId ? { projectId } : {});
}

export async function sendMail({ gmailId, to, subject, body, projectId, projectTitle }) {
  return invokeAssistantFunction('mail-send', {
    gmailId: gmailId || '',
    to: to || '',
    subject,
    body,
    projectId: projectId || '',
    projectTitle: projectTitle || '',
  });
}

export async function getMailStatus() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase.rpc('get_my_mail_status');
  if (error) throw error;
  return data;
}

export async function listMailConnections() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase.rpc('list_my_mail_connections');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listMailProjects() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, is_lifeline')
    .order('title');
  if (error) throw error;
  return (data || []).filter((row) => row.is_lifeline !== true && row.id);
}

export async function assignMailToProject(projectId) {
  const supabase = getSupabaseForAssistant();
  const { error } = await supabase.rpc('assign_my_mail_to_project', { p_project_id: projectId });
  if (error) throw error;
  return { ok: true };
}

export async function disconnectMail(projectId = null) {
  const supabase = getSupabaseForAssistant();
  const args = projectId ? { p_project_id: projectId } : {};
  const { error } = await supabase.rpc('disconnect_my_mail', args);
  if (error) throw error;
  return { ok: true };
}

export async function listMailMessages({ urgentOnly = false, limit = 20, projectId = '' } = {}) {
  const supabase = getSupabaseForAssistant();
  let query = supabase
    .from('mail_messages')
    .select('gmail_id, from_addr, subject, snippet, received_at, unread, urgent, project_id')
    .order('received_at', { ascending: false })
    .limit(limit);
  if (urgentOnly) query = query.eq('urgent', true);
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
