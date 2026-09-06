-- Nutrition: dietary profile → 7/14-day meal plan → supermarket list + pantry.
-- Calorie/macro columns store the user's targets or editable suggestions, not medical advice.
-- Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists nutrition_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text not null default 'maintenance',
  daily_calorie_target integer,
  daily_protein_target numeric,
  meals_per_day integer not null default 4,
  preferred_meal_times jsonb not null default '[]'::jsonb,
  dietary_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  excluded_foods text[] not null default '{}',
  preferred_foods text[] not null default '{}',
  max_cooking_time_min integer not null default 40,
  weekly_budget numeric,
  people_count integer not null default 1,
  cooking_equipment text[] not null default '{}',
  max_meal_repetitions integer not null default 2,
  permanent_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_profiles_goal_check
    check (goal in ('fat_loss', 'maintenance', 'muscle_gain')),
  constraint nutrition_profiles_meals_check
    check (meals_per_day between 2 and 6)
);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_key text,
  name text not null default '',
  meal_type text not null default 'lunch',
  calories integer not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  prep_time_min integer not null default 0,
  servings numeric not null default 1,
  instructions text not null default '',
  tags text[] not null default '{}',
  allergens text[] not null default '{}',
  diets text[] not null default '{}',
  equipment text[] not null default '{}',
  favorite boolean not null default false,
  source text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_type_check check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  constraint meals_source_check check (source in ('catalog', 'saved', 'custom'))
);

create unique index if not exists meals_user_catalog_key_idx
  on meals (user_id, catalog_key)
  where catalog_key is not null;

create index if not exists meals_user_type_idx on meals (user_id, meal_type, updated_at desc);

create table if not exists meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals (id) on delete cascade,
  name text not null default '',
  quantity numeric not null default 0,
  unit text not null default 'g',
  category text not null default 'Other',
  estimated_cost numeric not null default 0,
  cost_per_unit numeric,
  package_size numeric,
  package_unit text
);

create index if not exists meal_ingredients_meal_idx on meal_ingredients (meal_id);

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  days integer not null default 7,
  status text not null default 'active',
  training_days text[] not null default '{}',
  meals_eaten_outside jsonb not null default '[]'::jsonb,
  available_ingredients jsonb not null default '[]'::jsonb,
  temporary_instructions text not null default '',
  weekly_totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_plans_days_check check (days in (7, 14)),
  constraint meal_plans_status_check check (status in ('draft', 'active', 'archived'))
);

create index if not exists meal_plans_user_status_idx on meal_plans (user_id, status, updated_at desc);

create table if not exists meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references meal_plans (id) on delete cascade,
  date date not null,
  day_index integer not null default 0,
  totals jsonb not null default '{}'::jsonb,
  notes text not null default '',
  unique (plan_id, date)
);

create index if not exists meal_plan_days_plan_idx on meal_plan_days (plan_id, day_index);

create table if not exists planned_meals (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references meal_plan_days (id) on delete cascade,
  meal_id uuid references meals (id) on delete set null,
  slot text not null default 'lunch',
  locked boolean not null default false,
  consumed boolean not null default false,
  outside boolean not null default false,
  portion_multiplier numeric not null default 1,
  snapshot jsonb not null default '{}'::jsonb,
  constraint planned_meals_slot_check check (slot in ('breakfast', 'lunch', 'dinner', 'snack'))
);

create index if not exists planned_meals_day_idx on planned_meals (plan_day_id, slot);
create index if not exists planned_meals_meal_id_idx on planned_meals (meal_id);

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient text not null default '',
  quantity numeric not null default 0,
  unit text not null default 'g',
  expires_on date,
  low_stock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pantry_items_user_idx on pantry_items (user_id, ingredient);

create table if not exists grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references meal_plans (id) on delete set null,
  estimated_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grocery_lists_user_plan_idx on grocery_lists (user_id, plan_id);
create index if not exists grocery_lists_plan_id_idx on grocery_lists (plan_id);

create table if not exists grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references grocery_lists (id) on delete cascade,
  name text not null default '',
  category text not null default 'Other',
  unit text not null default 'g',
  required_qty numeric not null default 0,
  available_qty numeric not null default 0,
  suggested_purchase_qty numeric not null default 0,
  package_label text not null default '',
  estimated_cost numeric not null default 0,
  purchased boolean not null default false,
  manual boolean not null default false
);

create index if not exists grocery_items_list_idx on grocery_items (list_id, category);

alter table nutrition_profiles enable row level security;
alter table meals enable row level security;
alter table meal_ingredients enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_days enable row level security;
alter table planned_meals enable row level security;
alter table pantry_items enable row level security;
alter table grocery_lists enable row level security;
alter table grocery_items enable row level security;

drop policy if exists "nutrition_profiles_select_own" on nutrition_profiles;
create policy "nutrition_profiles_select_own" on nutrition_profiles
  for select using ((select auth.uid()) = user_id);
drop policy if exists "nutrition_profiles_insert_own" on nutrition_profiles;
create policy "nutrition_profiles_insert_own" on nutrition_profiles
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "nutrition_profiles_update_own" on nutrition_profiles;
create policy "nutrition_profiles_update_own" on nutrition_profiles
  for update using ((select auth.uid()) = user_id);
drop policy if exists "nutrition_profiles_delete_own" on nutrition_profiles;
create policy "nutrition_profiles_delete_own" on nutrition_profiles
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "meals_select_own" on meals;
create policy "meals_select_own" on meals
  for select using ((select auth.uid()) = user_id);
drop policy if exists "meals_insert_own" on meals;
create policy "meals_insert_own" on meals
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "meals_update_own" on meals;
create policy "meals_update_own" on meals
  for update using ((select auth.uid()) = user_id);
drop policy if exists "meals_delete_own" on meals;
create policy "meals_delete_own" on meals
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "meal_ingredients_select_own" on meal_ingredients;
create policy "meal_ingredients_select_own" on meal_ingredients
  for select using (exists (
    select 1 from meals m where m.id = meal_ingredients.meal_id and m.user_id = (select auth.uid())
  ));
drop policy if exists "meal_ingredients_insert_own" on meal_ingredients;
create policy "meal_ingredients_insert_own" on meal_ingredients
  for insert with check (exists (
    select 1 from meals m where m.id = meal_ingredients.meal_id and m.user_id = (select auth.uid())
  ));
drop policy if exists "meal_ingredients_update_own" on meal_ingredients;
create policy "meal_ingredients_update_own" on meal_ingredients
  for update using (exists (
    select 1 from meals m where m.id = meal_ingredients.meal_id and m.user_id = (select auth.uid())
  ));
drop policy if exists "meal_ingredients_delete_own" on meal_ingredients;
create policy "meal_ingredients_delete_own" on meal_ingredients
  for delete using (exists (
    select 1 from meals m where m.id = meal_ingredients.meal_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "meal_plans_select_own" on meal_plans;
create policy "meal_plans_select_own" on meal_plans
  for select using ((select auth.uid()) = user_id);
drop policy if exists "meal_plans_insert_own" on meal_plans;
create policy "meal_plans_insert_own" on meal_plans
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "meal_plans_update_own" on meal_plans;
create policy "meal_plans_update_own" on meal_plans
  for update using ((select auth.uid()) = user_id);
drop policy if exists "meal_plans_delete_own" on meal_plans;
create policy "meal_plans_delete_own" on meal_plans
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "meal_plan_days_select_own" on meal_plan_days;
create policy "meal_plan_days_select_own" on meal_plan_days
  for select using (exists (
    select 1 from meal_plans p where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "meal_plan_days_insert_own" on meal_plan_days;
create policy "meal_plan_days_insert_own" on meal_plan_days
  for insert with check (exists (
    select 1 from meal_plans p where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "meal_plan_days_update_own" on meal_plan_days;
create policy "meal_plan_days_update_own" on meal_plan_days
  for update using (exists (
    select 1 from meal_plans p where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "meal_plan_days_delete_own" on meal_plan_days;
create policy "meal_plan_days_delete_own" on meal_plan_days
  for delete using (exists (
    select 1 from meal_plans p where p.id = meal_plan_days.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists "planned_meals_select_own" on planned_meals;
create policy "planned_meals_select_own" on planned_meals
  for select using (exists (
    select 1 from meal_plan_days d
    join meal_plans p on p.id = d.plan_id
    where d.id = planned_meals.plan_day_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "planned_meals_insert_own" on planned_meals;
create policy "planned_meals_insert_own" on planned_meals
  for insert with check (exists (
    select 1 from meal_plan_days d
    join meal_plans p on p.id = d.plan_id
    where d.id = planned_meals.plan_day_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "planned_meals_update_own" on planned_meals;
create policy "planned_meals_update_own" on planned_meals
  for update using (exists (
    select 1 from meal_plan_days d
    join meal_plans p on p.id = d.plan_id
    where d.id = planned_meals.plan_day_id and p.user_id = (select auth.uid())
  ));
drop policy if exists "planned_meals_delete_own" on planned_meals;
create policy "planned_meals_delete_own" on planned_meals
  for delete using (exists (
    select 1 from meal_plan_days d
    join meal_plans p on p.id = d.plan_id
    where d.id = planned_meals.plan_day_id and p.user_id = (select auth.uid())
  ));

drop policy if exists "pantry_items_select_own" on pantry_items;
create policy "pantry_items_select_own" on pantry_items
  for select using ((select auth.uid()) = user_id);
drop policy if exists "pantry_items_insert_own" on pantry_items;
create policy "pantry_items_insert_own" on pantry_items
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "pantry_items_update_own" on pantry_items;
create policy "pantry_items_update_own" on pantry_items
  for update using ((select auth.uid()) = user_id);
drop policy if exists "pantry_items_delete_own" on pantry_items;
create policy "pantry_items_delete_own" on pantry_items
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "grocery_lists_select_own" on grocery_lists;
create policy "grocery_lists_select_own" on grocery_lists
  for select using ((select auth.uid()) = user_id);
drop policy if exists "grocery_lists_insert_own" on grocery_lists;
create policy "grocery_lists_insert_own" on grocery_lists
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "grocery_lists_update_own" on grocery_lists;
create policy "grocery_lists_update_own" on grocery_lists
  for update using ((select auth.uid()) = user_id);
drop policy if exists "grocery_lists_delete_own" on grocery_lists;
create policy "grocery_lists_delete_own" on grocery_lists
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "grocery_items_select_own" on grocery_items;
create policy "grocery_items_select_own" on grocery_items
  for select using (exists (
    select 1 from grocery_lists l where l.id = grocery_items.list_id and l.user_id = (select auth.uid())
  ));
drop policy if exists "grocery_items_insert_own" on grocery_items;
create policy "grocery_items_insert_own" on grocery_items
  for insert with check (exists (
    select 1 from grocery_lists l where l.id = grocery_items.list_id and l.user_id = (select auth.uid())
  ));
drop policy if exists "grocery_items_update_own" on grocery_items;
create policy "grocery_items_update_own" on grocery_items
  for update using (exists (
    select 1 from grocery_lists l where l.id = grocery_items.list_id and l.user_id = (select auth.uid())
  ));
drop policy if exists "grocery_items_delete_own" on grocery_items;
create policy "grocery_items_delete_own" on grocery_items
  for delete using (exists (
    select 1 from grocery_lists l where l.id = grocery_items.list_id and l.user_id = (select auth.uid())
  ));

create or replace function set_nutrition_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists nutrition_profiles_set_updated_at on nutrition_profiles;
create trigger nutrition_profiles_set_updated_at
  before update on nutrition_profiles
  for each row execute function set_nutrition_updated_at();

drop trigger if exists meals_set_updated_at on meals;
create trigger meals_set_updated_at
  before update on meals
  for each row execute function set_nutrition_updated_at();

drop trigger if exists meal_plans_set_updated_at on meal_plans;
create trigger meal_plans_set_updated_at
  before update on meal_plans
  for each row execute function set_nutrition_updated_at();

drop trigger if exists pantry_items_set_updated_at on pantry_items;
create trigger pantry_items_set_updated_at
  before update on pantry_items
  for each row execute function set_nutrition_updated_at();

drop trigger if exists grocery_lists_set_updated_at on grocery_lists;
create trigger grocery_lists_set_updated_at
  before update on grocery_lists
  for each row execute function set_nutrition_updated_at();
