-- Optional migration: roadmap canvas theme settings
alter table projects add column if not exists map_theme jsonb not null default '{}'::jsonb;
