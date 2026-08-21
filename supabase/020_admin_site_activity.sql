-- Admin role + site activity tracking (login / download events)

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists public.user_site_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  event_type text not null check (event_type in ('login', 'download')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_site_events_user_id_idx on public.user_site_events (user_id);
create index if not exists user_site_events_event_type_idx on public.user_site_events (event_type);
create index if not exists user_site_events_created_at_idx on public.user_site_events (created_at desc);

alter table public.user_site_events enable row level security;

drop policy if exists "user_site_events_insert_own" on public.user_site_events;
create policy "user_site_events_insert_own"
  on public.user_site_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_site_events_select_admin" on public.user_site_events;
create policy "user_site_events_select_admin"
  on public.user_site_events
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.log_site_event(
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_event_type not in ('login', 'download') then
    raise exception 'invalid event type';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.user_site_events (user_id, email, event_type, metadata)
  values (v_user_id, coalesce(v_email, ''), p_event_type, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.log_site_event(text, jsonb) from public;
grant execute on function public.log_site_event(text, jsonb) to authenticated;

create or replace function public.admin_get_user_activity()
returns table (
  user_id uuid,
  email text,
  registered_at timestamptz,
  last_login_at timestamptz,
  login_count bigint,
  last_download_at timestamptz,
  download_count bigint,
  has_downloaded boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    p.id,
    coalesce(p.email, u.email)::text,
    p.created_at,
    max(e.created_at) filter (where e.event_type = 'login'),
    count(e.id) filter (where e.event_type = 'login'),
    max(e.created_at) filter (where e.event_type = 'download'),
    count(e.id) filter (where e.event_type = 'download'),
    count(e.id) filter (where e.event_type = 'download') > 0
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_site_events e on e.user_id = p.id
  group by p.id, p.email, u.email, p.created_at
  order by coalesce(max(e.created_at), p.created_at) desc;
end;
$$;

revoke all on function public.admin_get_user_activity() from public;
grant execute on function public.admin_get_user_activity() to authenticated;

create or replace function public.admin_get_recent_events(p_limit integer default 50)
returns table (
  id uuid,
  email text,
  event_type text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    e.id,
    e.email,
    e.event_type,
    e.metadata,
    e.created_at
  from public.user_site_events e
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.admin_get_recent_events(integer) from public;
grant execute on function public.admin_get_recent_events(integer) to authenticated;

-- Grant admin role to primary account
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('basika.koma@gmail.com');
