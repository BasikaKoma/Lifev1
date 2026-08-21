-- Pull Oura data on a schedule even when the app is closed.
-- Supabase Dashboard → SQL Editor (safe to re-run)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'oura_sync_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'oura_sync_cron_secret',
      'Bearer token for hourly oura-sync-all cron'
    );
  end if;
end
$$;

create or replace function public.internal_get_oura_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'oura_sync_cron_secret'
  limit 1;
$$;

revoke all on function public.internal_get_oura_cron_secret() from public, anon, authenticated;
grant execute on function public.internal_get_oura_cron_secret() to service_role;

create or replace function public.trigger_oura_sync()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cron_secret text;
begin
  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'oura_sync_cron_secret';

  if cron_secret is null or cron_secret = '' then
    raise warning 'oura_sync_cron_secret missing from vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/oura-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;

revoke all on function public.trigger_oura_sync() from public, anon, authenticated;
grant execute on function public.trigger_oura_sync() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'oura-sync-all-hourly';

select cron.schedule(
  'oura-sync-all-hourly',
  '10 * * * *',
  'select public.trigger_oura_sync();'
);
