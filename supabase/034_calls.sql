-- Call log with recordings for self-analysis / improvement.
-- Recorded via open speaker + microphone, with the other party informed (consent).
-- Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact text,
  phone text,
  direction text not null default 'outgoing', -- outgoing | incoming
  purpose text,
  outcome text, -- e.g. meeting | interested | callback | rejected | no_answer
  notes text,
  tags text[] not null default '{}',
  transcript text,
  audio_path text, -- object path inside the 'call-recordings' bucket
  duration_seconds integer not null default 0,
  called_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calls_user_called_idx
  on calls (user_id, called_at desc);

create index if not exists calls_user_outcome_idx
  on calls (user_id, outcome);

alter table calls enable row level security;

drop policy if exists "calls_select_own" on calls;
create policy "calls_select_own" on calls
  for select using (auth.uid() = user_id);

drop policy if exists "calls_insert_own" on calls;
create policy "calls_insert_own" on calls
  for insert with check (auth.uid() = user_id);

drop policy if exists "calls_update_own" on calls;
create policy "calls_update_own" on calls
  for update using (auth.uid() = user_id);

drop policy if exists "calls_delete_own" on calls;
create policy "calls_delete_own" on calls
  for delete using (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function set_calls_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists calls_set_updated_at on calls;
create trigger calls_set_updated_at
  before update on calls
  for each row execute function set_calls_updated_at();

-- Private bucket for call audio. Files are stored under <user_id>/<call_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings',
  'call-recordings',
  false,
  104857600, -- 100 MB per file
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Each user can only touch files inside their own folder (first path segment = user id).
drop policy if exists "call_recordings_select_own" on storage.objects;
create policy "call_recordings_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "call_recordings_insert_own" on storage.objects;
create policy "call_recordings_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "call_recordings_update_own" on storage.objects;
create policy "call_recordings_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "call_recordings_delete_own" on storage.objects;
create policy "call_recordings_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
