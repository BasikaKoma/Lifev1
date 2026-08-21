-- Run once in Supabase Dashboard → SQL Editor
-- Adds ALL optional project columns (safe to re-run) + refreshes API cache

alter table projects add column if not exists notes jsonb not null default '[]'::jsonb;
alter table projects add column if not exists goals jsonb not null default '[]'::jsonb;
alter table projects add column if not exists backlog jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_connections jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_stickies jsonb not null default '[]'::jsonb;
alter table projects add column if not exists map_theme jsonb not null default '{}'::jsonb;
alter table projects add column if not exists canvas_ink jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_obstacles jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_resources jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_tasks jsonb not null default '[]'::jsonb;
alter table projects add column if not exists whiteboard_strokes jsonb not null default '[]'::jsonb;
alter table projects add column if not exists brief jsonb not null default '{}'::jsonb;

-- Refresh PostgREST schema cache so new columns are visible immediately
notify pgrst, 'reload schema';
