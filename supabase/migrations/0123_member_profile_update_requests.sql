-- Members can propose changes to their own personal details (first name,
-- last name, date of birth, marital status, wedding date) from the mobile
-- app's My Details screen — but never apply them directly. Each edit
-- becomes a request an admin has to approve before it actually changes
-- the members row. Email and phone are deliberately never editable this
-- way — phone especially is the member's own login identity
-- (members.auth_user_id, migration 0120), not just a contact field.
create table if not exists public.member_profile_update_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- Only the fields actually being changed, e.g. {"first_name": "Jonathan"}
  -- — validated server-side (allowed keys, date rules) before insert, see
  -- church-management-app's /api/mobile/member-auth/profile-update-request.
  proposed_changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request at a time per member — otherwise an admin reviewing
-- an old request could approve something the member already changed
-- their mind about in a newer, unreviewed one.
create unique index if not exists member_profile_update_requests_one_pending_idx
  on public.member_profile_update_requests (member_id)
  where status = 'pending';

create index if not exists member_profile_update_requests_organization_id_idx
  on public.member_profile_update_requests (organization_id);

drop trigger if exists set_member_profile_update_requests_updated_at on public.member_profile_update_requests;
create trigger set_member_profile_update_requests_updated_at
  before update on public.member_profile_update_requests
  for each row execute function public.set_updated_at();

alter table public.member_profile_update_requests enable row level security;

-- Staff can see every request for their org (so admins know what's
-- waiting); reviewing (approve/reject) is admin-only, same bar as
-- deleting a member outright. No insert/delete policy for the client
-- role at all — requests are created exclusively by the mobile app's own
-- backend route (service-role client, after verifying the member's
-- session and validating the proposed changes) and never deleted,
-- only ever moved to approved/rejected.
drop policy if exists "Org members can view profile update requests" on public.member_profile_update_requests;
create policy "Org members can view profile update requests"
  on public.member_profile_update_requests for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can review profile update requests" on public.member_profile_update_requests;
create policy "Admins can review profile update requests"
  on public.member_profile_update_requests for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- A linked member can see their OWN requests — so the mobile app can show
-- "awaiting approval" instead of letting them submit a second edit on top
-- of an unreviewed one.
drop policy if exists "Members can view their own profile update requests" on public.member_profile_update_requests;
create policy "Members can view their own profile update requests"
  on public.member_profile_update_requests for select to authenticated
  using (exists (select 1 from public.members where id = member_id and auth_user_id = auth.uid()));

-- Reversal (run manually if needed):
--   drop table if exists public.member_profile_update_requests;
