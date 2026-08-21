-- Public read bucket for lifev1 desktop auto-updates (latest.yml + installer).
-- Uploads are done locally via scripts/publish-update.cjs with the service_role key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-updates',
  'app-updates',
  true,
  524288000,
  array['application/octet-stream', 'text/yaml', 'application/x-yaml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read app updates" on storage.objects;
create policy "Public read app updates"
  on storage.objects
  for select
  to public
  using (bucket_id = 'app-updates');
