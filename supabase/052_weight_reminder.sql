-- Missing-weight reminder (needs 047).
-- If a day has no weight in health_metrics by the user's chosen time (default 11:00 Athens),
-- one push goes out that day. Checked here every minute rather than scheduled ahead, so a
-- weigh-in from any source (scale ingest, the app, offline queue) before then means no push.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

-- Same defaults as the app (src/lib/push/settings.js): on at 11:00 once notifications are enabled.
-- p_now only exists so the logic can be tested at any hour.
create or replace function public.queue_missing_weight_reminders(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := p_now at time zone 'Europe/Athens';
  today date := local_now::date;
  queued int;
begin
  insert into public.push_schedule (user_id, key, kind, fire_at, title, body, url)
  select
    s.user_id,
    'weight:' || to_char(today, 'YYYY-MM-DD'),
    'weight',
    -- now, not the chosen time: the dispatch drops anything more than 15′ late.
    p_now,
    'Ζύγισμα',
    'Δεν υπάρχει μέτρηση βάρους σήμερα.',
    '/self'
  from public.push_settings s
  where s.settings ->> 'enabled' = 'true'
    and coalesce(s.settings ->> 'weightMissing', 'true') = 'true'
    and local_now::time >= case
      when coalesce(s.settings ->> 'weightMissingTime', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
        then (s.settings ->> 'weightMissingTime')::time
      else time '11:00'
    end
    and not exists (
      select 1
      from public.health_metrics m
      where m.user_id = s.user_id
        and m.day = today
        and m.metric_type = 'weight'
        and m.value is not null
    )
  -- The key is per day, so a sent reminder is never repeated that day.
  on conflict (user_id, key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.queue_missing_weight_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_missing_weight_reminders(timestamptz) to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'weight-reminder-minute';

select cron.schedule(
  'weight-reminder-minute',
  '* * * * *',
  'select public.queue_missing_weight_reminders();'
);
