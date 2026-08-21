-- Merge orphaned lifeline rows (projects.is_lifeline) into canonical lifelines table, then delete orphans.
-- Safe to re-run: only merges when canonical is missing data that orphan has.

do $$
declare
  r record;
  orphan record;
begin
  for r in select id, user_id from public.lifelines loop
    for orphan in
      select p.*
      from public.projects p
      where p.user_id = r.user_id
        and p.is_lifeline = true
        and p.id <> r.id
    loop
      update public.lifelines l
      set
        stages = case
          when jsonb_array_length(coalesce(l.stages, '[]'::jsonb)) = 0
            and jsonb_array_length(coalesce(orphan.stages, '[]'::jsonb)) > 0
          then orphan.stages
          else l.stages
        end,
        lifeline_days = coalesce(orphan.lifeline_days, '{}'::jsonb) || coalesce(l.lifeline_days, '{}'::jsonb),
        map_theme = coalesce(l.map_theme, '{}'::jsonb) || coalesce(orphan.map_theme, '{}'::jsonb),
        canvas_ink = case
          when jsonb_array_length(coalesce(l.canvas_ink, '[]'::jsonb)) = 0
            and jsonb_array_length(coalesce(orphan.canvas_ink, '[]'::jsonb)) > 0
          then orphan.canvas_ink
          else l.canvas_ink
        end,
        updated_at = now()
      where l.id = r.id;

      delete from public.projects where id = orphan.id;
    end loop;
  end loop;
end $$;

-- Prevent future duplicate lifeline rows in projects table.
create unique index if not exists projects_one_lifeline_per_user_idx
  on public.projects (user_id)
  where is_lifeline = true;
