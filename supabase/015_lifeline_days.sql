-- Per-day journal on the Lifeline (notes + todos).
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

alter table public.projects
  add column if not exists lifeline_days jsonb not null default '{}'::jsonb;
