import { getServiceClient } from './supabase.ts';
import { accessTokenForUser, syncMailbox } from './mail.ts';
import { ERP_DOMAINS, fetchErpDomain } from './erp.ts';

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

async function writeOpenRecords(
  admin: { from: (table: string) => any },
  userId: string,
) {
  const { data: line } = await admin.from('lifelines').select('lifeline_days').eq('user_id', userId).maybeSingle();
  if (!line?.lifeline_days || typeof line.lifeline_days !== 'object') return;
  const { data: rows } = await admin
    .from('open_items')
    .select('id, title, source, status, due_on')
    .eq('user_id', userId)
    .neq('status', 'deleted');
  const days = { ...line.lifeline_days };
  const grouped = new Map<string, { done: Array<{ id: string; title: string; source: string }>; missed: Array<{ id: string; title: string; source: string }> }>();
  const today = athensToday();
  for (const row of rows || []) {
    const title = String(row.title || '').trim();
    if (!title) continue;
    const date = row.due_on || today;
    if (!grouped.has(date)) grouped.set(date, { done: [], missed: [] });
    const bucket = grouped.get(date)!;
    const compact = { id: String(row.id), title, source: String(row.source || '') };
    if (row.status === 'done') {
      if (bucket.done.length < 40) bucket.done.push(compact);
    } else if (row.status === 'open' && bucket.missed.length < 40) {
      bucket.missed.push(compact);
    }
  }
  let changed = false;
  for (const [date, record] of grouped) {
    record.done.sort((a, b) => a.id.localeCompare(b.id));
    record.missed.sort((a, b) => a.id.localeCompare(b.id));
    const prev = days[date] && typeof days[date] === 'object' ? days[date] : {};
    const prevRecord = prev.openRecord || {};
    const same = JSON.stringify(prevRecord.done || []) === JSON.stringify(record.done)
      && JSON.stringify(prevRecord.missed || []) === JSON.stringify(record.missed);
    if (same) continue;
    days[date] = { ...prev, openRecord: { ...record, updatedAt: new Date().toISOString() } };
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

  const { data: mailConn } = await admin.from('mail_connections').select('user_id').eq('user_id', userId).maybeSingle();
  if (mailConn) {
    mailConnected = true;
    try {
      const token = await accessTokenForUser(admin, userId);
      const synced = await syncMailbox(admin, userId, token);
      mailCount = synced.count || 0;
    } catch (err) {
      console.error('mail pull failed', err instanceof Error ? err.message : '');
    }
  }

  const { data: erp } = await admin
    .from('erp_connections')
    .select('base_url, api_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (erp?.base_url && erp?.api_key) {
    erpConnected = true;
    for (const domain of ERP_DOMAINS) {
      try {
        const data = await fetchErpDomain(erp.base_url, erp.api_key, domain);
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

  const { data: lifeline } = await admin.from('lifelines').select('lifeline_days').eq('user_id', userId).maybeSingle();
  const day = lifeline?.lifeline_days?.[today];
  const todos = Array.isArray(day?.todos) ? day.todos : [];
  const openTodoIds = new Set<string>();
  for (const todo of todos) {
    const id = String(todo?.id || '');
    const text = String(todo?.text || '').trim();
    if (!id || !text) continue;
    const sourceRef = `${today}:${id}`;
    if (todo.done === true) continue;
    openTodoIds.add(sourceRef);
    const created = await ensureItem(admin, userId, existing, {
      title: text,
      dueOn: today,
      source: 'day',
      sourceRef,
    });
    if (created) itemCount += 1;
  }
  for (const row of existing.values()) {
    if (row.source !== 'day' || row.status !== 'open' || !String(row.source_ref).startsWith(`${today}:`)) continue;
    if (!openTodoIds.has(row.source_ref) && !String(row.source_ref).startsWith(`${today}:path:`)) {
      const todoId = String(row.source_ref).slice(today.length + 1);
      const todo = todos.find((item: { id?: string }) => String(item?.id || '') === todoId);
      if (todo?.done === true) await markDone(admin, row);
    }
  }

  const { data: path } = await admin.from('path_state').select('blocks').eq('user_id', userId).maybeSingle();
  const blocks = Array.isArray(path?.blocks) ? path.blocks : [];
  const openBlockRefs = new Set<string>();
  for (const block of blocks) {
    if (block?.date !== today) continue;
    if (block.status === 'Done' || block.status === 'Skipped') continue;
    const id = String(block.id || '');
    const title = String(block.title || '').trim();
    if (!id || !title) continue;
    const sourceRef = `${today}:path:${id}`;
    openBlockRefs.add(sourceRef);
    const created = await ensureItem(admin, userId, existing, {
      title,
      dueOn: today,
      source: 'day',
      sourceRef,
    });
    if (created) itemCount += 1;
  }
  for (const row of existing.values()) {
    if (row.source !== 'day' || row.status !== 'open') continue;
    if (!String(row.source_ref).startsWith(`${today}:path:`)) continue;
    if (!openBlockRefs.has(row.source_ref)) await markDone(admin, row);
  }

  await writeOpenRecords(admin, userId);

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
