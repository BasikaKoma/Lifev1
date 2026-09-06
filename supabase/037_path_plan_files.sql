-- Keep imported Path plan PDFs so they can be reopened later.
-- Files are stored under <user_id>/<file_id>.pdf in the private path-plans bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'path-plans',
  'path-plans',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "path_plans_select_own" on storage.objects;
create policy "path_plans_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'path-plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "path_plans_insert_own" on storage.objects;
create policy "path_plans_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'path-plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "path_plans_update_own" on storage.objects;
create policy "path_plans_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'path-plans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "path_plans_delete_own" on storage.objects;
create policy "path_plans_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'path-plans' and (storage.foldername(name))[1] = auth.uid()::text);
