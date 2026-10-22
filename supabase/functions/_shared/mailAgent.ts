import { getServiceClient } from './supabase.ts';
import { accessTokenForUser, syncMailbox, type MailSession } from './mail.ts';
import { fetchZohoMessageText, FIRST_SYNC_DAYS } from './zohoMail.ts';
import {
  classifyMails,
  describeTriageError,
  TRIAGE_MODEL,
  triageConfigured,
  type TriageCategory,
  type TriageInput,
} from './triage.ts';

// The mail agent: sync a Zoho mailbox, sort the new mail, push the ones that need an answer, and
// keep every run for the Agents tab. It never sends, deletes, labels or moves mail.

type Admin = ReturnType<typeof getServiceClient>;
type Trigger = 'cron' | 'manual';

type ConnectionRow = {
  connection_key: string;
  project_id: string | null;
  provider: string | null;
  email: string | null;
};

type MessageRow = {
  id: string;
  gmail_id: string;
  folder_id: string | null;
  folder: string | null;
  from_addr: string;
  to_addr: string;
  cc_addr: string;
  subject: string;
  snippet: string;
  body_text: string | null;
  has_attachment: boolean;
  received_at: string | null;
};

const AGENT_HOURS = { from: 8, to: 20 };
const BATCH_SIZE = 10;
const MAX_PER_RUN = 40;
const BODY_CONCURRENCY = 4;
const RUN_STALE_MS = 10 * 60 * 1000;

export function athensHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
}

/** 08:00–20:59 Athens: the cron fires at :05, so this is the 08:05 to 20:05 runs. */
export function withinAgentHours(now = new Date()): boolean {
  const hour = athensHour(now);
  return hour >= AGENT_HOURS.from && hour <= AGENT_HOURS.to;
}

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return (match?.[1] || from).trim() || from;
}

async function ensureAgent(admin: Admin, userId: string, connection: ConnectionRow) {
  const { data, error } = await admin
    .from('agents')
    .upsert({
      user_id: userId,
      kind: 'mail',
      ref: connection.connection_key,
      name: connection.email || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,kind,ref' })
    .select('id, enabled')
    .single();
  if (error) throw error;
  return data as { id: string; enabled: boolean };
}

/** One running run per agent (a unique index enforces it); a run stuck for 10′ is closed first. */
async function claimRun(admin: Admin, userId: string, agentId: string, trigger: Trigger): Promise<string | null> {
  const now = new Date();
  await admin
    .from('agent_runs')
    .update({ status: 'error', error: 'Stopped without finishing', finished_at: now.toISOString() })
    .eq('agent_id', agentId)
    .eq('status', 'running')
    .lt('started_at', new Date(now.getTime() - RUN_STALE_MS).toISOString());
  const { data, error } = await admin
    .from('agent_runs')
    .insert({ user_id: userId, agent_id: agentId, trigger, model: TRIAGE_MODEL })
    .select('id')
    .single();
  if (error?.code === '23505') return null;
  if (error) throw error;
  return data.id as string;
}

async function addEvent(
  admin: Admin,
  run: { id: string; userId: string },
  kind: 'sync' | 'push' | 'skip' | 'error',
  title: string,
  detail: Record<string, unknown> = {},
  ref = '',
) {
  const { error } = await admin.from('agent_events').insert({
    run_id: run.id,
    user_id: run.userId,
    kind,
    ref,
    title: title.slice(0, 300),
    detail,
  });
  if (error) console.error('agent event failed', error.message);
}

/** Recent Inbox/Archive mail of this mailbox that has no triage row yet, newest first. */
async function untriagedMessages(admin: Admin, userId: string, connectionKey: string): Promise<MessageRow[]> {
  const since = new Date(Date.now() - FIRST_SYNC_DAYS * 86400000).toISOString();
  const { data: messages, error } = await admin
    .from('mail_messages')
    .select('id, gmail_id, folder_id, folder, from_addr, to_addr, cc_addr, subject, snippet, body_text, has_attachment, received_at')
    .eq('user_id', userId)
    .eq('connection_key', connectionKey)
    .in('folder', ['inbox', 'archive'])
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  // A message is triaged after it arrives, so its triage row is newer than `since` too.
  const { data: triaged, error: triageError } = await admin
    .from('mail_triage')
    .select('message_id')
    .eq('user_id', userId)
    .gte('created_at', since);
  if (triageError) throw triageError;
  const done = new Set((triaged || []).map((row: { message_id: string }) => row.message_id));
  return ((messages || []) as MessageRow[]).filter((message) => !done.has(message.id));
}

async function fillBodies(admin: Admin, session: MailSession, messages: MessageRow[]) {
  const missing = messages.filter((message) => !message.body_text && message.folder_id);
  for (let i = 0; i < missing.length; i += BODY_CONCURRENCY) {
    await Promise.all(missing.slice(i, i + BODY_CONCURRENCY).map(async (message) => {
      try {
        const text = await fetchZohoMessageText(session, message.folder_id!, message.gmail_id);
        message.body_text = text;
        await admin.from('mail_messages').update({ body_text: text }).eq('id', message.id);
      } catch (err) {
        // The summary from the list is enough to sort on.
        console.error('mail body failed', err instanceof Error ? err.message : '');
      }
    }));
  }
}

function triageInput(message: MessageRow): TriageInput {
  return {
    id: message.id,
    from: message.from_addr,
    to: message.to_addr,
    cc: message.cc_addr,
    subject: message.subject,
    receivedAt: message.received_at,
    folder: message.folder,
    hasAttachment: message.has_attachment,
    text: message.body_text || message.snippet,
  };
}

async function pushAllowed(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin.from('push_settings').select('settings').eq('user_id', userId).maybeSingle();
  const settings = (data?.settings || {}) as Record<string, unknown>;
  // Same defaults as the app (src/lib/push/settings.js): on once notifications are enabled.
  return settings.enabled === true && settings.mailAgent !== false;
}

async function runForMailbox(admin: Admin, userId: string, connection: ConnectionRow, trigger: Trigger) {
  const agent = await ensureAgent(admin, userId, connection);
  if (!agent.enabled && trigger === 'cron') {
    return { connectionKey: connection.connection_key, skipped: 'disabled' };
  }
  const runId = await claimRun(admin, userId, agent.id, trigger);
  if (!runId) return { connectionKey: connection.connection_key, skipped: 'busy' };
  const run = { id: runId, userId };

  const counts: Record<string, number> = { synced: 0, new: 0, sorted: 0, waiting: 0, reply: 0, action: 0, info: 0, ignore: 0 };
  const errors: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let fatal: string | null = null;

  try {
    const session = await accessTokenForUser(admin, userId, connection.project_id);
    const synced = await syncMailbox(admin, userId, session);
    counts.synced = synced.count || 0;
    counts.new = 'newCount' in synced ? Number(synced.newCount) || 0 : 0;
    await addEvent(admin, run, 'sync', `Συγχρονισμός: ${counts.new} νέα`, { synced: counts.synced, new: counts.new });

    const pending = await untriagedMessages(admin, userId, connection.connection_key);
    const picked = pending.slice(0, MAX_PER_RUN);
    counts.waiting = pending.length - picked.length;

    if (picked.length && !triageConfigured()) {
      fatal = 'ANTHROPIC_API_KEY is not configured on the server.';
    } else if (picked.length) {
      await fillBodies(admin, session, picked);
      const sortedReplies: MessageRow[] = [];
      for (let i = 0; i < picked.length; i += BATCH_SIZE) {
        const batch = picked.slice(i, i + BATCH_SIZE);
        try {
          const outcome = await classifyMails(batch.map(triageInput), connection.email);
          tokensIn += outcome.tokensIn;
          tokensOut += outcome.tokensOut;
          if (outcome.results.length) {
            const { error } = await admin.from('mail_triage').upsert(outcome.results.map((result) => ({
              message_id: result.id,
              user_id: userId,
              run_id: runId,
              category: result.category,
              reason: result.reason,
              model: TRIAGE_MODEL,
            })), { onConflict: 'message_id', ignoreDuplicates: true });
            if (error) throw error;
          }
          for (const result of outcome.results) {
            counts.sorted += 1;
            counts[result.category as TriageCategory] += 1;
            if (result.category === 'reply') {
              const message = batch.find((item) => item.id === result.id);
              if (message) sortedReplies.push(message);
            }
          }
          const missed = batch.length - outcome.results.length;
          if (missed > 0) {
            counts.waiting += missed;
            await addEvent(admin, run, 'skip', `${missed} mail έμειναν χωρίς κατηγορία· ξανά στην επόμενη εκτέλεση`);
          }
        } catch (err) {
          const { message, stop } = describeTriageError(err);
          errors.push(message);
          counts.waiting += batch.length;
          await addEvent(admin, run, 'error', message);
          if (stop) {
            counts.waiting += picked.length - (i + batch.length);
            break;
          }
        }
      }

      if (sortedReplies.length && await pushAllowed(admin, userId)) {
        const title = sortedReplies.length === 1 ? '1 mail θέλει απάντηση' : `${sortedReplies.length} mail θέλουν απάντηση`;
        const body = sortedReplies
          .slice(0, 3)
          .map((message) => `${senderName(message.from_addr)} — ${message.subject || '(χωρίς θέμα)'}`)
          .join(' · ')
          .slice(0, 180);
        const { error } = await admin.from('push_schedule').insert({
          user_id: userId,
          key: `mail-agent:${runId}`,
          kind: 'mail',
          fire_at: new Date().toISOString(),
          title,
          body,
          url: '/agents',
        });
        if (error) {
          errors.push(`Push failed: ${error.message}`);
          await addEvent(admin, run, 'error', `Push failed: ${error.message}`);
        } else {
          await addEvent(admin, run, 'push', title, { body });
        }
      }
    }
  } catch (err) {
    fatal = err instanceof Error ? err.message.slice(0, 300) : 'Run failed';
  }

  if (fatal) await addEvent(admin, run, 'error', fatal);
  const summary = [
    counts.sorted
      ? `${counts.sorted} νέα · ${counts.reply} 🔴 · ${counts.action} 🟠 · ${counts.info} 🔵 · ${counts.ignore} ⚪`
      : counts.waiting ? 'Δεν κατατάχθηκε κανένα mail' : 'Κανένα νέο mail για κατάταξη',
    counts.waiting ? `${counts.waiting} στην επόμενη` : '',
  ].filter(Boolean).join(' · ');
  const status = fatal ? 'error' : errors.length ? (counts.sorted ? 'partial' : 'error') : 'ok';
  const { error: finishError } = await admin.from('agent_runs').update({
    status,
    finished_at: new Date().toISOString(),
    counts,
    summary: fatal ? `Σφάλμα: ${fatal}`.slice(0, 300) : summary,
    error: fatal || errors[0] || null,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  }).eq('id', runId);
  if (finishError) console.error('agent run finish failed', finishError.message);
  return { connectionKey: connection.connection_key, runId, status, summary };
}

async function zohoConnections(admin: Admin, userId: string, connectionKey: string | null): Promise<ConnectionRow[]> {
  let query = admin
    .from('mail_connections')
    .select('connection_key, project_id, provider, email')
    .eq('user_id', userId)
    .eq('provider', 'zoho');
  if (connectionKey) query = query.eq('connection_key', connectionKey);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ConnectionRow[];
}

/** One user's Zoho mailboxes (or just one of them), one after another. */
export async function runMailAgent({ userId, trigger, connectionKey = null }: {
  userId: string;
  trigger: Trigger;
  connectionKey?: string | null;
}) {
  const admin = getServiceClient();
  const connections = await zohoConnections(admin, userId, connectionKey);
  if (!connections.length) throw new Error('No Zoho mailbox is connected');
  const runs = [];
  for (const connection of connections) runs.push(await runForMailbox(admin, userId, connection, trigger));
  return runs;
}

/** Cron: every user with a Zoho mailbox. Returns counts only. */
export async function runMailAgentForAll() {
  const admin = getServiceClient();
  const { data, error } = await admin.from('mail_connections').select('user_id').eq('provider', 'zoho');
  if (error) throw error;
  const userIds = [...new Set((data || []).map((row: { user_id: string }) => row.user_id))];
  const tally: Record<string, number> = { users: userIds.length, ok: 0, partial: 0, error: 0, skipped: 0 };
  for (const userId of userIds) {
    try {
      for (const run of await runMailAgent({ userId, trigger: 'cron' })) {
        const key = 'status' in run ? String(run.status) : 'skipped';
        tally[key] = (tally[key] || 0) + 1;
      }
    } catch (err) {
      tally.error += 1;
      console.error('mail agent failed', err instanceof Error ? err.message : '');
    }
  }
  return tally;
}
