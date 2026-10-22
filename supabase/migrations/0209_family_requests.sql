-- Members can ask for a family to be created from the mobile app: a name, their own
-- role in it, and the other church members to put in it. Nothing is created until an
-- owner or admin approves the request (then the family and its people are made, as if
-- an admin had added them on the Families page).
create table if not exists public.family_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references public.members (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  notes text,
  -- The requester's role in the family, e.g. "Father".
  requester_relationship text not null check (length(trim(requester_relationship)) >= 2),
  -- The others: [{"member_id": "<uuid>", "relationship": "Wife"}]. Checked again on approval.
  people jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  family_id uuid references public.families (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request at a time per member.
create unique index if not exists family_requests_one_pending_idx
  on public.family_requests (requested_by) where status = 'pending';
create index if not exists family_requests_organization_id_idx
  on public.family_requests (organization_id, status);

drop trigger if exists set_family_requests_updated_at on public.family_requests;
create trigger set_family_requests_updated_at
  before update on public.family_requests
  for each row execute function public.set_updated_at();

alter table public.family_requests enable row level security;

-- Staff see every request of their church (the team app lists them); reviewing goes
-- through the web API with the service role. Members never touch the table directly:
-- their app talks to /api/mobile/families/*.
drop policy if exists "Org members can view family requests" on public.family_requests;
create policy "Org members can view family requests"
  on public.family_requests for select to authenticated
  using (public.is_org_member(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.family_requests;
