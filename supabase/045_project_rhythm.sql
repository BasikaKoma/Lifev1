-- Recurring daily/weekly actions per project. Not part of the Lifeline.
alter table public.projects add column if not exists recurring jsonb not null default '{"items":[],"logs":{}}'::jsonb;

notify pgrst, 'reload schema';
