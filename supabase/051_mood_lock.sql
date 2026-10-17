-- Morning mood locks one hour after the Oura wake-up (end of that day's long_sleep),
-- whether or not anything was entered. Until Oura has the wake-up it stays open; a past
-- day is always locked. Enforced here, not only in the app. Needs 050.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

-- Oura files a night under the day you wake up; bedtime_end of the long_sleep is the wake-up.
create or replace function public.mood_wake_at(p_user uuid, p_day date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max((sess ->> 'bedtime_end')::timestamptz)
  from public.oura_daily_metrics m
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(m.payload -> 'sleep_sessions') = 'array' then m.payload -> 'sleep_sessions' else '[]'::jsonb end
  ) as sess
  where m.user_id = p_user
    and m.day = p_day
    and sess ->> 'type' = 'long_sleep'
    and coalesce(sess ->> 'bedtime_end', '') <> '';
$$;

-- Wake-up + 1 h; with no wake-up yet, the end of that day (Athens).
create or replace function public.mood_lock_at(p_user uuid, p_day date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.mood_wake_at(p_user, p_day) + interval '1 hour',
    ((p_day + 1)::timestamp) at time zone 'Europe/Athens'
  );
$$;

revoke all on function public.mood_wake_at(uuid, date) from public, anon, authenticated;
revoke all on function public.mood_lock_at(uuid, date) from public, anon, authenticated;

-- For the app: when the signed-in user woke up and when the day's mood locks.
create or replace function public.mood_window(p_day date)
returns table (wake_at timestamptz, lock_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select public.mood_wake_at(auth.uid(), p_day), public.mood_lock_at(auth.uid(), p_day)
  where auth.uid() is not null;
$$;

revoke all on function public.mood_window(date) from public, anon;
grant execute on function public.mood_window(date) to authenticated;

create or replace function public.enforce_mood_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if now() >= public.mood_lock_at(new.user_id, new.day) then
    raise exception 'Η διάθεση της ημέρας κλείδωσε (μία ώρα μετά το ξύπνημα).';
  end if;
  return new;
end;
$$;

drop trigger if exists mood_checkins_lock on public.mood_checkins;
create trigger mood_checkins_lock
  before insert or update on public.mood_checkins
  for each row
  execute function public.enforce_mood_lock();

-- Same as 050, plus: no prompt once the day is locked (and the 07:00 one is dropped).
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
  if p_now >= public.mood_lock_at(p_user, today) then
    delete from public.push_schedule where user_id = p_user and key = mood_key and sent_at is null;
    return 'locked';
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
