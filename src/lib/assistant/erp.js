import { getSupabaseForAssistant, invokeAssistantFunction } from './invoke';

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
