import { hasElectronBrain } from '../../platform/brain';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { BUSINESS_DOMAINS, HUMAN_DOMAINS } from '../../brain/levels';
import { listOpenItems } from './openItems';
import { getMailStatus, listMailMessages } from './mail';
import { getErpStatus, listErpSnapshots } from './erp';
import { redactSecrets } from '../../brain/redact';

function compactItem(item) {
  return {
    id: item.id,
    title: item.title,
    dueOn: item.dueOn || null,
    level: item.level,
    source: item.source,
    sourceRef: item.sourceRef || null,
    body: String(item.body || '').slice(0, 180),
  };
}

async function recentCalls() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('calls')
    .select('id, contact, purpose, outcome, notes, called_at, direction')
    .gte('called_at', since)
    .order('called_at', { ascending: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    contact: row.contact || '',
    purpose: row.purpose || '',
    outcome: row.outcome || '',
    direction: row.direction || '',
    calledAt: row.called_at,
    notes: String(row.notes || '').slice(0, 160),
  }));
}

async function recentPayments() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('payment_records')
    .select('id, title, amount, counterparty, note, created_at')
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    amount: row.amount,
    counterparty: row.counterparty,
    note: String(row.note || '').slice(0, 160),
    createdAt: row.created_at,
    movedMoney: false,
  }));
}

export async function loadAssistantPack() {
  const [items, mail, erp, calls, payments] = await Promise.all([
    listOpenItems().catch(() => []),
    (async () => {
      try {
        const status = await getMailStatus();
        const messages = status?.connected ? await listMailMessages({ limit: 15 }) : [];
        return {
          connected: Boolean(status?.connected),
          email: status?.email || null,
          urgent: messages.filter((item) => item.urgent),
          recent: messages,
        };
      } catch {
        return { connected: false, email: null, urgent: [], recent: [] };
      }
    })(),
    (async () => {
      try {
        const status = await getErpStatus();
        const snapshots = status?.connected ? await listErpSnapshots() : [];
        const domains = {};
        for (const row of snapshots) domains[row.domain] = { fetchedAt: row.fetched_at, data: row.payload };
        return { connected: Boolean(status?.connected), label: status?.label || null, domains };
      } catch {
        return { connected: false, label: null, domains: {} };
      }
    })(),
    recentCalls(),
    recentPayments(),
  ]);

  return redactSecrets({
    computer: hasElectronBrain() ? 'act' : 'read',
    humanDomains: HUMAN_DOMAINS.map((item) => item.id),
    businessDomains: BUSINESS_DOMAINS.map((item) => item.id),
    openItems: items.filter((item) => item.status === 'open').slice(0, 30).map(compactItem),
    mail,
    erp,
    calls,
    payments,
    paymentNote: 'payment records are confirmed decisions. The app did not move money.',
  });
}
