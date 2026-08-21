-- Run once in Supabase Dashboard → SQL Editor
-- Safe to re-run. Use THIS if projects table already exists.

alter table projects add column if not exists goals jsonb not null default '[]'::jsonb;
alter table projects add column if not exists notes jsonb not null default '[]'::jsonb;
alter table projects add column if not exists backlog jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_connections jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_stickies jsonb not null default '[]'::jsonb;
alter table projects add column if not exists map_theme jsonb not null default '{}'::jsonb;

-- Refresh PostgREST schema cache so new columns are visible immediately
notify pgrst, 'reload schema';
