-- Optional migration: canvas idea backlog (run in Supabase SQL Editor)
alter table projects add column if not exists backlog jsonb not null default '[]'::jsonb;
