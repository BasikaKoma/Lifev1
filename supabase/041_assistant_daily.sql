-- Daily assistant pull at 07:00 Athens (04:00 UTC). Safe to re-run.

create table if not exists assistant_runs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pulled_at timestamptz not null default now(),
  mail_connected boolean not null default false,
  erp_connected boolean not null default false,
  mail_count int not null default 0,
  erp_count int not null default 0,
  item_count int not null default 0
);

alter table assistant_runs enable row level security;

drop policy if exists "assistant_runs_select_own" on assistant_runs;
create policy "assistant_runs_select_own" on assistant_runs
  for select using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'assistant_daily_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'assistant_daily_cron_secret',
      'Bearer token for the daily assistant pull'
    );
  end if;
end
$$;

create or replace function public.internal_get_assistant_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'assistant_daily_cron_secret'
  limit 1;
$$;

revoke all on function public.internal_get_assistant_cron_secret() from public, anon, authenticated;
grant execute on function public.internal_get_assistant_cron_secret() to service_role;

create or replace function public.trigger_assistant_daily()
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
  where name = 'assistant_daily_cron_secret';

  if cron_secret is null or cron_secret = '' then
    raise warning 'assistant_daily_cron_secret missing from vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/assistant-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;

revoke all on function public.trigger_assistant_daily() from public, anon, authenticated;
grant execute on function public.trigger_assistant_daily() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'assistant-daily-morning';

select cron.schedule(
  'assistant-daily-morning',
  '0 4 * * *',
  'select public.trigger_assistant_daily();'
);
