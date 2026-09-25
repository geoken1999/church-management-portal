-- Fund Raiser payment links: donors give any amount they choose via a
-- public, masked link per fundraiser (/give/{share_token}). Two payout
-- models, chosen per fundraiser:
--   - 'own': the church's own Razorpay account (credentials in
--     organization_razorpay_accounts) receives funds directly — the
--     platform never touches the money for these.
--   - 'shared': the platform's own Razorpay account (RAZORPAY_KEY_ID/
--     SECRET — same account already used for subscription billing)
--     collects on the church's behalf. fundraiser_payouts is a manual
--     ledger only: a platform operator wires the money externally and
--     records it here afterwards. Nothing in this schema moves money
--     automatically for 'shared' mode.

alter table public.fundraisers
  add column if not exists payment_mode text check (payment_mode is null or payment_mode in ('own', 'shared')),
  add column if not exists payment_link_enabled boolean not null default false,
  add column if not exists share_token uuid not null default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fundraisers_share_token_key') then
    alter table public.fundraisers add constraint fundraisers_share_token_key unique (share_token);
  end if;
end $$;

-- Records which payment mode actually produced a given donation — null
-- for manually-entered donations, same as before this migration.
alter table public.donations
  add column if not exists payment_mode text check (payment_mode is null or payment_mode in ('own', 'shared'));

-- One Razorpay account per org, for 'own' mode fundraisers. key_secret is
-- as sensitive as a password — admin-only end to end, same sensitivity
-- model as youtube_connections/instagram_connections.
create table if not exists public.organization_razorpay_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key_id text not null,
  key_secret text not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

drop trigger if exists set_organization_razorpay_accounts_updated_at on public.organization_razorpay_accounts;
create trigger set_organization_razorpay_accounts_updated_at
  before update on public.organization_razorpay_accounts
  for each row execute function public.set_updated_at();

alter table public.organization_razorpay_accounts enable row level security;

drop policy if exists "Admins can view their Razorpay account" on public.organization_razorpay_accounts;
create policy "Admins can view their Razorpay account"
  on public.organization_razorpay_accounts for select to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Admins can connect their Razorpay account" on public.organization_razorpay_accounts;
create policy "Admins can connect their Razorpay account"
  on public.organization_razorpay_accounts for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update their Razorpay account" on public.organization_razorpay_accounts;
create policy "Admins can update their Razorpay account"
  on public.organization_razorpay_accounts for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove their Razorpay account" on public.organization_razorpay_accounts;
create policy "Admins can remove their Razorpay account"
  on public.organization_razorpay_accounts for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Every payment attempt against a fundraiser's giving link, whether it
-- completes or not. The public giving flow has no authenticated session,
-- so every write goes through the service-role client — there is
-- deliberately no insert/update policy for `authenticated` here.
create table if not exists public.fundraiser_payment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fundraiser_id uuid not null references public.fundraisers (id) on delete cascade,
  razorpay_order_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_mode text not null check (payment_mode in ('own', 'shared')),
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  razorpay_payment_id text,
  donor_name text not null,
  donor_email text,
  donor_phone text,
  donation_id uuid references public.donations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (razorpay_order_id)
);

create index if not exists fundraiser_payment_orders_fundraiser_id_idx on public.fundraiser_payment_orders (fundraiser_id);
create index if not exists fundraiser_payment_orders_organization_id_idx on public.fundraiser_payment_orders (organization_id);

drop trigger if exists set_fundraiser_payment_orders_updated_at on public.fundraiser_payment_orders;
create trigger set_fundraiser_payment_orders_updated_at
  before update on public.fundraiser_payment_orders
  for each row execute function public.set_updated_at();

alter table public.fundraiser_payment_orders enable row level security;

drop policy if exists "Org members can view fundraiser payment orders" on public.fundraiser_payment_orders;
create policy "Org members can view fundraiser payment orders"
  on public.fundraiser_payment_orders for select to authenticated
  using (public.is_org_member(organization_id));

-- Manual payout ledger for 'shared'-mode fundraisers — a platform
-- operator (not the church) records a row here once money has actually
-- been wired to the church externally. Nothing in the app moves money for
-- these; this is bookkeeping only. Deliberately no RLS policy grants an
-- org's own members/admins access — this is read and written exclusively
-- via the service-role client from the platform-admin surface (gated in
-- the app layer by PLATFORM_ADMIN_EMAILS), never by a church's own login.
create table if not exists public.fundraiser_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fundraiser_id uuid not null references public.fundraisers (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  paid_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fundraiser_payouts_fundraiser_id_idx on public.fundraiser_payouts (fundraiser_id);

alter table public.fundraiser_payouts enable row level security;

-- Belt-and-braces org-consistency triggers, same pattern as
-- attendance_sessions/attendance_records (migration 0052) and
-- folder_categories/shared_documents (migration 0050) — a row can't be
-- filed under a fundraiser belonging to a different org than the one it
-- claims.
create or replace function public.check_fundraiser_payment_order_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.fundraisers f where f.id = new.fundraiser_id and f.organization_id = new.organization_id
  ) then
    raise exception 'fundraiser_id must belong to the same organization as the payment order';
  end if;
  return new;
end;
$$;

drop trigger if exists check_fundraiser_payment_order_org on public.fundraiser_payment_orders;
create trigger check_fundraiser_payment_order_org
  before insert or update of fundraiser_id, organization_id on public.fundraiser_payment_orders
  for each row execute function public.check_fundraiser_payment_order_org();

create or replace function public.check_fundraiser_payout_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.fundraisers f where f.id = new.fundraiser_id and f.organization_id = new.organization_id
  ) then
    raise exception 'fundraiser_id must belong to the same organization as the payout';
  end if;
  return new;
end;
$$;

drop trigger if exists check_fundraiser_payout_org on public.fundraiser_payouts;
create trigger check_fundraiser_payout_org
  before insert or update of fundraiser_id, organization_id on public.fundraiser_payouts
  for each row execute function public.check_fundraiser_payout_org();

-- Public, masked lookup for the giving page — returns just enough to
-- render it (never internal ids beyond the fundraiser's own, never
-- secrets). Only returns a row once an admin has actually enabled the
-- link and chosen a payment mode.
create or replace function public.get_shared_fundraiser(token uuid)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  title text,
  description text,
  goal_amount numeric,
  raised_amount numeric,
  payment_mode text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      f.id,
      f.organization_id,
      o.name,
      f.title,
      f.description,
      f.goal_amount,
      coalesce((select sum(d.amount) from public.donations d where d.fundraiser_id = f.id), 0),
      f.payment_mode
    from public.fundraisers f
    join public.organizations o on o.id = f.organization_id
    where f.share_token = token
      and f.payment_link_enabled = true
      and f.payment_mode is not null;
end;
$$;

grant execute on function public.get_shared_fundraiser(uuid) to anon, authenticated;
