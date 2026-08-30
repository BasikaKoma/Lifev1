-- Path: 90-day goals → weekly plan → time blocks → execution → measurements.
-- User-level (not a project). Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists path_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null default '{}'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  templates jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table path_state enable row level security;

drop policy if exists "path_state_select_own" on path_state;
create policy "path_state_select_own" on path_state
  for select using (auth.uid() = user_id);

drop policy if exists "path_state_insert_own" on path_state;
create policy "path_state_insert_own" on path_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "path_state_update_own" on path_state;
create policy "path_state_update_own" on path_state
  for update using (auth.uid() = user_id);

drop policy if exists "path_state_delete_own" on path_state;
create policy "path_state_delete_own" on path_state
  for delete using (auth.uid() = user_id);

create or replace function set_path_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists path_state_set_updated_at on path_state;
create trigger path_state_set_updated_at
  before update on path_state
  for each row execute function set_path_state_updated_at();
