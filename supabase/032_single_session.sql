-- One active login per user across web, desktop, and Android.
-- Newest sign-in keeps the account; other clients sign out when this changes.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

alter table public.profiles
  add column if not exists active_session_id uuid;

comment on column public.profiles.active_session_id is
  'Auth session_id currently allowed to use the account. A newer login replaces this.';

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

notify pgrst, 'reload schema';
