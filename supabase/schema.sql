-- Run this in Supabase Dashboard → SQL Editor (FIRST TIME ONLY)
-- Project: fxdnbepmiphyzebqdkyf
--
-- If the table already exists, do NOT re-run this whole file.
-- Use supabase/007_roadmap_canvas.sql (columns) and supabase/009_auth_users.sql (accounts).

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null default 'My Business',
  stages jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  active_view text not null default 'projects',
  focus_mode boolean not null default false,
  selected_stage_id text,
  notes jsonb not null default '[]'::jsonb,
  backlog jsonb not null default '[]'::jsonb,
  canvas_connections jsonb not null default '[]'::jsonb,
  canvas_stickies jsonb not null default '[]'::jsonb,
  map_theme jsonb not null default '{}'::jsonb,
  brief jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_updated_at_idx on projects (updated_at desc);
create index if not exists projects_user_id_idx on projects (user_id);

alter table projects enable row level security;

-- Per-user access (requires auth — see 009_auth_users.sql for profiles + trigger)
drop policy if exists "projects_select_own" on projects;
drop policy if exists "projects_insert_own" on projects;
drop policy if exists "projects_update_own" on projects;
drop policy if exists "projects_delete_own" on projects;

create policy "projects_select_own" on projects for select using (auth.uid() = user_id);
create policy "projects_insert_own" on projects for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on projects for update using (auth.uid() = user_id);
create policy "projects_delete_own" on projects for delete using (auth.uid() = user_id);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();
