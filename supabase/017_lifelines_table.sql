-- Lifeline: dedicated table (one row per user).
-- Migrates existing is_lifeline projects rows, then removes them from projects.
-- Run in Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists public.lifelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Lifeline',
  stages jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  active_view text not null default 'roadmap',
  focus_mode boolean not null default false,
  selected_stage_id text,
  notes jsonb not null default '[]'::jsonb,
  backlog jsonb not null default '[]'::jsonb,
  canvas_connections jsonb not null default '[]'::jsonb,
  canvas_stickies jsonb not null default '[]'::jsonb,
  canvas_obstacles jsonb not null default '[]'::jsonb,
  canvas_resources jsonb not null default '[]'::jsonb,
  canvas_tasks jsonb not null default '[]'::jsonb,
  canvas_ink jsonb not null default '[]'::jsonb,
  whiteboard_strokes jsonb not null default '[]'::jsonb,
  map_theme jsonb not null default '{}'::jsonb,
  lifeline_days jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifelines_one_per_user unique (user_id)
);

create index if not exists lifelines_user_id_idx on public.lifelines (user_id);
create index if not exists lifelines_updated_at_idx on public.lifelines (updated_at desc);

alter table public.lifelines enable row level security;

drop policy if exists "lifelines_select_own" on public.lifelines;
drop policy if exists "lifelines_insert_own" on public.lifelines;
drop policy if exists "lifelines_update_own" on public.lifelines;
drop policy if exists "lifelines_delete_own" on public.lifelines;

create policy "lifelines_select_own" on public.lifelines
  for select using (auth.uid() = user_id);

create policy "lifelines_insert_own" on public.lifelines
  for insert with check (auth.uid() = user_id);

create policy "lifelines_update_own" on public.lifelines
  for update using (auth.uid() = user_id);

create policy "lifelines_delete_own" on public.lifelines
  for delete using (auth.uid() = user_id);

drop trigger if exists lifelines_updated_at on public.lifelines;
create trigger lifelines_updated_at
  before update on public.lifelines
  for each row execute function public.set_updated_at();

-- Migrate keeper Lifeline row per user (oldest created_at), preserve id for client cache.
insert into public.lifelines (
  id,
  user_id,
  title,
  stages,
  goals,
  active_view,
  focus_mode,
  selected_stage_id,
  notes,
  backlog,
  canvas_connections,
  canvas_stickies,
  canvas_obstacles,
  canvas_resources,
  canvas_tasks,
  canvas_ink,
  whiteboard_strokes,
  map_theme,
  lifeline_days,
  created_at,
  updated_at
)
select distinct on (p.user_id)
  p.id,
  p.user_id,
  coalesce(nullif(trim(p.title), ''), 'Lifeline'),
  coalesce(p.stages, '[]'::jsonb),
  coalesce(p.goals, '[]'::jsonb),
  coalesce(nullif(trim(p.active_view), ''), 'roadmap'),
  coalesce(p.focus_mode, false),
  p.selected_stage_id,
  coalesce(p.notes, '[]'::jsonb),
  coalesce(p.backlog, '[]'::jsonb),
  coalesce(p.canvas_connections, '[]'::jsonb),
  coalesce(p.canvas_stickies, '[]'::jsonb),
  coalesce(p.canvas_obstacles, '[]'::jsonb),
  coalesce(p.canvas_resources, '[]'::jsonb),
  '[]'::jsonb,
  coalesce(p.canvas_ink, '[]'::jsonb),
  coalesce(p.whiteboard_strokes, '[]'::jsonb),
  coalesce(p.map_theme, '{}'::jsonb),
  coalesce(p.lifeline_days, '{}'::jsonb),
  p.created_at,
  p.updated_at
from public.projects p
where p.is_lifeline = true
  and p.user_id is not null
order by p.user_id, p.created_at asc
on conflict (user_id) do update set
  title = excluded.title,
  stages = excluded.stages,
  goals = excluded.goals,
  active_view = excluded.active_view,
  focus_mode = excluded.focus_mode,
  selected_stage_id = excluded.selected_stage_id,
  notes = excluded.notes,
  backlog = excluded.backlog,
  canvas_connections = excluded.canvas_connections,
  canvas_stickies = excluded.canvas_stickies,
  canvas_obstacles = excluded.canvas_obstacles,
  canvas_resources = excluded.canvas_resources,
  canvas_tasks = excluded.canvas_tasks,
  canvas_ink = excluded.canvas_ink,
  whiteboard_strokes = excluded.whiteboard_strokes,
  map_theme = excluded.map_theme,
  lifeline_days = excluded.lifeline_days,
  updated_at = now();

-- Remove duplicate Lifeline projects (keep migrated id).
delete from public.projects p
using public.lifelines l
where p.is_lifeline = true
  and p.user_id = l.user_id
  and p.id <> l.id;

-- Remove migrated Lifeline rows from projects.
delete from public.projects p
using public.lifelines l
where p.is_lifeline = true
  and p.user_id = l.user_id
  and p.id = l.id;

drop index if exists public.projects_one_lifeline_per_user_idx;

-- Realtime sync for Lifeline (multi-device).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lifelines'
  ) then
    alter publication supabase_realtime add table public.lifelines;
  end if;
end $$;
