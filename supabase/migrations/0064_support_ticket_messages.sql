-- Two-way replies on a support ticket — the org side raises/views tickets
-- (migration 0046) but until now there was no way for the platform admin
-- to actually respond in-app, or for the org to reply back. Each row is
-- one message in the thread, tagged by who wrote it.
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  -- Denormalized from support_tickets.organization_id, same reasoning as
  -- form_responses.organization_id — avoids a join to support_tickets for
  -- RLS on every row.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_type text not null check (author_type in ('org', 'admin')),
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) >= 1),
  created_at timestamptz not null default now()
);

-- A second FK purely so PostgREST can embed `profiles` in one query, same
-- pattern as support_tickets_profile_fk (migration 0046). Only meaningful
-- for author_type = 'org' rows — the platform admin's messages are shown
-- under a fixed "KingdomFlow Support" label instead (they may not even
-- have a profile row for the org they're replying into).
alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_profile_fk,
  add constraint support_ticket_messages_profile_fk
    foreign key (author_id) references public.profiles (auth_user_id) on delete set null;

create index if not exists support_ticket_messages_ticket_id_idx on public.support_ticket_messages (ticket_id);
create index if not exists support_ticket_messages_organization_id_idx on public.support_ticket_messages (organization_id);

alter table public.support_ticket_messages enable row level security;

drop policy if exists "Members can view ticket messages" on public.support_ticket_messages;
create policy "Members can view ticket messages"
  on public.support_ticket_messages for select to authenticated
  using (public.is_org_member(organization_id));

-- Org members can only ever post as themselves ('org') — the platform
-- admin's replies ('admin') are written exclusively through the
-- service-role client, which bypasses RLS entirely, so there's nothing
-- stopping a member from claiming author_type = 'admin' except this check.
drop policy if exists "Members can reply to their own tickets" on public.support_ticket_messages;
create policy "Members can reply to their own tickets"
  on public.support_ticket_messages for insert to authenticated
  with check (public.is_org_member(organization_id) and author_type = 'org');

-- Lets a ticket's creator (or an org admin) close it themselves once
-- they're satisfied, or reopen it — 'in_progress'/'resolved' stay
-- admin-only (set via the service-role client on the Super Admin side),
-- since those signal actual triage work having happened.
drop policy if exists "Creators and admins can close their support tickets" on public.support_tickets;
create policy "Creators and admins can close their support tickets"
  on public.support_tickets for update to authenticated
  using (created_by = auth.uid() or public.is_org_admin(organization_id))
  with check (status in ('open', 'closed'));
