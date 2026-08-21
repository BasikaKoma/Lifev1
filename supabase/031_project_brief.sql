-- Project brief: identity, marketing, and agent instructions
alter table public.projects add column if not exists brief jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
