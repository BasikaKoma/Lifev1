-- Separate strategic goals from project milestones
alter table projects add column if not exists goals jsonb not null default '[]'::jsonb;
