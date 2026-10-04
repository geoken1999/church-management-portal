-- Two tweaks to paid event registration (migration 0105):
--
-- 1. Payout requests for platform-gateway events, exact structural mirror
--    of the Fund Raiser shared-payout system (migrations 0054/0055):
--    event_payouts is a manual ledger a platform operator writes to after
--    wiring money to the church externally; event_payout_requests lets an
--    organizer ask for that to happen. Nothing here moves money
--    automatically — same model as fundraiser payouts. Unlike
--    fundraiser_payouts (which migration 0077 had to retrofit an RLS
--    policy onto after it silently broke the org-facing balance query),
--    event_payouts gets its org-member SELECT policy from day one.
--
-- 2. A third payment_timing option, 'both' — the organizer isn't choosing
--    for every visitor; each visitor picks for themselves at registration
--    time whether to pay now or at check-in. Handled in application code
--    by always withholding the pass until the visitor's choice resolves
--    (same as 'before_registration'), then sending it immediately once
--    they either pay or explicitly defer to check-in.

create table if not exists public.event_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  paid_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_payouts_event_id_idx on public.event_payouts (event_id);

alter table public.event_payouts enable row level security;

drop policy if exists "Org members can view event payouts" on public.event_payouts;
create policy "Org members can view event payouts"
  on public.event_payouts for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.event_payout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null,
  resolved_payout_id uuid references public.event_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open request per event at a time.
create unique index if not exists event_payout_requests_one_pending_per_event
  on public.event_payout_requests (event_id)
  where status = 'pending';

create index if not exists event_payout_requests_organization_id_idx on public.event_payout_requests (organization_id);

drop trigger if exists set_event_payout_requests_updated_at on public.event_payout_requests;
create trigger set_event_payout_requests_updated_at
  before update on public.event_payout_requests
  for each row execute function public.set_updated_at();

alter table public.event_payout_requests enable row level security;

drop policy if exists "Org members can view event payout requests" on public.event_payout_requests;
create policy "Org members can view event payout requests"
  on public.event_payout_requests for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create event payout requests" on public.event_payout_requests;
create policy "Admins can create event payout requests"
  on public.event_payout_requests for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update event payout requests" on public.event_payout_requests;
create policy "Admins can update event payout requests"
  on public.event_payout_requests for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Belt-and-braces org-consistency triggers, same pattern as
-- check_fundraiser_payout_org/check_fundraiser_payout_request_org.
create or replace function public.check_event_payout_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'event_id must belong to the same organization as the payout';
  end if;
  return new;
end;
$$;

drop trigger if exists check_event_payout_org on public.event_payouts;
create trigger check_event_payout_org
  before insert or update of event_id, organization_id on public.event_payouts
  for each row execute function public.check_event_payout_org();

create or replace function public.check_event_payout_request_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'event_id must belong to the same organization as the payout request';
  end if;
  return new;
end;
$$;

drop trigger if exists check_event_payout_request_org on public.event_payout_requests;
create trigger check_event_payout_request_org
  before insert or update of event_id, organization_id on public.event_payout_requests
  for each row execute function public.check_event_payout_request_org();

-- Third payment_timing option: 'both'. Postgres auto-names migration
-- 0105's inline column check "events_payment_timing_check" — drop/recreate
-- it to widen the allowed set.
alter table public.events drop constraint if exists events_payment_timing_check;
alter table public.events add constraint events_payment_timing_check
  check (payment_timing is null or payment_timing in ('before_registration', 'at_checkin', 'both'));
