-- Zoho Mail on the existing mail connection.
-- Supabase Dashboard → SQL Editor (safe to re-run).
-- Edge Function secrets: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and the existing MAIL_REDIRECT_URI.
-- Register that redirect URI on a Zoho API Console server-based client.
-- The app chooses the data center (default Europe / zoho.eu).

alter table mail_connections
  add column if not exists provider text not null default 'gmail',
  add column if not exists account_id text,
  add column if not exists api_base text,
  add column if not exists accounts_host text;

alter table mail_connections drop constraint if exists mail_connections_provider_check;
alter table mail_connections
  add constraint mail_connections_provider_check check (provider in ('gmail', 'zoho'));

alter table mail_oauth_states
  add column if not exists provider text not null default 'gmail',
  add column if not exists region text;

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
        'connected_at', connected_at,
        'last_synced_at', last_synced_at,
        'token_valid', expires_at > now()
      )
      from mail_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'provider', null,
      'email', null,
      'connected_at', null,
      'last_synced_at', null,
      'token_valid', false
    )
  );
$$;
