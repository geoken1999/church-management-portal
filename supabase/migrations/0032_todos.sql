-- Shared team to-do list. Unlike most other modules in this app, this is
-- deliberately NOT admin-gated for writes — it's a lightweight
-- collaborative task list for the whole team, closer in spirit to a
-- shared sticky-note board than a sensitive/bulk action, so any org
-- member can create, complete, or delete any to-do in their org.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  -- Both reference profiles.auth_user_id (not auth.users.id) so PostgREST
  -- can embed each person's name — same pattern as other tables in this
  -- app that need a person's display name via a join.
  assigned_to uuid references public.profiles (auth_user_id) on delete set null,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todos_organization_id_due_at_idx
  on public.todos (organization_id, due_at);

drop trigger if exists set_todos_updated_at on public.todos;
create trigger set_todos_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

alter table public.todos enable row level security;

drop policy if exists "Members can view their org's todos" on public.todos;
create policy "Members can view their org's todos"
  on public.todos for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create todos" on public.todos;
create policy "Members can create todos"
  on public.todos for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update todos" on public.todos;
create policy "Members can update todos"
  on public.todos for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can delete todos" on public.todos;
create policy "Members can delete todos"
  on public.todos for delete to authenticated
  using (public.is_org_member(organization_id));
