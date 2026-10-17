-- Morning mood check-in (1–10 + optional note), needs 047 and 049.
-- The push comes with the first Oura sleep sync after waking (oura-webhook calls
-- prompt_morning_mood); if that has not happened by 07:00 Athens time, it comes at 07:00.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists public.mood_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  score smallint not null check (score between 1 and 10),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.mood_checkins enable row level security;

drop policy if exists "mood_checkins_own" on public.mood_checkins;
create policy "mood_checkins_own" on public.mood_checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Same defaults as the app (src/lib/push/settings.js): on once notifications are enabled.
create or replace function public.wants_morning_mood(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.push_settings s
    where s.user_id = p_user
      and s.settings ->> 'enabled' = 'true'
      and coalesce(s.settings ->> 'moodCheckin', 'true') = 'true'
  )
  and not exists (
    select 1 from public.mood_checkins m where m.user_id = p_user and m.day = p_day
  );
$$;

revoke all on function public.wants_morning_mood(uuid, date) from public, anon, authenticated;

-- Nightly: queue today's 07:00 fallback for everyone who wants it.
-- p_now only exists so the logic can be tested at any hour.
create or replace function public.schedule_morning_mood(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (p_now at time zone 'Europe/Athens')::date;
  queued int;
begin
  insert into public.push_schedule (user_id, key, kind, fire_at, title, body, url)
  select
    s.user_id,
    'mood:' || to_char(today, 'YYYY-MM-DD'),
    'mood',
    (today + time '07:00') at time zone 'Europe/Athens',
    'Καλημέρα',
    'Πώς είναι η διάθεσή σου σήμερα; 1–10',
    '/self?mood=1'
  from public.push_settings s
  where public.wants_morning_mood(s.user_id, today)
  on conflict (user_id, key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.schedule_morning_mood(timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_morning_mood(timestamptz) to postgres;

-- Called by oura-webhook on a sleep event: between 04:00 and 07:00 the prompt goes out now.
-- Returns 'queued' when the caller should dispatch.
create or replace function public.prompt_morning_mood(p_user uuid, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := p_now at time zone 'Europe/Athens';
  today date := local_now::date;
  mood_key text := 'mood:' || to_char(today, 'YYYY-MM-DD');
  existing record;
begin
  if local_now::time < time '04:00' or local_now::time >= time '07:00' then
    return 'outside morning window';
  end if;
  if not public.wants_morning_mood(p_user, today) then
    return 'not wanted';
  end if;

  select id, sent_at into existing
  from public.push_schedule
  where user_id = p_user and key = mood_key;

  if found and existing.sent_at is not null then
    return 'already sent';
  end if;

  if found then
    update public.push_schedule set fire_at = p_now, updated_at = now() where id = existing.id;
  else
    insert into public.push_schedule (user_id, key, kind, fire_at, title, body, url)
    values (p_user, mood_key, 'mood', p_now, 'Καλημέρα', 'Πώς είναι η διάθεσή σου σήμερα; 1–10', '/self?mood=1')
    on conflict (user_id, key) do nothing;
  end if;
  return 'queued';
end;
$$;

revoke all on function public.prompt_morning_mood(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.prompt_morning_mood(uuid, timestamptz) to service_role;

-- 00:05 UTC is 02:05–03:05 in Athens: already "today" there, well before 07:00.
select cron.unschedule(jobid)
from cron.job
where jobname = 'morning-mood-schedule';

select cron.schedule(
  'morning-mood-schedule',
  '5 0 * * *',
  'select public.schedule_morning_mood();'
);
