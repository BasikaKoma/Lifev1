-- High heart-rate push alert (needs 047_push_notifications.sql).
-- A trigger on oura_daily_metrics: whenever Oura heart-rate samples are written (any Oura sync),
-- new samples above the user's limit (default 100 bpm) queue a push and send it right away.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

create or replace function public.notify_high_heart_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings jsonb;
  threshold int := 100;
  last_key text;
  last_sample timestamptz;
  high_count int;
  peak_bpm numeric;
  first_at timestamptz;
  latest_at timestamptz;
  alert_body text;
  alert_key text;
  cron_secret text;
begin
  if tg_op = 'UPDATE'
    and new.payload -> 'heart_rate_samples' is not distinct from old.payload -> 'heart_rate_samples' then
    return new;
  end if;

  select s.settings into settings from public.push_settings s where s.user_id = new.user_id;
  -- Same defaults as the app (src/lib/push/settings.js): on once notifications are enabled.
  if settings is null
    or coalesce(settings ->> 'enabled', 'false') <> 'true'
    or coalesce(settings ->> 'heartRate', 'true') <> 'true' then
    return new;
  end if;
  if coalesce(settings ->> 'heartRateThreshold', '') ~ '^\d{2,3}$'
    and (settings ->> 'heartRateThreshold')::int between 60 and 220 then
    threshold := (settings ->> 'heartRateThreshold')::int;
  end if;

  -- Only samples newer than the last one already alerted about.
  -- Keys are hr:<UTC ISO time>, so the greatest key is the latest sample (created_at ties within a sync).
  select p.key into last_key
  from public.push_schedule p
  where p.user_id = new.user_id and p.kind = 'heart_rate' and p.key like 'hr:%'
  order by p.key desc
  limit 1;
  if last_key ~ '^hr:\d{4}-\d{2}-\d{2}T' then
    last_sample := substring(last_key from 4)::timestamptz;
  end if;

  select count(*), max(h.bpm), min(h.at), max(h.at)
  into high_count, peak_bpm, first_at, latest_at
  from (
    select (sample ->> 'timestamp')::timestamptz as at, (sample ->> 'bpm')::numeric as bpm
    from jsonb_array_elements(coalesce(new.payload -> 'heart_rate_samples', '[]'::jsonb)) as sample
    where jsonb_typeof(sample -> 'bpm') = 'number'
      and coalesce(sample ->> 'timestamp', '') <> ''
  ) h
  where h.bpm > threshold
    -- A sync rewrites up to 30 days; older samples are history, not news.
    and h.at > now() - interval '3 hours'
    and (last_sample is null or h.at > last_sample);

  if high_count = 0 then
    return new;
  end if;

  alert_body := case
    when high_count = 1 then format(
      '%s bpm στις %s (όριο %s)',
      round(peak_bpm),
      to_char(latest_at at time zone 'Europe/Athens', 'HH24:MI'),
      threshold
    )
    else format(
      'Έως %s bpm, %s–%s · %s μετρήσεις πάνω από %s',
      round(peak_bpm),
      to_char(first_at at time zone 'Europe/Athens', 'HH24:MI'),
      to_char(latest_at at time zone 'Europe/Athens', 'HH24:MI'),
      high_count,
      threshold
    )
  end;
  alert_key := 'hr:' || to_char(latest_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  insert into public.push_schedule (user_id, key, kind, fire_at, title, body, url)
  values (new.user_id, alert_key, 'heart_rate', now(), 'Υψηλοί παλμοί', alert_body, '/self')
  on conflict (user_id, key) do nothing;

  -- Send now rather than on the next minute of the dispatch cron (pg_net fires after commit).
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_cron_secret';
  if coalesce(cron_secret, '') <> '' then
    perform net.http_post(
      url := 'https://fxdnbepmiphyzebqdkyf.supabase.co/functions/v1/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;

  return new;
exception when others then
  -- Never let an alert problem break the Oura sync that is writing this row.
  raise warning 'notify_high_heart_rate failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_high_heart_rate() from public, anon, authenticated;

drop trigger if exists oura_daily_metrics_high_heart_rate on public.oura_daily_metrics;
create trigger oura_daily_metrics_high_heart_rate
  after insert or update of payload on public.oura_daily_metrics
  for each row
  execute function public.notify_high_heart_rate();
