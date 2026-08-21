-- Migration: add notes column (run if you already created projects table)
alter table projects add column if not exists notes jsonb not null default '[]'::jsonb;
