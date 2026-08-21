-- Adds canvas_tasks to projects (was only on lifelines table in some deployments)
alter table public.projects add column if not exists canvas_tasks jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
