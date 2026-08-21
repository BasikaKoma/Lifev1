-- Reduce WAL / Realtime pressure from health_metrics no-op updates.
-- Supabase Dashboard → SQL Editor (safe to re-run)

-- health_metrics does not need Realtime (single-user health data; focus-refresh in app).
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'health_metrics'
  ) then
    alter publication supabase_realtime drop table public.health_metrics;
  end if;
end $$;

-- Faster RLS on health_metrics (initplan).
drop policy if exists "health_metrics_select_own" on health_metrics;
create policy "health_metrics_select_own" on health_metrics
  for select using ((select auth.uid()) = user_id);

drop policy if exists "health_metrics_insert_own" on health_metrics;
create policy "health_metrics_insert_own" on health_metrics
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "health_metrics_update_own" on health_metrics;
create policy "health_metrics_update_own" on health_metrics
  for update using ((select auth.uid()) = user_id);

drop policy if exists "health_metrics_delete_own" on health_metrics;
create policy "health_metrics_delete_own" on health_metrics
  for delete using ((select auth.uid()) = user_id);

-- Upsert only when value/unit/payload actually changed (avoids WAL + Realtime noise).
create or replace function public.upsert_health_metrics_if_changed(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  affected integer := 0;
  row_count integer;
begin
  if rows is null or jsonb_array_length(rows) = 0 then
    return 0;
  end if;

  for r in select * from jsonb_array_elements(rows)
  loop
    insert into health_metrics (
      user_id, day, metric_type, value, unit, source, payload, recorded_at
    )
    values (
      (r->>'user_id')::uuid,
      (r->>'day')::date,
      r->>'metric_type',
      nullif(r->>'value', '')::numeric,
      nullif(r->>'unit', ''),
      r->>'source',
      coalesce(r->'payload', '{}'::jsonb),
      coalesce((r->>'recorded_at')::timestamptz, now())
    )
    on conflict (user_id, day, metric_type, source) do update set
      value = excluded.value,
      unit = excluded.unit,
      payload = excluded.payload,
      recorded_at = excluded.recorded_at
    where health_metrics.value is distinct from excluded.value
       or health_metrics.unit is distinct from excluded.unit
       or health_metrics.payload is distinct from excluded.payload;

    get diagnostics row_count = row_count;
    affected := affected + row_count;
  end loop;

  return affected;
end;
$$;

revoke all on function public.upsert_health_metrics_if_changed(jsonb) from public;
grant execute on function public.upsert_health_metrics_if_changed(jsonb) to authenticated, service_role;
