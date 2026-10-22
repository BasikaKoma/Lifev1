import { getSupabaseForAssistant, invokeAssistantFunction } from './assistant/invoke';
import { listMailConnections } from './assistant/mail';

// Agents tab data (supabase/053_mail_agent.sql). The app only reads; the mail-agent function writes.

export const TRIAGE_META = {
  reply: { emoji: '🔴', label: 'Θέλει απάντηση' },
  action: { emoji: '🟠', label: 'Θέλει ενέργεια' },
  info: { emoji: '🔵', label: 'Ενημέρωση' },
  ignore: { emoji: '⚪', label: 'Αδιάφορο' },
};

export const TRIAGE_ORDER = ['reply', 'action', 'info', 'ignore'];

/** Same window as the server (supabase/functions/_shared/mailAgent.ts): :05 each hour, 08–20 Athens. */
const AGENT_HOURS = { from: 8, to: 20 };
const RUN_MINUTE = 5;

const RUN_COLUMNS = 'id, agent_id, trigger, status, started_at, finished_at, counts, summary, error, model, tokens_in, tokens_out';
const MESSAGE_COLUMNS = 'gmail_id, folder, from_addr, subject, snippet, received_at';

function athensHour(date) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
}

export function nextAgentRun(now = new Date()) {
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  if (candidate.getUTCMinutes() >= RUN_MINUTE) candidate.setUTCHours(candidate.getUTCHours() + 1);
  candidate.setUTCMinutes(RUN_MINUTE);
  for (let i = 0; i < 48; i += 1) {
    const hour = athensHour(candidate);
    if (hour >= AGENT_HOURS.from && hour <= AGENT_HOURS.to) return candidate;
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }
  return null;
}

/** Zoho mailboxes, each with its agent row once it has run. */
export async function listMailAgents() {
  const supabase = getSupabaseForAssistant();
  const [connections, agentsResult] = await Promise.all([
    listMailConnections(),
    supabase.from('agents').select('id, kind, ref, name, enabled, created_at').eq('kind', 'mail'),
  ]);
  if (agentsResult.error) throw agentsResult.error;
  const agents = agentsResult.data || [];
  const rows = connections
    .filter((connection) => connection.provider === 'zoho')
    .map((connection) => {
      const ref = connection.project_id || 'account';
      const agent = agents.find((item) => item.ref === ref) || null;
      return { ref, email: connection.email || agent?.name || '', agent };
    });
  // Agents whose mailbox was disconnected keep their history.
  for (const agent of agents) {
    if (!rows.some((row) => row.ref === agent.ref)) rows.push({ ref: agent.ref, email: agent.name, agent, disconnected: true });
  }
  return rows;
}

export async function listAgentRuns({ agentId = null, limit = 40 } = {}) {
  const supabase = getSupabaseForAssistant();
  let query = supabase.from('agent_runs').select(RUN_COLUMNS).order('started_at', { ascending: false }).limit(limit);
  if (agentId) query = query.eq('agent_id', agentId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getAgentRunReport(runId) {
  const supabase = getSupabaseForAssistant();
  const [events, triage] = await Promise.all([
    supabase.from('agent_events').select('id, at, kind, ref, title, detail').eq('run_id', runId).order('at'),
    supabase
      .from('mail_triage')
      .select(`message_id, category, reason, status, mail_messages(${MESSAGE_COLUMNS})`)
      .eq('run_id', runId),
  ]);
  if (events.error) throw events.error;
  if (triage.error) throw triage.error;
  return { events: events.data || [], triage: triage.data || [] };
}

/** Open 🔴 and 🟠 mail, newest first. */
export async function listOpenTriage({ limit = 40 } = {}) {
  const supabase = getSupabaseForAssistant();
  const { data, error } = await supabase
    .from('mail_triage')
    .select(`message_id, category, reason, status, created_at, mail_messages(${MESSAGE_COLUMNS})`)
    .eq('status', 'open')
    .in('category', ['reply', 'action'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function runMailAgentNow(connectionKey) {
  return invokeAssistantFunction('mail-agent', connectionKey ? { connectionKey } : {});
}

export async function setAgentEnabled(agentId, enabled) {
  const supabase = getSupabaseForAssistant();
  const { error } = await supabase.rpc('set_my_agent_enabled', { p_agent_id: agentId, p_enabled: enabled });
  if (error) throw error;
}

/** Calls back whenever one of the user's runs starts or finishes. */
export function subscribeAgentRuns(userId, onChange) {
  const supabase = getSupabaseForAssistant();
  const channel = supabase
    .channel(`agent-runs-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_runs', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Opens the mail in Zoho Mail on the web (EU data center). */
export function zohoMailUrl(message) {
  const folder = message?.folder === 'archive' ? 'archive' : 'inbox';
  return message?.gmail_id
    ? `https://mail.zoho.eu/zm/#mail/folder/${folder}/p/${encodeURIComponent(message.gmail_id)}`
    : 'https://mail.zoho.eu/zm/';
}
