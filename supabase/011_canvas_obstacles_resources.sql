-- Run once in Supabase Dashboard → SQL Editor
-- Adds canvas obstacles/resources columns (safe to re-run)

alter table projects add column if not exists canvas_obstacles jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_resources jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
