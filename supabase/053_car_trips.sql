-- Car trips: the phone says when it connects to the car and when it leaves it
-- (an iPhone Shortcuts automation calling the car-log function). The app turns every
-- finished trip into a Path block; the function never writes path_state itself, because
-- the apps save the whole Path at once and would write over it.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

-- The secret in the two links the phone calls. Shown again in Settings, so it is kept as is.
create table if not exists public.car_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.car_links enable row level security;

drop policy if exists "car_links_select_own" on public.car_links;
create policy "car_links_select_own" on public.car_links
  for select using (auth.uid() = user_id);

drop policy if exists "car_links_insert_own" on public.car_links;
create policy "car_links_insert_own" on public.car_links
  for insert with check (auth.uid() = user_id);

drop policy if exists "car_links_update_own" on public.car_links;
create policy "car_links_update_own" on public.car_links
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "car_links_delete_own" on public.car_links;
create policy "car_links_delete_own" on public.car_links
  for delete using (auth.uid() = user_id);

-- One row per drive. ended_at is empty while the phone is still connected;
-- imported_at is set once an app has put the trip in the Path.
create table if not exists public.car_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists car_trips_user_started_idx
  on public.car_trips (user_id, started_at desc);

alter table public.car_trips enable row level security;

-- Rows are added by the car-log function only (service role), so there is no insert policy.
drop policy if exists "car_trips_select_own" on public.car_trips;
create policy "car_trips_select_own" on public.car_trips
  for select using (auth.uid() = user_id);

drop policy if exists "car_trips_update_own" on public.car_trips;
create policy "car_trips_update_own" on public.car_trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "car_trips_delete_own" on public.car_trips;
create policy "car_trips_delete_own" on public.car_trips
  for delete using (auth.uid() = user_id);
