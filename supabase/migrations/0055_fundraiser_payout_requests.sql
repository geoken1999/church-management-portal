-- Lets a church formally ask for their 'shared'-mode collected balance to
-- be paid out, rather than only a platform operator deciding when to pay.
-- Still no automatic money movement — a request just surfaces on
-- /platform-admin/payouts; recording the actual payout (migration 0054)
-- resolves it.

create table if not exists public.fundraiser_payout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fundraiser_id uuid not null references public.fundraisers (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null,
  resolved_payout_id uuid references public.fundraiser_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open request per fundraiser at a time — a second "request
-- payout" click while one's already pending should be a no-op, not a
-- pile-up of duplicate requests for the same money.
create unique index if not exists fundraiser_payout_requests_one_pending_per_fundraiser
  on public.fundraiser_payout_requests (fundraiser_id)
  where status = 'pending';

create index if not exists fundraiser_payout_requests_organization_id_idx on public.fundraiser_payout_requests (organization_id);

drop trigger if exists set_fundraiser_payout_requests_updated_at on public.fundraiser_payout_requests;
create trigger set_fundraiser_payout_requests_updated_at
  before update on public.fundraiser_payout_requests
  for each row execute function public.set_updated_at();

create or replace function public.check_fundraiser_payout_request_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.fundraisers f where f.id = new.fundraiser_id and f.organization_id = new.organization_id
  ) then
    raise exception 'fundraiser_id must belong to the same organization as the payout request';
  end if;
  return new;
end;
$$;

drop trigger if exists check_fundraiser_payout_request_org on public.fundraiser_payout_requests;
create trigger check_fundraiser_payout_request_org
  before insert or update of fundraiser_id, organization_id on public.fundraiser_payout_requests
  for each row execute function public.check_fundraiser_payout_request_org();

alter table public.fundraiser_payout_requests enable row level security;

-- Same shape as fundraisers/donations (migration 0041): RLS floor is
-- admin-only; the app's checkTabAccess (fundraisers, write) is what
-- actually lets a delegated non-admin staff login through, via the
-- service-role client in requestFundraiserPayout/cancelFundraiserPayoutRequest.
drop policy if exists "Org members can view fundraiser payout requests" on public.fundraiser_payout_requests;
create policy "Org members can view fundraiser payout requests"
  on public.fundraiser_payout_requests for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create fundraiser payout requests" on public.fundraiser_payout_requests;
create policy "Admins can create fundraiser payout requests"
  on public.fundraiser_payout_requests for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update fundraiser payout requests" on public.fundraiser_payout_requests;
create policy "Admins can update fundraiser payout requests"
  on public.fundraiser_payout_requests for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
