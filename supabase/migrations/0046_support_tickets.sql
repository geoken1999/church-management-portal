-- Support tickets — raising and viewing only for now. There's no
-- in-app reply/assignment workflow yet (see the Documentation page's
-- "Known Limitations" article) — status exists for when that's built,
-- but nothing currently transitions it away from 'open'.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  subject text not null check (length(trim(subject)) >= 3),
  description text not null check (length(trim(description)) >= 10),
  category text not null check (category in ('technical', 'billing', 'feature_request', 'account', 'other')),
  urgency text not null default 'medium' check (urgency in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_organization_id_idx on public.support_tickets (organization_id);

-- A second FK (alongside the one to auth.users above) purely so PostgREST
-- can embed `profiles` through support_tickets in a single query — same
-- pattern as organization_members_profile_fk in migration 0002.
alter table public.support_tickets
  drop constraint if exists support_tickets_profile_fk,
  add constraint support_tickets_profile_fk
    foreign key (created_by) references public.profiles (auth_user_id) on delete set null;

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;

-- Any org member can raise and see tickets — visible org-wide (not just
-- your own) so a team doesn't file duplicates and admins can see what's
-- been raised, same shared-visibility model as Todos.
drop policy if exists "Members can view support tickets" on public.support_tickets;
create policy "Members can view support tickets"
  on public.support_tickets for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can raise support tickets" on public.support_tickets;
create policy "Members can raise support tickets"
  on public.support_tickets for insert to authenticated
  with check (public.is_org_member(organization_id));

-- Withdrawing a ticket is limited to whoever raised it, or an admin.
drop policy if exists "Creators and admins can delete support tickets" on public.support_tickets;
create policy "Creators and admins can delete support tickets"
  on public.support_tickets for delete to authenticated
  using (created_by = auth.uid() or public.is_org_admin(organization_id));
