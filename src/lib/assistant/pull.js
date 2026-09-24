import { getSupabaseForAssistant, invokeAssistantFunction } from './invoke';

export async function pullAssistantNow() {
  return invokeAssistantFunction('assistant-pull', {});
}

export async function getAssistantRun() {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase
    .from('assistant_runs')
    .select('pulled_at, mail_connected, erp_connected, mail_count, erp_count, item_count')
    .maybeSingle();
  if (error) return null;
  return data;
}
