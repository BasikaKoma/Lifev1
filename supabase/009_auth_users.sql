-- User accounts: profiles + per-user projects (run after schema.sql)
-- Supabase Dashboard → SQL Editor
-- Safe to re-run: drops existing policies before recreating them.

-- Profiles (one row per auth user)
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

-- Auto-create profile on signup
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

-- Tie projects to users
alter table projects add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists projects_user_updated_idx on projects (user_id, updated_at desc);

-- Replace open RLS with per-user access
drop policy if exists "projects_select" on projects;
drop policy if exists "projects_insert" on projects;
drop policy if exists "projects_update" on projects;
drop policy if exists "projects_delete" on projects;
drop policy if exists "projects_select_own" on projects;
drop policy if exists "projects_insert_own" on projects;
drop policy if exists "projects_update_own" on projects;
drop policy if exists "projects_delete_own" on projects;

create policy "projects_select_own" on projects
  for select using (auth.uid() = user_id);

create policy "projects_insert_own" on projects
  for insert with check (auth.uid() = user_id);

create policy "projects_update_own" on projects
  for update using (auth.uid() = user_id);

create policy "projects_delete_own" on projects
  for delete using (auth.uid() = user_id);
