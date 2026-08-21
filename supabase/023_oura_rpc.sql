-- Client-safe Oura status + disconnect (no tokens exposed)
-- Supabase Dashboard → SQL Editor

create or replace function public.get_my_oura_status()
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
        'connected_at', connected_at,
        'last_synced_at', last_synced_at,
        'scopes', scopes,
        'token_valid', expires_at > now()
      )
      from oura_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'connected_at', null,
      'last_synced_at', null,
      'scopes', null,
      'token_valid', false
    )
  );
$$;

create or replace function public.disconnect_my_oura()
returns void
language sql
security definer
set search_path = public
as $$
  delete from oura_connections where user_id = auth.uid();
$$;

grant execute on function public.get_my_oura_status() to authenticated;
grant execute on function public.disconnect_my_oura() to authenticated;
