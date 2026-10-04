import { getSupabaseForAssistant, invokeAssistantFunction } from './invoke';

export function getErpReturnUrl() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return 'lifev1://erp-callback?erp=connected';
  }
  const configured = import.meta.env.VITE_APP_URL?.trim();
  const origin = configured || window.location.origin;
  const url = new URL(origin);
  url.searchParams.set('erp', 'return');
  return url.toString();
}

export function openErpAuthorizeUrl(url) {
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

export async function startSymphonConnect() {
  const payload = await invokeAssistantFunction('erp-oauth-start', { return_to: getErpReturnUrl() });
  if (payload?.url) openErpAuthorizeUrl(payload.url);
  return payload;
}

export async function listSymphonOrgs() {
  const payload = await invokeAssistantFunction('erp-orgs', { action: 'list' });
  return Array.isArray(payload?.orgs) ? payload.orgs : [];
}

export async function selectSymphonOrg(orgId) {
  return invokeAssistantFunction('erp-orgs', { action: 'select', orgId });
}

export const ERP_DOMAINS = [
  'cash',
  'customers',
  'sales',
  'prices',
  'operations',
  'people',
  'suppliers',
  'documents',
];

export async function connectErp({ baseUrl, apiKey, label }) {
  return invokeAssistantFunction('erp-connect', { baseUrl, apiKey, label: label || '' });
}

export async function queryErp(domain) {
  if (!ERP_DOMAINS.includes(domain)) throw new Error('Unknown ERP domain');
  return invokeAssistantFunction('erp-query', { domain });
}

export async function getErpStatus() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase.rpc('get_my_erp_status');
  if (error) throw error;
  return data;
}

export async function disconnectErp() {
  const supabase = getSupabaseForAssistant();
  const { error } = await supabase.rpc('disconnect_my_erp');
  if (error) throw error;
  return { ok: true };
}

export async function listErpSnapshots() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase
    .from('erp_snapshots')
    .select('domain, payload, fetched_at');
  if (error) throw error;
  return data || [];
}
