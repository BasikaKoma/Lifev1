-- Oura Ring integration: OAuth tokens (server-only) + daily metrics for Self view
-- Supabase Dashboard → SQL Editor (safe to re-run)

-- Pending OAuth states (Edge Functions only — no client policies)
create table if not exists oura_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists oura_oauth_states_expires_idx on oura_oauth_states (expires_at);

alter table oura_oauth_states enable row level security;

-- Tokens — never exposed to the client (Edge Functions use service role)
create table if not exists oura_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table oura_connections enable row level security;

-- Public connection status (no tokens)
create or replace view oura_connection_status
with (security_invoker = true) as
select
  user_id,
  connected_at,
  last_synced_at,
  scopes,
  (expires_at > now()) as token_valid
from oura_connections;

grant select on oura_connection_status to authenticated;

-- Daily metrics synced from Oura API
create table if not exists oura_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sleep_score int,
  readiness_score int,
  activity_score int,
  active_calories int,
  total_calories int,
  target_calories int,
  steps int,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists oura_daily_metrics_user_day_idx
  on oura_daily_metrics (user_id, day desc);

alter table oura_daily_metrics enable row level security;

drop policy if exists "oura_metrics_select_own" on oura_daily_metrics;
create policy "oura_metrics_select_own" on oura_daily_metrics
  for select using (auth.uid() = user_id);
