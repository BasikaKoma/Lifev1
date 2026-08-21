-- Unified health metrics (weight, sleep, activity, etc.) from all sources
-- Supabase Dashboard → SQL Editor (safe to re-run)

create table if not exists health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  metric_type text not null,
  value numeric,
  unit text,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (user_id, day, metric_type, source)
);

create index if not exists health_metrics_user_day_idx
  on health_metrics (user_id, day desc);

create index if not exists health_metrics_user_type_idx
  on health_metrics (user_id, metric_type, day desc);

alter table health_metrics enable row level security;

drop policy if exists "health_metrics_select_own" on health_metrics;
create policy "health_metrics_select_own" on health_metrics
  for select using (auth.uid() = user_id);

drop policy if exists "health_metrics_insert_own" on health_metrics;
create policy "health_metrics_insert_own" on health_metrics
  for insert with check (auth.uid() = user_id);

drop policy if exists "health_metrics_update_own" on health_metrics;
create policy "health_metrics_update_own" on health_metrics
  for update using (auth.uid() = user_id);

drop policy if exists "health_metrics_delete_own" on health_metrics;
create policy "health_metrics_delete_own" on health_metrics
  for delete using (auth.uid() = user_id);

-- Realtime intentionally omitted: health data refreshes on focus in the app.

-- User body profile for QN scale handshake
alter table profiles add column if not exists height_cm numeric;
alter table profiles add column if not exists birthdate date;
alter table profiles add column if not exists sex text;

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
