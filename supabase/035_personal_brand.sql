-- Personal Brand: DNA persists across AI models; items are the content pipeline.
-- Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists personal_brand (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text,
  dna jsonb not null default '{}'::jsonb,
  dismissed_signal_ids text[] not null default '{}',
  active_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage text not null default 'idea', -- idea | selected | drafting | ready | published
  kind text not null default 'thought', -- thought | lesson | decision | failure | project_update | question
  title text not null default '',
  hook text not null default '',
  body text not null default '',
  why text not null default '',
  angle text not null default '',
  source_label text not null default '',
  source_kind text not null default 'capture', -- lifeline | project | self | capture | signal
  source_id text,
  platforms text[] not null default '{}',
  pillar_id text,
  progress integer not null default 0,
  variations jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_items_user_stage_idx
  on brand_items (user_id, stage, updated_at desc);

alter table personal_brand enable row level security;
alter table brand_items enable row level security;

drop policy if exists "personal_brand_select_own" on personal_brand;
create policy "personal_brand_select_own" on personal_brand
  for select using (auth.uid() = user_id);

drop policy if exists "personal_brand_insert_own" on personal_brand;
create policy "personal_brand_insert_own" on personal_brand
  for insert with check (auth.uid() = user_id);

drop policy if exists "personal_brand_update_own" on personal_brand;
create policy "personal_brand_update_own" on personal_brand
  for update using (auth.uid() = user_id);

drop policy if exists "personal_brand_delete_own" on personal_brand;
create policy "personal_brand_delete_own" on personal_brand
  for delete using (auth.uid() = user_id);

drop policy if exists "brand_items_select_own" on brand_items;
create policy "brand_items_select_own" on brand_items
  for select using (auth.uid() = user_id);

drop policy if exists "brand_items_insert_own" on brand_items;
create policy "brand_items_insert_own" on brand_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "brand_items_update_own" on brand_items;
create policy "brand_items_update_own" on brand_items
  for update using (auth.uid() = user_id);

drop policy if exists "brand_items_delete_own" on brand_items;
create policy "brand_items_delete_own" on brand_items
  for delete using (auth.uid() = user_id);

create or replace function set_personal_brand_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists personal_brand_set_updated_at on personal_brand;
create trigger personal_brand_set_updated_at
  before update on personal_brand
  for each row execute function set_personal_brand_updated_at();

drop trigger if exists brand_items_set_updated_at on brand_items;
create trigger brand_items_set_updated_at
  before update on brand_items
  for each row execute function set_personal_brand_updated_at();
