-- Separate strategic goals from roadmap milestones
alter table projects add column if not exists goals jsonb not null default '[]'::jsonb;
