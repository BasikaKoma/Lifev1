import { getServiceClient } from './supabase.ts';
import { listMailSessions, syncMailbox } from './mail.ts';
import { ERP_DOMAINS, fetchErpDomain } from './erp.ts';
import {
  isSymphonConnection,
  SYMPHON_CONNECTION_COLUMNS,
  syncSymphonSales,
  type SymphonConnection,
} from './symphon.ts';

function athensToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date());
}

type ItemRow = {
  id: string;
  source: string;
  source_ref: string;
  status: string;
};

function keyOf(source: string, sourceRef: string) {
  return `${source}:${sourceRef}`;
}

async function ensureItem(
  admin: { from: (table: string) => any },
  userId: string,
  existing: Map<string, ItemRow>,
  item: { title: string; body?: string; dueOn: string; source: string; sourceRef: string; level?: string },
) {
  const key = keyOf(item.source, item.sourceRef);
  if (existing.has(key)) return false;
  const { error } = await admin.from('open_items').insert({
    user_id: userId,
    title: item.title.slice(0, 180),
    body: (item.body || '').slice(0, 500),
    due_on: item.dueOn,
    level: item.level === 'business' ? 'business' : 'human',
    source: item.source,
    source_ref: item.sourceRef,
    status: 'open',
  });
  if (error) throw error;
  existing.set(key, { id: '', source: item.source, source_ref: item.sourceRef, status: 'open' });
  return true;
}

async function markDone(admin: { from: (table: string) => any }, row: ItemRow) {
  if (!row.id || row.status !== 'open') return;
  await admin.from('open_items').update({ status: 'done' }).eq('id', row.id);
  row.status = 'done';
}

// Same window and rules as buildOpenRecords in src/lib/assistant/openItems.js, so the app and
// the morning pull write identical Lifeline records. Plan blocks come from path_state.
const OPEN_WINDOW_DAYS = 14;
const RECORD_LIMIT = 40;

type RecordEntry = { id: string; title: string; source: string };
type PathBlock = { id?: unknown; title?: unknown; date?: unknown; status?: unknown };

function shiftIsoDate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function athensDayOf(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(date);
}

function byId(a: RecordEntry, b: RecordEntry) {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function recordSignature(record: { done?: RecordEntry[]; missed?: RecordEntry[] } | null | undefined) {
  const line = (list: RecordEntry[] | undefined) => (Array.isArray(list) ? list : [])
    .map((item) => `${item?.id || ''}|${String(item?.title || '').trim()}|${item?.source || ''}`)
    .sort()
    .join('\n');
  return `${line(record?.done)}\n--\n${line(record?.missed)}`;
}

async function writeOpenRecords(
  admin: { from: (table: string) => any },
  userId: string,
  blocks: PathBlock[],
) {
  const { data: line } = await admin.from('lifelines').select('lifeline_days').eq('user_id', userId).maybeSingle();
  if (!line?.lifeline_days || typeof line.lifeline_days !== 'object') return;
  const { data: rows } = await admin
    .from('open_items')
    .select('id, title, source, status, due_on, created_at')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .neq('source', 'day');
  const today = athensToday();
  const grouped = new Map<string, { done: RecordEntry[]; missed: RecordEntry[] }>();
  for (let offset = OPEN_WINDOW_DAYS; offset >= 0; offset -= 1) {
    grouped.set(shiftIsoDate(today, -offset), { done: [], missed: [] });
  }
  const add = (date: string, done: boolean, entry: RecordEntry) => {
    const bucket = grouped.get(date);
    if (!bucket || !entry.title) return;
    (done ? bucket.done : bucket.missed).push(entry);
  };
  // Skipped blocks count as neither done nor missed; Planned and Moved are still open.
  for (const block of blocks) {
    const status = String(block?.status || 'Planned');
    if (status === 'Skipped') continue;
    add(String(block?.date || ''), status === 'Done', {
      id: String(block?.id || ''),
      title: String(block?.title || '').trim(),
      source: 'day',
    });
  }
  for (const row of rows || []) {
    add(row.due_on || athensDayOf(row.created_at), row.status === 'done', {
      id: String(row.id),
      title: String(row.title || '').trim(),
      source: String(row.source || ''),
    });
  }
  const days = { ...line.lifeline_days };
  let changed = false;
  for (const [date, record] of grouped) {
    record.done = record.done.sort(byId).slice(0, RECORD_LIMIT);
    record.missed = record.missed.sort(byId).slice(0, RECORD_LIMIT);
    const prev = days[date] && typeof days[date] === 'object' ? days[date] : null;
    if (recordSignature(prev?.openRecord) === recordSignature(record)) continue;
    days[date] = { ...(prev || {}), openRecord: { ...record, updatedAt: new Date().toISOString() } };
    changed = true;
  }
  if (!changed) return;
  await admin.from('lifelines').update({ lifeline_days: days }).eq('user_id', userId);
}

export async function pullAssistantForUser(userId: string) {
  const admin = getServiceClient();
  const today = athensToday();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  let mailConnected = false;
  let erpConnected = false;
  let mailCount = 0;
  const erpDomains: string[] = [];
  let itemCount = 0;

  const sessions = await listMailSessions(admin, userId);
  if (sessions.length) {
    mailConnected = true;
    for (const session of sessions) {
      try {
        const synced = await syncMailbox(admin, userId, session);
        mailCount += synced.count || 0;
      } catch (err) {
        console.error('mail pull failed', err instanceof Error ? err.message : '');
      }
    }
  }

  const { data: erp } = await admin
    .from('erp_connections')
    .select(SYMPHON_CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  const erpRow = erp as SymphonConnection | null;
  if (erpRow && isSymphonConnection(erpRow)) {
    erpConnected = true;
    if (erpRow.org_id) {
      try {
        await syncSymphonSales(admin, erpRow);
        erpDomains.push('sales');
      } catch (err) {
        console.error('symphon sales failed', err instanceof Error ? err.message : '');
      }
    }
  } else if (erpRow?.base_url && erpRow?.api_key) {
    erpConnected = true;
    for (const domain of ERP_DOMAINS) {
      try {
        const data = await fetchErpDomain(erpRow.base_url, erpRow.api_key, domain);
        const { error } = await admin.from('erp_snapshots').upsert({
          user_id: userId,
          domain,
          payload: data,
          fetched_at: new Date().toISOString(),
        });
        if (!error) erpDomains.push(domain);
      } catch (err) {
        console.error(`erp ${domain} failed`, err instanceof Error ? err.message : '');
      }
    }
  }

  const { data: currentItems } = await admin
    .from('open_items')
    .select('id, source, source_ref, status')
    .eq('user_id', userId);
  const existing = new Map<string, ItemRow>();
  for (const row of (currentItems || []) as ItemRow[]) {
    existing.set(keyOf(row.source, row.source_ref || ''), row);
  }

  const { data: messages } = mailConnected
    ? await admin
      .from('mail_messages')
      .select('gmail_id, subject, snippet, unread, urgent')
      .eq('user_id', userId)
      .eq('urgent', true)
    : { data: [] };

  const unreadUrgent = new Set<string>();
  for (const message of messages || []) {
    if (!message.unread || !message.gmail_id) continue;
    unreadUrgent.add(message.gmail_id);
    const created = await ensureItem(admin, userId, existing, {
      title: message.subject || 'Επείγον mail',
      body: message.snippet || '',
      dueOn: today,
      source: 'mail',
      sourceRef: message.gmail_id,
    });
    if (created) itemCount += 1;
  }
  for (const row of existing.values()) {
    if (row.source === 'mail' && row.status === 'open' && row.source_ref && !unreadUrgent.has(row.source_ref)) {
      await markDone(admin, row);
    }
  }

  const { data: calls } = await admin
    .from('calls')
    .select('id, contact, purpose')
    .eq('user_id', userId)
    .eq('outcome', 'callback')
    .gte('called_at', since);
  for (const call of calls || []) {
    const created = await ensureItem(admin, userId, existing, {
      title: [call.contact, call.purpose].filter(Boolean).join(' — ') || 'Follow-up κλήσης',
      dueOn: today,
      source: 'call',
      sourceRef: call.id,
    });
    if (created) itemCount += 1;
  }

  // The weekly plan is read from Path directly; retire the open copies older pulls made of its blocks.
  await admin
    .from('open_items')
    .update({ status: 'deleted' })
    .eq('user_id', userId)
    .eq('source', 'day')
    .eq('status', 'open');

  const { data: path } = await admin.from('path_state').select('blocks').eq('user_id', userId).maybeSingle();
  const blocks = Array.isArray(path?.blocks) ? path.blocks as PathBlock[] : [];

  await writeOpenRecords(admin, userId, blocks);

  await admin.from('assistant_runs').upsert({
    user_id: userId,
    pulled_at: new Date().toISOString(),
    mail_connected: mailConnected,
    erp_connected: erpConnected,
    mail_count: mailCount,
    erp_count: erpDomains.length,
    item_count: itemCount,
  });

  return {
    mailConnected,
    erpConnected,
    mailCount,
    erpCount: erpDomains.length,
    itemCount,
  };
}

export async function pullAssistantForAll() {
  const admin = getServiceClient();
  const ids = new Set<string>();
  const tables = ['mail_connections', 'erp_connections', 'lifelines', 'path_state', 'calls'];
  for (const table of tables) {
    const { data } = await admin.from(table).select('user_id');
    for (const row of data || []) {
      if (row.user_id) ids.add(row.user_id);
    }
  }
  const results = [];
  for (const userId of ids) {
    try {
      results.push({ userId, ...(await pullAssistantForUser(userId)) });
    } catch (err) {
      results.push({ userId, error: err instanceof Error ? err.message : 'pull failed' });
    }
  }
  return { users: results.length, results };
}
