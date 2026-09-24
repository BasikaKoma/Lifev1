-- Personal + business assistant: open items, mail (tokens server-only), ERP (key server-only).
-- Supabase Dashboard → SQL Editor (safe to re-run).
-- Mail OAuth also needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MAIL_REDIRECT_URI on the Edge Functions.
-- ERP contract: GET {base_url}/{domain} with Authorization: Bearer {api_key}, JSON body.
-- Domains: cash, customers, sales, prices, operations, people, suppliers, documents.

create table if not exists open_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  due_on date,
  level text not null default 'human' check (level in ('human', 'business')),
  source text not null default 'manual' check (source in ('manual', 'mail', 'call', 'day', 'commitment')),
  source_ref text not null default '',
  status text not null default 'open' check (status in ('open', 'done', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists open_items_user_status_due_idx
  on open_items (user_id, status, due_on);

alter table open_items enable row level security;

drop policy if exists "open_items_select_own" on open_items;
create policy "open_items_select_own" on open_items
  for select using (auth.uid() = user_id);

drop policy if exists "open_items_insert_own" on open_items;
create policy "open_items_insert_own" on open_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "open_items_update_own" on open_items;
create policy "open_items_update_own" on open_items
  for update using (auth.uid() = user_id);

drop policy if exists "open_items_delete_own" on open_items;
create policy "open_items_delete_own" on open_items
  for delete using (auth.uid() = user_id);

create or replace function set_open_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists open_items_set_updated_at on open_items;
create trigger open_items_set_updated_at
  before update on open_items
  for each row execute function set_open_items_updated_at();

-- Confirmed payment records. The app stores the decision; it does not move money.
create table if not exists payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  amount text not null default '',
  counterparty text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payment_records_user_created_idx
  on payment_records (user_id, created_at desc);

alter table payment_records enable row level security;

drop policy if exists "payment_records_select_own" on payment_records;
create policy "payment_records_select_own" on payment_records
  for select using (auth.uid() = user_id);

drop policy if exists "payment_records_insert_own" on payment_records;
create policy "payment_records_insert_own" on payment_records
  for insert with check (auth.uid() = user_id);

-- Mail OAuth. No client policies: tokens stay on the service role.
create table if not exists mail_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists mail_oauth_states_expires_idx on mail_oauth_states (expires_at);

alter table mail_oauth_states enable row level security;

create table if not exists mail_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table mail_connections enable row level security;

create table if not exists mail_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_id text not null,
  thread_id text,
  message_id_header text,
  from_addr text not null default '',
  subject text not null default '',
  snippet text not null default '',
  received_at timestamptz,
  unread boolean not null default false,
  urgent boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, gmail_id)
);

create index if not exists mail_messages_user_received_idx
  on mail_messages (user_id, received_at desc);

alter table mail_messages enable row level security;

drop policy if exists "mail_messages_select_own" on mail_messages;
create policy "mail_messages_select_own" on mail_messages
  for select using (auth.uid() = user_id);

-- ERP key never exposed to the client.
create table if not exists erp_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null default '',
  base_url text not null,
  api_key text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table erp_connections enable row level security;

create table if not exists erp_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  domain text not null check (domain in (
    'cash', 'customers', 'sales', 'prices', 'operations', 'people', 'suppliers', 'documents'
  )),
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (user_id, domain)
);

alter table erp_snapshots enable row level security;

drop policy if exists "erp_snapshots_select_own" on erp_snapshots;
create policy "erp_snapshots_select_own" on erp_snapshots
  for select using (auth.uid() = user_id);

create or replace function public.get_my_mail_status()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select json_build_object(
        'connected', true,
        'email', email,
        'connected_at', connected_at,
        'last_synced_at', last_synced_at,
        'token_valid', expires_at > now()
      )
      from mail_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'email', null,
      'connected_at', null,
      'last_synced_at', null,
      'token_valid', false
    )
  );
$$;

create or replace function public.disconnect_my_mail()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from mail_messages where user_id = auth.uid();
  delete from mail_connections where user_id = auth.uid();
end;
$$;

create or replace function public.get_my_erp_status()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select json_build_object(
        'connected', true,
        'label', label,
        'connected_at', connected_at,
        'updated_at', updated_at
      )
      from erp_connections
      where user_id = auth.uid()
    ),
    json_build_object(
      'connected', false,
      'label', null,
      'connected_at', null,
      'updated_at', null
    )
  );
$$;

create or replace function public.disconnect_my_erp()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from erp_snapshots where user_id = auth.uid();
  delete from erp_connections where user_id = auth.uid();
end;
$$;

grant execute on function public.get_my_mail_status() to authenticated;
grant execute on function public.disconnect_my_mail() to authenticated;
grant execute on function public.get_my_erp_status() to authenticated;
grant execute on function public.disconnect_my_erp() to authenticated;
