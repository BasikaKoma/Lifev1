-- Oura webhooks (needs 047_push_notifications.sql for the cron secret).
-- Oura calls the oura-webhook function ~30 s after the ring syncs; that re-reads the last two
-- days, and the heart-rate trigger (048) sends any alert. Subscriptions expire, so a daily job
-- renews them. Run in Supabase Dashboard → SQL Editor (safe to re-run).

-- One re-read per burst of events (claimed atomically by the webhook handler).
alter table public.oura_connections add column if not exists webhook_sync_at timestamptz;

-- What Oura sent and what we did with it, kept 14 days (service role only).
create table if not exists public.oura_webhook_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  event_type text,
  data_type text,
  oura_user_id text,
  signature_ok boolean not null default false,
  outcome text
);

create index if not exists oura_webhook_events_received_idx on public.oura_webhook_events (received_at);

alter table public.oura_webhook_events enable row level security;

create or replace function public.trigger_oura_webhook_subscriptions()
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
  where name = 'push_dispatch_cron_secret';

  if cron_secret is null or cron_secret = '' then
    raise warning 'push_dispatch_cron_secret missing from vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/oura-webhook-subscriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_oura_webhook_subscriptions() from public, anon, authenticated;
grant execute on function public.trigger_oura_webhook_subscriptions() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'oura-webhook-subscriptions-daily';

select cron.schedule(
  'oura-webhook-subscriptions-daily',
  '20 3 * * *',
  'select public.trigger_oura_webhook_subscriptions();'
);
