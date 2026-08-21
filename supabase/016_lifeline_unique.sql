-- One Lifeline project per user (prevents StrictMode / race duplicates).
-- Safe to re-run.

delete from public.projects p
using public.projects keeper
where p.is_lifeline = true
  and keeper.is_lifeline = true
  and p.user_id = keeper.user_id
  and p.id <> keeper.id
  and p.created_at > keeper.created_at;

create unique index if not exists projects_one_lifeline_per_user_idx
  on public.projects (user_id)
  where is_lifeline = true;
