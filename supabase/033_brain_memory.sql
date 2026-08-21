-- Lifev1 Brain Memory Repository
-- Provider-agnostic durable memory. Original text is always kept.
-- Embeddings are NOT stored here; they are model-specific and can be rebuilt later.

create table if not exists public.brain_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  identity text not null default '',
  values_text text not null default '',
  goals text not null default '',
  style text not null default '',
  brand text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.brain_conversations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Νέα συνομιλία',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brain_conversations_user_updated_idx
  on public.brain_conversations (user_id, updated_at desc);

create table if not exists public.brain_messages (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null references public.brain_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  kind text not null default 'ask',
  body text not null default '',
  insights jsonb not null default '[]'::jsonb,
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists brain_messages_conversation_idx
  on public.brain_messages (conversation_id, created_at);

create index if not exists brain_messages_user_idx
  on public.brain_messages (user_id, created_at desc);

create table if not exists public.brain_memories (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'current' check (status in ('current', 'old', 'superseded', 'archived')),
  title text not null default '',
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  source_kind text not null default 'user',
  source_id text,
  conversation_id text references public.brain_conversations (id) on delete set null,
  superseded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brain_memories_user_status_idx
  on public.brain_memories (user_id, status, updated_at desc);

create index if not exists brain_memories_user_kind_idx
  on public.brain_memories (user_id, kind, status);

alter table public.brain_profiles enable row level security;
alter table public.brain_conversations enable row level security;
alter table public.brain_messages enable row level security;
alter table public.brain_memories enable row level security;

drop policy if exists "brain_profiles_select_own" on public.brain_profiles;
drop policy if exists "brain_profiles_insert_own" on public.brain_profiles;
drop policy if exists "brain_profiles_update_own" on public.brain_profiles;

create policy "brain_profiles_select_own" on public.brain_profiles
  for select using (auth.uid() = user_id);
create policy "brain_profiles_insert_own" on public.brain_profiles
  for insert with check (auth.uid() = user_id);
create policy "brain_profiles_update_own" on public.brain_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "brain_conversations_select_own" on public.brain_conversations;
drop policy if exists "brain_conversations_insert_own" on public.brain_conversations;
drop policy if exists "brain_conversations_update_own" on public.brain_conversations;
drop policy if exists "brain_conversations_delete_own" on public.brain_conversations;

create policy "brain_conversations_select_own" on public.brain_conversations
  for select using (auth.uid() = user_id);
create policy "brain_conversations_insert_own" on public.brain_conversations
  for insert with check (auth.uid() = user_id);
create policy "brain_conversations_update_own" on public.brain_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brain_conversations_delete_own" on public.brain_conversations
  for delete using (auth.uid() = user_id);

drop policy if exists "brain_messages_select_own" on public.brain_messages;
drop policy if exists "brain_messages_insert_own" on public.brain_messages;
drop policy if exists "brain_messages_update_own" on public.brain_messages;
drop policy if exists "brain_messages_delete_own" on public.brain_messages;

create policy "brain_messages_select_own" on public.brain_messages
  for select using (auth.uid() = user_id);
create policy "brain_messages_insert_own" on public.brain_messages
  for insert with check (auth.uid() = user_id);
create policy "brain_messages_update_own" on public.brain_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brain_messages_delete_own" on public.brain_messages
  for delete using (auth.uid() = user_id);

drop policy if exists "brain_memories_select_own" on public.brain_memories;
drop policy if exists "brain_memories_insert_own" on public.brain_memories;
drop policy if exists "brain_memories_update_own" on public.brain_memories;
drop policy if exists "brain_memories_delete_own" on public.brain_memories;

create policy "brain_memories_select_own" on public.brain_memories
  for select using (auth.uid() = user_id);
create policy "brain_memories_insert_own" on public.brain_memories
  for insert with check (auth.uid() = user_id);
create policy "brain_memories_update_own" on public.brain_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brain_memories_delete_own" on public.brain_memories
  for delete using (auth.uid() = user_id);
