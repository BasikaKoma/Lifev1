-- Push notifications for the iPhone home-screen app (Web Push), Android (FCM) and desktop (Realtime).
-- Apps write upcoming reminders into push_schedule; a per-minute cron sends the due ones.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run). Needs pg_cron + pg_net (029).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

-- Devices that receive pushes. Desktop listens through Realtime and has no row here.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('web', 'android')),
  -- web: subscription endpoint · android: FCM registration token
  token text not null unique,
  -- web: { p256dh, auth }
  keys jsonb,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_devices_user_id_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own" on public.push_devices
  for select using (auth.uid() = user_id);

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own" on public.push_devices
  for delete using (auth.uid() = user_id);

-- A browser/phone keeps its token when another account signs in on it, so registering
-- moves the row to the current user instead of failing on the unique token.
create or replace function public.register_push_device(
  p_platform text,
  p_token text,
  p_keys jsonb default null,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  device_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_platform not in ('web', 'android') then
    raise exception 'Unsupported platform %', p_platform;
  end if;
  if coalesce(p_token, '') = '' or length(p_token) > 2048 then
    raise exception 'Invalid push token';
  end if;

  insert into public.push_devices (user_id, platform, token, keys, label)
  values (uid, p_platform, p_token, p_keys, left(p_label, 120))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        keys = excluded.keys,
        label = excluded.label,
        last_seen_at = now()
  returning id into device_id;

  return device_id;
end;
$$;

revoke all on function public.register_push_device(text, text, jsonb, text) from public, anon;
grant execute on function public.register_push_device(text, text, jsonb, text) to authenticated;

-- Which reminders a user wants (shared by all their devices).
create table if not exists public.push_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_settings enable row level security;

drop policy if exists "push_settings_own" on public.push_settings;
create policy "push_settings_own" on public.push_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Upcoming notifications. key is stable per reminder so apps can upsert and prune.
create table if not exists public.push_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  kind text not null default 'reminder',
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  url text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists push_schedule_due_idx on public.push_schedule (fire_at) where sent_at is null;
create index if not exists push_schedule_sent_idx on public.push_schedule (sent_at) where sent_at is not null;

alter table public.push_schedule enable row level security;

drop policy if exists "push_schedule_own" on public.push_schedule;
create policy "push_schedule_own" on public.push_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Desktop shows a toast when a row flips to sent.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'push_schedule'
  ) then
    alter publication supabase_realtime add table public.push_schedule;
  end if;
end $$;

-- Marks due rows as sent and returns them, so overlapping dispatch runs never double-send.
create or replace function public.claim_due_pushes(p_user uuid default null, p_limit int default 200)
returns setof public.push_schedule
language sql
security definer
set search_path = public
as $$
  update public.push_schedule s
  set sent_at = now(), updated_at = now()
  where s.id in (
    select id
    from public.push_schedule
    where sent_at is null
      and fire_at <= now()
      and (p_user is null or user_id = p_user)
    order by fire_at
    limit p_limit
    for update skip locked
  )
  returning s.*;
$$;

revoke all on function public.claim_due_pushes(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_due_pushes(uuid, int) to service_role;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'push_dispatch_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'push_dispatch_cron_secret',
      'Bearer token for the per-minute push dispatch'
    );
  end if;
end
$$;

create or replace function public.internal_get_push_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_cron_secret'
  limit 1;
$$;

revoke all on function public.internal_get_push_cron_secret() from public, anon, authenticated;
grant execute on function public.internal_get_push_cron_secret() to service_role;

-- Runs every minute but only calls the Edge Function when something is due.
create or replace function public.trigger_push_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cron_secret text;
begin
  delete from public.push_schedule
  where sent_at is not null and sent_at < now() - interval '7 days';

  if not exists (
    select 1 from public.push_schedule where sent_at is null and fire_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_cron_secret';

  if cron_secret is null or cron_secret = '' then
    raise warning 'push_dispatch_cron_secret missing from vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.trigger_push_dispatch() from public, anon, authenticated;
grant execute on function public.trigger_push_dispatch() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'push-dispatch-minute';

select cron.schedule(
  'push-dispatch-minute',
  '* * * * *',
  'select public.trigger_push_dispatch();'
);
