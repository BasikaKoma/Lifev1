-- Run once in Supabase Dashboard → SQL Editor
-- Adds canvas tasks column (safe to re-run)

alter table projects add column if not exists canvas_tasks jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
