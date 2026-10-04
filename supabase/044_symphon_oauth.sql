-- Symphon OAuth. Tokens stay on the server. The client only sees status.

alter table erp_connections alter column base_url drop not null;
alter table erp_connections alter column api_key drop not null;

alter table erp_connections add column if not exists provider text not null default 'manual';
alter table erp_connections add column if not exists access_token text;
alter table erp_connections add column if not exists refresh_token text;
alter table erp_connections add column if not exists expires_at timestamptz;
alter table erp_connections add column if not exists org_id text;
alter table erp_connections add column if not exists org_name text;

alter table erp_connections drop constraint if exists erp_connections_provider_check;
alter table erp_connections
  add constraint erp_connections_provider_check
  check (provider in ('manual', 'symphon'));

alter table erp_connections drop constraint if exists erp_connections_auth_check;
alter table erp_connections
  add constraint erp_connections_auth_check
  check (
    (provider = 'manual' and base_url is not null and api_key is not null)
    or (provider = 'symphon' and access_token is not null and refresh_token is not null)
  );

create table if not exists erp_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text not null,
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists erp_oauth_states_expires_idx on erp_oauth_states (expires_at);

alter table erp_oauth_states enable row level security;

create or replace function public.get_my_erp_status()
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
        'label', coalesce(nullif(org_name, ''), nullif(label, '')),
        'provider', provider,
        'org_id', org_id,
        'org_name', org_name,
        'needs_org', provider = 'symphon' and org_id is null,
        'connected_at', connected_at,
        'updated_at', updated_at
      )
      from erp_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'label', null,
      'provider', null,
      'org_id', null,
      'org_name', null,
      'needs_org', false,
      'connected_at', null,
      'updated_at', null
    )
  );
$$;

grant execute on function public.get_my_erp_status() to authenticated;
