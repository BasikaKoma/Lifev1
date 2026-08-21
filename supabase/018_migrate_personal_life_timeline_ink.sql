-- Merge handwritten ink (canvas_ink) from "Personal Life Timeline" into the user's Lifeline.
-- Then delete the source project.
--
-- Prerequisites: run 017_lifelines_table.sql first.
-- IDs from projects_rows.csv export (user a86183d5-250f-4d4f-8b4f-8a96d8593553).
--
-- Safe to re-run only BEFORE the source project is deleted.
-- After delete, re-run will no-op (0 rows affected on merge).

begin;

-- ── Config (edit if your ids differ) ──────────────────────────────────────
-- Personal Life Timeline
-- Lifeline (migrated to public.lifelines, same uuid preserved)

do $$
declare
  v_source_id uuid := '6bd39dc2-c6ec-4453-bc62-882ececee9ab';
  v_lifeline_id uuid := '80b41806-3e9d-4ede-86ae-c44de7374d84';
  v_user_id uuid := 'a86183d5-250f-4d4f-8b4f-8a96d8593553';
  v_source_ink jsonb;
  v_source_wb jsonb;
  v_before int;
  v_after int;
begin
  select coalesce(canvas_ink, '[]'::jsonb), coalesce(whiteboard_strokes, '[]'::jsonb)
  into v_source_ink, v_source_wb
  from public.projects
  where id = v_source_id
    and user_id = v_user_id;

  if v_source_ink is null then
    raise notice 'Source project % not found (already deleted?) — skipping ink merge.', v_source_id;
  else
    select jsonb_array_length(coalesce(canvas_ink, '[]'::jsonb))
    into v_before
    from public.lifelines
    where id = v_lifeline_id and user_id = v_user_id;

    update public.lifelines l
    set
      canvas_ink = coalesce(l.canvas_ink, '[]'::jsonb) || v_source_ink,
      whiteboard_strokes = coalesce(l.whiteboard_strokes, '[]'::jsonb) || v_source_wb,
      updated_at = now()
    where l.id = v_lifeline_id
      and l.user_id = v_user_id;

    select jsonb_array_length(coalesce(canvas_ink, '[]'::jsonb))
    into v_after
    from public.lifelines
    where id = v_lifeline_id;

    raise notice 'Merged % canvas_ink strokes + % whiteboard strokes. Lifeline ink: % → %.',
      jsonb_array_length(v_source_ink),
      jsonb_array_length(v_source_wb),
      coalesce(v_before, 0),
      coalesce(v_after, 0);
  end if;

  delete from public.projects
  where id = v_source_id
    and user_id = v_user_id
    and is_lifeline = false;

  if found then
    raise notice 'Deleted project Personal Life Timeline (%).', v_source_id;
  else
    raise notice 'Source project already removed.';
  end if;
end $$;

commit;

-- Verify
select
  l.id,
  l.title,
  jsonb_array_length(coalesce(l.canvas_ink, '[]'::jsonb)) as ink_strokes,
  jsonb_array_length(coalesce(l.whiteboard_strokes, '[]'::jsonb)) as whiteboard_strokes,
  l.updated_at
from public.lifelines l
where l.id = '80b41806-3e9d-4ede-86ae-c44de7374d84';
