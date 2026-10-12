-- Account deletion requests raised from the mobile app. Nothing is deleted
-- when a request is raised: it waits for an admin to process it.
--   member - a church member who signs in with their phone: their church's
--            owner/admin processes it;
--   team   - a team member (email login): their church's owner/admin;
--   owner  - a church owner: only a platform admin can process it (their
--            church may need handling first).
-- The requester's name and contact are copied onto the request, so it can
-- still be read after the account is gone. auth_user_id deliberately has no
-- foreign key for the same reason.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  requester_kind text not null check (requester_kind in ('member', 'team', 'owner')),
  member_id uuid references public.members (id) on delete set null,
  display_name text not null,
  contact text,
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  -- What was done: 'account_deleted', 'account_and_member_deleted',
  -- 'removed_from_church', or 'declined'.
  outcome text,
  processed_note text,
  processed_by uuid,
  processed_at timestamptz,
  requested_at timestamptz not null default now()
);

-- One open request per person.
create unique index if not exists account_deletion_requests_one_pending_idx
  on public.account_deletion_requests (auth_user_id) where status = 'pending';
create index if not exists account_deletion_requests_org_idx on public.account_deletion_requests (organization_id, requested_at desc);

alter table public.account_deletion_requests enable row level security;

-- A person sees their own request (so the app can show its status); a
-- church's owners and admins see its requests. Creating and processing go
-- through the server with the service role.
drop policy if exists "People can view their own deletion request" on public.account_deletion_requests;
create policy "People can view their own deletion request"
  on public.account_deletion_requests for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "Admins can view their church's deletion requests" on public.account_deletion_requests;
create policy "Admins can view their church's deletion requests"
  on public.account_deletion_requests for select to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.account_deletion_requests;
