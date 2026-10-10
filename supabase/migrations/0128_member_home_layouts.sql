-- Design Studio: what an organization shows on its members' mobile Home tab.
-- One row per org per status. Admins edit the 'draft' row; Publish copies
-- it into the 'published' row, which is the only one members' apps read.
-- Keeping them as separate rows (not two columns on one row) is what lets
-- the members' read policy see published content without ever being able
-- to select an unfinished draft.
--
-- layout shape (validated in src/lib/member-home/schema.ts, not here):
--   { "version": 1, "blocks": [ { "id", "type", ...block fields } ] }
create table if not exists public.member_home_layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null check (status in ('draft', 'published')),
  layout jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, status)
);

alter table public.member_home_layouts enable row level security;

-- Writes go through server actions on the service-role client, which check
-- the caller is an org owner/admin; these policies are the read side.
drop policy if exists "Admins can view member home layouts" on public.member_home_layouts;
create policy "Admins can view member home layouts"
  on public.member_home_layouts for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Linked members can view the published home layout" on public.member_home_layouts;
create policy "Linked members can view the published home layout"
  on public.member_home_layouts for select to authenticated
  using (status = 'published' and public.is_linked_member(organization_id));

-- The "Upcoming events" block reads the church's events from a member's
-- phone. A phone-OTP member has no organization_members row, so the
-- staff-only "Org members can view events" policy doesn't cover them.
drop policy if exists "Linked members can view their organization's events" on public.events;
create policy "Linked members can view their organization's events"
  on public.events for select to authenticated
  using (public.is_linked_member(organization_id));

-- Reversal (run manually if needed):
--   drop policy if exists "Linked members can view their organization's events" on public.events;
--   drop table if exists public.member_home_layouts;
