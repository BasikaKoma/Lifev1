-- Meta publish log + publish-capability flags on get_my_meta_status.
-- Private brand-publish bucket; Meta fetches a short-lived signed URL.
-- Supabase Dashboard → SQL Editor (safe to re-run).

create table if not exists meta_publishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text,
  platform text not null check (platform in ('facebook', 'instagram')),
  page_id text,
  ig_user_id text,
  media_id text,
  permalink text,
  caption text,
  image_url text,
  status text not null default 'published',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists meta_publishes_user_idx
  on meta_publishes (user_id, created_at desc);

alter table meta_publishes enable row level security;

drop policy if exists "meta_publishes_select_own" on meta_publishes;
create policy "meta_publishes_select_own" on meta_publishes
  for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_my_meta_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  conn public.meta_connections%rowtype;
  dests json;
  fb json;
  ig json;
  page_count int;
  ig_count int;
  fb_selected int;
  has_fb_publish boolean;
  has_ig_publish boolean;
begin
  select * into conn
  from public.meta_connections
  where user_id = auth.uid();

  if not found then
    return json_build_object(
      'connected', false,
      'connected_at', null,
      'token_valid', false,
      'expires_soon', false,
      'scopes', null,
      'fb_user_id', null,
      'needs_page_pick', false,
      'missing_instagram', false,
      'missing_pages', false,
      'can_publish_facebook', false,
      'can_publish_instagram', false,
      'needs_publish_reconnect', false,
      'facebook', null,
      'instagram', null,
      'destinations', '[]'::json
    );
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'page_id', d.page_id,
        'page_name', d.page_name,
        'ig_user_id', d.ig_user_id,
        'ig_username', d.ig_username,
        'selected_for_facebook', d.selected_for_facebook,
        'selected_for_instagram', d.selected_for_instagram
      )
      order by d.page_name
    ),
    '[]'::json
  )
  into dests
  from public.meta_destinations d
  where d.user_id = auth.uid();

  select json_build_object('page_id', page_id, 'page_name', page_name)
  into fb
  from public.meta_destinations
  where user_id = auth.uid() and selected_for_facebook
  limit 1;

  select json_build_object(
    'ig_user_id', ig_user_id,
    'ig_username', ig_username,
    'page_id', page_id,
    'page_name', page_name
  )
  into ig
  from public.meta_destinations
  where user_id = auth.uid()
    and selected_for_instagram
    and ig_user_id is not null
  limit 1;

  select count(*) into page_count
  from public.meta_destinations
  where user_id = auth.uid();

  select count(*) into ig_count
  from public.meta_destinations
  where user_id = auth.uid() and ig_user_id is not null;

  select count(*) into fb_selected
  from public.meta_destinations
  where user_id = auth.uid() and selected_for_facebook;

  has_fb_publish := position('pages_manage_posts' in coalesce(conn.scopes, '')) > 0;
  has_ig_publish := position('instagram_content_publish' in coalesce(conn.scopes, '')) > 0;

  return json_build_object(
    'connected', true,
    'connected_at', conn.connected_at,
    'token_valid', conn.user_token_expires_at > now(),
    'expires_soon', conn.user_token_expires_at < now() + interval '7 days',
    'scopes', conn.scopes,
    'fb_user_id', conn.fb_user_id,
    'needs_page_pick', page_count > 0 and fb_selected = 0,
    'missing_instagram', ig_count = 0,
    'missing_pages', page_count = 0,
    'can_publish_facebook', has_fb_publish and fb is not null,
    'can_publish_instagram', has_ig_publish and ig is not null,
    'needs_publish_reconnect', not has_fb_publish and not has_ig_publish,
    'facebook', fb,
    'instagram', ig,
    'destinations', dests
  );
end;
$$;

grant execute on function public.get_my_meta_status() to authenticated;
revoke execute on function public.get_my_meta_status() from public, anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-publish',
  'brand-publish',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "brand_publish_public_read" on storage.objects;
drop policy if exists "brand_publish_select_own" on storage.objects;
create policy "brand_publish_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'brand-publish' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_publish_insert_own" on storage.objects;
create policy "brand_publish_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-publish' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_publish_update_own" on storage.objects;
create policy "brand_publish_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'brand-publish' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "brand_publish_delete_own" on storage.objects;
create policy "brand_publish_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brand-publish' and (storage.foldername(name))[1] = auth.uid()::text);
