-- Integer revision for project/lifeline saves.
-- updated_at strings from REST and Realtime do not always round-trip,
-- so optimistic locking uses version instead when the column exists.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

alter table public.projects
  add column if not exists version bigint not null default 1;

alter table public.lifelines
  add column if not exists version bigint not null default 1;

create or replace function public.bump_content_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.bump_content_version();

drop trigger if exists lifelines_updated_at on public.lifelines;
create trigger lifelines_updated_at
  before update on public.lifelines
  for each row execute function public.bump_content_version();
