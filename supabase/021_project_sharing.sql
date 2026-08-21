-- Shared projects: invite collaborators (editors only, max 3, no Lifeline sharing)
-- Run in Supabase Dashboard → SQL Editor after prior migrations.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  email text,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create index if not exists project_invites_project_id_idx on public.project_invites (project_id);
create index if not exists project_invites_email_idx on public.project_invites (lower(email))
  where email is not null and accepted_at is null;

alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.user_id = auth.uid()
      and coalesce(p.is_lifeline, false) = false
  );
$$;

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and coalesce(p.is_lifeline, false) = false
      and (
        p.user_id = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.project_member_count(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.project_members
  where project_id = p_project_id;
$$;

-- ---------------------------------------------------------------------------
-- Member limit (max 3 collaborators, owner not counted)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_project_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  select count(*) into member_count
  from public.project_members
  where project_id = new.project_id;

  if member_count >= 3 then
    raise exception 'This project already has the maximum number of collaborators (3)';
  end if;

  return new;
end;
$$;

drop trigger if exists project_members_limit on public.project_members;
create trigger project_members_limit
  before insert on public.project_members
  for each row execute function public.enforce_project_member_limit();

-- ---------------------------------------------------------------------------
-- Projects RLS (replace per-user-only policies)
-- ---------------------------------------------------------------------------

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;

create policy "projects_select" on public.projects
  for select using (
    (auth.uid() = user_id and coalesce(is_lifeline, false) = true)
    or (
      coalesce(is_lifeline, false) = false
      and (
        auth.uid() = user_id
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = projects.id and pm.user_id = auth.uid()
        )
      )
    )
  );

create policy "projects_insert_own" on public.projects
  for insert with check (
    auth.uid() = user_id
    and coalesce(is_lifeline, false) = false
  );

create policy "projects_update" on public.projects
  for update using (
    (auth.uid() = user_id and coalesce(is_lifeline, false) = true)
    or (
      coalesce(is_lifeline, false) = false
      and (
        auth.uid() = user_id
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = projects.id and pm.user_id = auth.uid()
        )
      )
    )
  );

create policy "projects_delete_own" on public.projects
  for delete using (
    auth.uid() = user_id
    and coalesce(is_lifeline, false) = false
  );

-- ---------------------------------------------------------------------------
-- Profiles: allow reading co-members on shared projects
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_coworkers" on public.profiles;

create policy "profiles_select_coworkers" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1
      from public.project_members pm_self
      join public.project_members pm_other
        on pm_self.project_id = pm_other.project_id
      where pm_self.user_id = auth.uid()
        and pm_other.user_id = profiles.id
    )
    or exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where p.user_id = auth.uid()
        and pm.user_id = profiles.id
    )
    or exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where pm.user_id = auth.uid()
        and p.user_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- project_members RLS
-- ---------------------------------------------------------------------------

drop policy if exists "project_members_select" on public.project_members;
drop policy if exists "project_members_delete" on public.project_members;

create policy "project_members_select" on public.project_members
  for select using (public.can_access_project(project_id));

create policy "project_members_delete" on public.project_members
  for delete using (
    public.is_project_owner(project_id)
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- project_invites RLS
-- ---------------------------------------------------------------------------

drop policy if exists "project_invites_select" on public.project_invites;
drop policy if exists "project_invites_insert" on public.project_invites;
drop policy if exists "project_invites_delete" on public.project_invites;

create policy "project_invites_select" on public.project_invites
  for select using (
    public.is_project_owner(project_id)
    or (
      email is not null
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and accepted_at is null
    )
  );

create policy "project_invites_insert" on public.project_invites
  for insert with check (public.is_project_owner(project_id));

create policy "project_invites_delete" on public.project_invites
  for delete using (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- RPC: invite by email (add existing user or create pending invite)
-- ---------------------------------------------------------------------------

create or replace function public.invite_project_by_email(p_project_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_target uuid;
  v_token text;
  v_invite_id uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated';
  end if;

  if v_email = '' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Invalid email address';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can invite collaborators';
  end if;

  if exists (
    select 1 from public.projects
    where id = p_project_id and coalesce(is_lifeline, false) = true
  ) then
    raise exception 'Lifeline projects cannot be shared';
  end if;

  if exists (
    select 1 from public.projects p
    join auth.users u on u.id = p.user_id
    where p.id = p_project_id and lower(u.email) = v_email
  ) then
    raise exception 'You cannot invite yourself';
  end if;

  if public.project_member_count(p_project_id) >= 3 then
    raise exception 'This project already has the maximum number of collaborators (3)';
  end if;

  select id into v_target
  from public.profiles
  where lower(email) = v_email
  limit 1;

  if v_target is not null then
    if exists (
      select 1 from public.project_members
      where project_id = p_project_id and user_id = v_target
    ) then
      raise exception 'This user is already a collaborator';
    end if;

    insert into public.project_members (project_id, user_id, invited_by)
    values (p_project_id, v_target, v_owner);

    return jsonb_build_object('status', 'added', 'user_id', v_target);
  end if;

  if exists (
    select 1 from public.project_invites
    where project_id = p_project_id
      and lower(email) = v_email
      and accepted_at is null
      and expires_at > now()
  ) then
    select token into v_token
    from public.project_invites
    where project_id = p_project_id
      and lower(email) = v_email
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;

    return jsonb_build_object('status', 'pending', 'token', v_token);
  end if;

  insert into public.project_invites (project_id, email, invited_by)
  values (p_project_id, v_email, v_owner)
  returning id, token into v_invite_id, v_token;

  return jsonb_build_object('status', 'pending', 'token', v_token, 'invite_id', v_invite_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create / refresh open share link (anyone with link, no email lock)
-- ---------------------------------------------------------------------------

create or replace function public.create_project_share_link(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_token text;
  v_invite_id uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can create a share link';
  end if;

  if exists (
    select 1 from public.projects
    where id = p_project_id and coalesce(is_lifeline, false) = true
  ) then
    raise exception 'Lifeline projects cannot be shared';
  end if;

  if public.project_member_count(p_project_id) >= 3 then
    raise exception 'This project already has the maximum number of collaborators (3)';
  end if;

  select token, id into v_token, v_invite_id
  from public.project_invites
  where project_id = p_project_id
    and email is null
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_token is null then
    insert into public.project_invites (project_id, invited_by)
    values (p_project_id, v_owner)
    returning token, id into v_token, v_invite_id;
  end if;

  return jsonb_build_object('token', v_token, 'invite_id', v_invite_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accept invite (email or link)
-- ---------------------------------------------------------------------------

create or replace function public.accept_project_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.project_invites%rowtype;
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.project_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invalid or expired invite link';
  end if;

  if exists (
    select 1 from public.projects
    where id = v_invite.project_id and coalesce(is_lifeline, false) = true
  ) then
    raise exception 'Lifeline projects cannot be shared';
  end if;

  select lower(email) into v_user_email from auth.users where id = v_user_id;

  if v_invite.email is not null and lower(v_invite.email) <> v_user_email then
    raise exception 'This invite was sent to a different email address';
  end if;

  if exists (
    select 1 from public.projects
    where id = v_invite.project_id and user_id = v_user_id
  ) then
    update public.project_invites
    set accepted_at = now(), accepted_by = v_user_id
    where id = v_invite.id;

    return jsonb_build_object(
      'project_id', v_invite.project_id,
      'already_member', true
    );
  end if;

  if exists (
    select 1 from public.project_members
    where project_id = v_invite.project_id and user_id = v_user_id
  ) then
    update public.project_invites
    set accepted_at = now(), accepted_by = v_user_id
    where id = v_invite.id;

    return jsonb_build_object(
      'project_id', v_invite.project_id,
      'already_member', true
    );
  end if;

  if public.project_member_count(v_invite.project_id) >= 3 then
    raise exception 'This project already has the maximum number of collaborators (3)';
  end if;

  insert into public.project_members (project_id, user_id, invited_by)
  values (v_invite.project_id, v_user_id, v_invite.invited_by);

  update public.project_invites
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invite.id;

  return jsonb_build_object(
    'project_id', v_invite.project_id,
    'already_member', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: remove collaborator (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can remove collaborators';
  end if;

  delete from public.project_members
  where project_id = p_project_id and user_id = p_user_id;
end;
$$;

grant execute on function public.invite_project_by_email(uuid, text) to authenticated;
grant execute on function public.create_project_share_link(uuid) to authenticated;
grant execute on function public.accept_project_invite(text) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
