-- One Zoho (or Gmail) mailbox per project.
-- Supabase Dashboard → SQL Editor (safe to re-run).
-- Existing mailbox with no project stays connection_key = 'account' until it is assigned.

alter table mail_connections add column if not exists id uuid default gen_random_uuid();
update mail_connections set id = gen_random_uuid() where id is null;
alter table mail_connections alter column id set not null;

do $$
declare
  pk_cols text;
begin
  select string_agg(a.attname, ',' order by k.ord)
  into pk_cols
  from pg_constraint c
  join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conrelid = 'public.mail_connections'::regclass
    and c.contype = 'p';

  if pk_cols = 'user_id' then
    alter table mail_connections drop constraint mail_connections_pkey;
    alter table mail_connections add primary key (id);
  end if;
end $$;

alter table mail_connections
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

alter table mail_connections add column if not exists connection_key text;
update mail_connections
  set connection_key = coalesce(project_id::text, 'account')
  where connection_key is null or connection_key = '';
alter table mail_connections alter column connection_key set default 'account';
alter table mail_connections alter column connection_key set not null;

create unique index if not exists mail_connections_user_connection_uidx
  on mail_connections (user_id, connection_key);

alter table mail_oauth_states add column if not exists project_id uuid;

alter table mail_messages
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

alter table mail_messages add column if not exists connection_key text;
update mail_messages
  set connection_key = coalesce(project_id::text, 'account')
  where connection_key is null or connection_key = '';
alter table mail_messages alter column connection_key set default 'account';
alter table mail_messages alter column connection_key set not null;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.mail_messages'::regclass
      and contype = 'u'
  loop
    execute format('alter table mail_messages drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists mail_messages_user_connection_gmail_uidx
  on mail_messages (user_id, connection_key, gmail_id);

create or replace function public.list_my_mail_connections()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select json_agg(json_build_object(
        'project_id', project_id,
        'email', email,
        'provider', provider,
        'connected_at', connected_at,
        'last_synced_at', last_synced_at
      ) order by email)
      from mail_connections
      where user_id = auth.uid()
    ),
    '[]'::json
  );
$$;

create or replace function public.get_my_mail_status()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select json_build_object(
        'connected', true,
        'provider', provider,
        'email', email,
        'project_id', project_id,
        'connected_at', connected_at,
        'last_synced_at', last_synced_at,
        'token_valid', expires_at > now()
      )
      from mail_connections
      where user_id = auth.uid()
      order by project_id nulls first, connected_at desc
      limit 1
    ),
    json_build_object(
      'connected', false,
      'provider', null,
      'email', null,
      'project_id', null,
      'connected_at', null,
      'last_synced_at', null,
      'token_valid', false
    )
  );
$$;

drop function if exists public.disconnect_my_mail();

create function public.disconnect_my_mail(p_project_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if p_project_id is null then
    v_key := 'account';
  else
    if not exists (
      select 1 from projects
      where id = p_project_id and user_id = auth.uid()
    ) then
      raise exception 'Project not found';
    end if;
    v_key := p_project_id::text;
  end if;
  delete from mail_messages where user_id = auth.uid() and connection_key = v_key;
  delete from mail_connections where user_id = auth.uid() and connection_key = v_key;
end;
$$;

create or replace function public.assign_my_mail_to_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_project_id::text;
begin
  if p_project_id is null or not exists (
    select 1 from projects
    where id = p_project_id
      and user_id = auth.uid()
      and coalesce(is_lifeline, false) = false
  ) then
    raise exception 'Project not found';
  end if;
  if exists (
    select 1 from mail_connections
    where user_id = auth.uid() and connection_key = v_key
  ) then
    raise exception 'This project already has mail';
  end if;
  if not exists (
    select 1 from mail_connections
    where user_id = auth.uid() and connection_key = 'account'
  ) then
    raise exception 'No unassigned mail';
  end if;
  update mail_messages
    set project_id = p_project_id,
        connection_key = v_key
    where user_id = auth.uid() and connection_key = 'account';
  update mail_connections
    set project_id = p_project_id,
        connection_key = v_key,
        updated_at = now()
    where user_id = auth.uid() and connection_key = 'account';
end;
$$;

grant execute on function public.list_my_mail_connections() to authenticated;
grant execute on function public.get_my_mail_status() to authenticated;
grant execute on function public.disconnect_my_mail(uuid) to authenticated;
grant execute on function public.assign_my_mail_to_project(uuid) to authenticated;
