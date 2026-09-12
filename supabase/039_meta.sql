-- Meta (Facebook Page + Instagram Professional) connection for Personal Brand.
-- Tokens stay server-only. Clients read status via RPCs — never the token tables.
-- Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists meta_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists meta_oauth_states_expires_idx on meta_oauth_states (expires_at);

alter table meta_oauth_states enable row level security;

create table if not exists meta_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fb_user_id text not null,
  user_access_token text not null,
  user_token_expires_at timestamptz not null,
  scopes text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meta_connections enable row level security;

create table if not exists meta_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references meta_connections (user_id) on delete cascade,
  page_id text not null,
  page_name text not null default '',
  page_access_token text not null,
  ig_user_id text,
  ig_username text,
  selected_for_facebook boolean not null default false,
  selected_for_instagram boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_id)
);

create index if not exists meta_destinations_user_idx on meta_destinations (user_id);

create unique index if not exists meta_destinations_one_facebook
  on meta_destinations (user_id)
  where selected_for_facebook;

create unique index if not exists meta_destinations_one_instagram
  on meta_destinations (user_id)
  where selected_for_instagram;

alter table meta_destinations enable row level security;

create or replace function public.get_my_meta_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  conn public.meta_connections%rowtype;
  dests json;
  fb json;
  ig json;
  page_count int;
  ig_count int;
  fb_selected int;
begin
  select * into conn
  from public.meta_connections
  where user_id = auth.uid();

  if not found then
    return json_build_object(
      'connected', false,
      'connected_at', null,
      'token_valid', false,
      'expires_soon', false,
      'scopes', null,
      'fb_user_id', null,
      'needs_page_pick', false,
      'missing_instagram', false,
      'missing_pages', false,
      'facebook', null,
      'instagram', null,
      'destinations', '[]'::json
    );
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'page_id', d.page_id,
        'page_name', d.page_name,
        'ig_user_id', d.ig_user_id,
        'ig_username', d.ig_username,
        'selected_for_facebook', d.selected_for_facebook,
        'selected_for_instagram', d.selected_for_instagram
      )
      order by d.page_name
    ),
    '[]'::json
  )
  into dests
  from public.meta_destinations d
  where d.user_id = auth.uid();

  select json_build_object('page_id', page_id, 'page_name', page_name)
  into fb
  from public.meta_destinations
  where user_id = auth.uid() and selected_for_facebook
  limit 1;

  select json_build_object(
    'ig_user_id', ig_user_id,
    'ig_username', ig_username,
    'page_id', page_id,
    'page_name', page_name
  )
  into ig
  from public.meta_destinations
  where user_id = auth.uid()
    and selected_for_instagram
    and ig_user_id is not null
  limit 1;

  select count(*) into page_count
  from public.meta_destinations
  where user_id = auth.uid();

  select count(*) into ig_count
  from public.meta_destinations
  where user_id = auth.uid() and ig_user_id is not null;

  select count(*) into fb_selected
  from public.meta_destinations
  where user_id = auth.uid() and selected_for_facebook;

  return json_build_object(
    'connected', true,
    'connected_at', conn.connected_at,
    'token_valid', conn.user_token_expires_at > now(),
    'expires_soon', conn.user_token_expires_at < now() + interval '7 days',
    'scopes', conn.scopes,
    'fb_user_id', conn.fb_user_id,
    'needs_page_pick', page_count > 0 and fb_selected = 0,
    'missing_instagram', ig_count = 0,
    'missing_pages', page_count = 0,
    'facebook', fb,
    'instagram', ig,
    'destinations', dests
  );
end;
$$;

create or replace function public.set_my_meta_destinations(p_page_id text, p_ig_user_id text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_page_id is not null and btrim(p_page_id) <> '' then
    if not exists (
      select 1
      from public.meta_destinations
      where user_id = auth.uid() and page_id = p_page_id
    ) then
      raise exception 'Unknown Facebook Page';
    end if;

    update public.meta_destinations
    set selected_for_facebook = false, updated_at = now()
    where user_id = auth.uid() and selected_for_facebook;

    update public.meta_destinations
    set selected_for_facebook = true, updated_at = now()
    where user_id = auth.uid() and page_id = p_page_id;
  end if;

  if p_ig_user_id is null then
    null;
  elsif btrim(p_ig_user_id) = '' then
    update public.meta_destinations
    set selected_for_instagram = false, updated_at = now()
    where user_id = auth.uid() and selected_for_instagram;
  else
    if not exists (
      select 1
      from public.meta_destinations
      where user_id = auth.uid() and ig_user_id = p_ig_user_id
    ) then
      raise exception 'Unknown Instagram account';
    end if;

    update public.meta_destinations
    set selected_for_instagram = false, updated_at = now()
    where user_id = auth.uid() and selected_for_instagram;

    update public.meta_destinations
    set selected_for_instagram = true, updated_at = now()
    where user_id = auth.uid() and ig_user_id = p_ig_user_id;
  end if;

  return public.get_my_meta_status();
end;
$$;

create or replace function public.disconnect_my_meta()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.meta_connections where user_id = auth.uid();
$$;

grant execute on function public.get_my_meta_status() to authenticated;
grant execute on function public.set_my_meta_destinations(text, text) to authenticated;
grant execute on function public.disconnect_my_meta() to authenticated;

revoke execute on function public.get_my_meta_status() from public, anon;
revoke execute on function public.set_my_meta_destinations(text, text) from public, anon;
revoke execute on function public.disconnect_my_meta() from public, anon;
