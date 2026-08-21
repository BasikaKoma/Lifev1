-- Lifeline: central timeline project + anchor dates for other projects.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

alter table public.projects
  add column if not exists is_lifeline boolean not null default false;

alter table public.projects
  add column if not exists lifeline_anchor_date date;

create index if not exists projects_is_lifeline_idx
  on public.projects (user_id, is_lifeline)
  where is_lifeline = true;
