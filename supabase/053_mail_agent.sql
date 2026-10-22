-- Mail agent, phase 1 (needs 040–043 and 047). Run this before deploying mail-agent / mail-sync.
-- Each hour 08:00–20:00 Athens the mail-agent function syncs Inbox + Archive from a cursor,
-- sorts new mail into reply / action / info / ignore with a one-line reason, and pushes the
-- "reply" ones. Every run is kept for the Agents tab. The agent never sends or deletes mail.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

-- 1. More of each message. Zoho ids stay text: they pass 2^53.
alter table public.mail_messages
  add column if not exists folder_id text,
  add column if not exists folder text,
  add column if not exists to_addr text not null default '',
  add column if not exists cc_addr text not null default '',
  add column if not exists has_attachment boolean not null default false,
  -- Plain text, first 8,000 characters; filled only for mail the agent sorts.
  add column if not exists body_text text;

-- 2. Where the last sync stopped, per folder:
--    {"<folderId>": {"receivedTime": "1729580000000", "messageId": "1729580000000100001"}}
alter table public.mail_connections
  add column if not exists sync_cursor jsonb not null default '{}'::jsonb;

-- 3. Agents: one row per agent and mailbox (kind 'mail', ref = the mailbox connection_key).
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('mail')),
  ref text not null default '',
  name text not null default '',
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

alter table public.agents enable row level security;

drop policy if exists "agents_select_own" on public.agents;
create policy "agents_select_own" on public.agents
  for select using (auth.uid() = user_id);

-- 4. Runs: one row per run, written by the function (service role); the app only reads.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- {"fetched": 12, "new": 5, "reply": 1, "action": 1, "info": 2, "ignore": 1}
  counts jsonb not null default '{}'::jsonb,
  summary text not null default '',
  error text,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0
);

create index if not exists agent_runs_agent_started_idx on public.agent_runs (agent_id, started_at desc);
create index if not exists agent_runs_user_started_idx on public.agent_runs (user_id, started_at desc);
-- At most one running run per agent, so the cron and "Τρέξε τώρα" never overlap.
create unique index if not exists agent_runs_one_running_idx on public.agent_runs (agent_id) where status = 'running';

alter table public.agent_runs enable row level security;

drop policy if exists "agent_runs_select_own" on public.agent_runs;
create policy "agent_runs_select_own" on public.agent_runs
  for select using (auth.uid() = user_id);

-- 5. What a run did besides sorting: pushes, skipped mail, errors.
create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('sync', 'push', 'skip', 'error')),
  ref text not null default '',
  title text not null default '',
  detail jsonb not null default '{}'::jsonb
);

create index if not exists agent_events_run_idx on public.agent_events (run_id, at);

alter table public.agent_events enable row level security;

drop policy if exists "agent_events_select_own" on public.agent_events;
create policy "agent_events_select_own" on public.agent_events
  for select using (auth.uid() = user_id);

-- 6. Triage: one row per sorted message.
--    reply = 🔴 needs an answer · action = 🟠 documents / payment / signature
--    info = 🔵 to know · ignore = ⚪ nothing to do
create table if not exists public.mail_triage (
  message_id uuid primary key references public.mail_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references public.agent_runs (id) on delete set null,
  category text not null check (category in ('reply', 'action', 'info', 'ignore')),
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  model text,
  -- Phase 2: the user changed the category.
  corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mail_triage_user_open_idx on public.mail_triage (user_id, status, category);
create index if not exists mail_triage_run_idx on public.mail_triage (run_id);

alter table public.mail_triage enable row level security;

drop policy if exists "mail_triage_select_own" on public.mail_triage;
create policy "mail_triage_select_own" on public.mail_triage
  for select using (auth.uid() = user_id);

-- 7. The one write the app makes in phase 1: switch an agent on or off.
create or replace function public.set_my_agent_enabled(p_agent_id uuid, p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.agents
  set enabled = p_enabled, updated_at = now()
  where id = p_agent_id and user_id = auth.uid();
$$;

revoke all on function public.set_my_agent_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_my_agent_enabled(uuid, boolean) to authenticated;

-- 8. The Agents tab updates live when a run starts or finishes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_runs'
  ) then
    alter publication supabase_realtime add table public.agent_runs;
  end if;
end $$;

-- 9. Hourly at :05. UTC 05–18 covers 08:00–20:00 Athens in summer and winter; the function
--    skips any hour outside that window. Reuses the assistant cron secret (041).
create or replace function public.trigger_mail_agent()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cron_secret text;
begin
  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'assistant_daily_cron_secret';

  if cron_secret is null or cron_secret = '' then
    raise warning 'assistant_daily_cron_secret missing from vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/mail-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;

revoke all on function public.trigger_mail_agent() from public, anon, authenticated;
grant execute on function public.trigger_mail_agent() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'mail-agent-hourly';

select cron.schedule(
  'mail-agent-hourly',
  '5 5-18 * * *',
  'select public.trigger_mail_agent();'
);
