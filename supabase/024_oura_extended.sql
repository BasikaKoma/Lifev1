-- Extended Oura metrics columns + profile/device payloads
alter table oura_daily_metrics add column if not exists spo2_average numeric;
alter table oura_daily_metrics add column if not exists stress_high_seconds int;
alter table oura_daily_metrics add column if not exists recovery_high_seconds int;
alter table oura_daily_metrics add column if not exists avg_heart_rate int;
alter table oura_daily_metrics add column if not exists resting_heart_rate int;

alter table oura_connections add column if not exists profile_payload jsonb not null default '{}'::jsonb;
alter table oura_connections add column if not exists device_payload jsonb not null default '{}'::jsonb;

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
        'token_valid', expires_at > now(),
        'profile', profile_payload,
        'device', device_payload
      )
      from oura_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'connected_at', null,
      'last_synced_at', null,
      'scopes', null,
      'token_valid', false,
      'profile', '{}'::json,
      'device', '{}'::json
    )
  );
$$;
