-- Church-wide online giving (offering, tithe, donation), not tied to a
-- fundraiser. A church turns it on, picks which gateway collects (the
-- platform's shared one, or its own Razorpay account) and which kinds of gift
-- it accepts. Members give from the mobile app's Profile menu, which opens the
-- church's public giving page (/give/church/{giving_share_token}); that page
-- uses the same payment orders as fundraiser giving.

alter table public.organizations
  add column if not exists giving_enabled boolean not null default false,
  add column if not exists giving_mode text check (giving_mode is null or giving_mode in ('own', 'shared')),
  add column if not exists giving_types text[] not null default array['offering', 'tithe', 'donation'],
  add column if not exists giving_share_token uuid not null default gen_random_uuid();

create unique index if not exists organizations_giving_share_token_key on public.organizations (giving_share_token);

-- A payment order is now either for a fundraiser, or a general gift
-- (offering / tithe / donation) with no fundraiser. A paid offering or tithe
-- is recorded as an offering; a paid donation or fundraiser gift as a donation.
alter table public.fundraiser_payment_orders
  alter column fundraiser_id drop not null,
  add column if not exists giving_type text not null default 'fundraiser' check (giving_type in ('fundraiser', 'offering', 'tithe', 'donation')),
  add column if not exists offering_id uuid references public.offerings (id) on delete set null;

alter table public.fundraiser_payment_orders drop constraint if exists fundraiser_payment_orders_type_matches_fundraiser;
alter table public.fundraiser_payment_orders
  add constraint fundraiser_payment_orders_type_matches_fundraiser check ((giving_type = 'fundraiser') = (fundraiser_id is not null));

-- The org-consistency trigger must now allow a null fundraiser.
create or replace function public.check_fundraiser_payment_order_org()
returns trigger
language plpgsql
as $$
begin
  if new.fundraiser_id is not null and not exists (
    select 1 from public.fundraisers f where f.id = new.fundraiser_id and f.organization_id = new.organization_id
  ) then
    raise exception 'fundraiser_id must belong to the same organization as the payment order';
  end if;
  return new;
end;
$$;

-- What the public giving page needs (no sign-in): only for a church that has
-- switched giving on.
create or replace function public.get_church_giving(token uuid)
returns table (organization_id uuid, organization_name text, organization_logo_url text, giving_mode text, giving_types text[])
language sql
security definer
stable
set search_path = public
as $$
  select o.id, o.name, o.logo_url, o.giving_mode, o.giving_types
  from public.organizations o
  where o.giving_share_token = token and o.giving_enabled = true and o.giving_mode is not null;
$$;

grant execute on function public.get_church_giving(uuid) to anon, authenticated;

-- What a signed-in member sees under Profile > Give online.
create or replace function public.get_my_giving_options(target_org_id uuid)
returns table (giving_enabled boolean, giving_share_token uuid, giving_types text[])
language sql
security definer
stable
set search_path = public
as $$
  select o.giving_enabled and o.giving_mode is not null, o.giving_share_token, o.giving_types
  from public.organizations o
  where o.id = target_org_id and public.is_linked_member(target_org_id);
$$;

create or replace function public.get_my_giving_fundraisers(target_org_id uuid)
returns table (id uuid, title text, description text, goal_amount numeric, raised_amount numeric, share_token uuid)
language sql
security definer
stable
set search_path = public
as $$
  select f.id, f.title, f.description, f.goal_amount,
    coalesce((select sum(d.amount) from public.donations d where d.fundraiser_id = f.id), 0),
    f.share_token
  from public.fundraisers f
  where f.organization_id = target_org_id
    and f.status = 'active'
    and f.payment_link_enabled = true
    and f.payment_mode is not null
    and public.is_linked_member(target_org_id)
  order by f.created_at desc
  limit 20;
$$;

grant execute on function public.get_my_giving_options(uuid) to authenticated;
grant execute on function public.get_my_giving_fundraisers(uuid) to authenticated;

-- Pushes sent by an admin can now also target a branch.
alter table public.push_broadcasts drop constraint if exists push_broadcasts_audience_check;
alter table public.push_broadcasts
  add constraint push_broadcasts_audience_check check (audience in ('church', 'branch', 'group', 'member')),
  add column if not exists branch_id uuid references public.branches (id) on delete set null;

-- Reversal (run manually if needed):
--   drop function if exists public.get_my_giving_fundraisers(uuid);
--   drop function if exists public.get_my_giving_options(uuid);
--   drop function if exists public.get_church_giving(uuid);
--   alter table public.push_broadcasts drop column if exists branch_id;
--   alter table public.fundraiser_payment_orders drop constraint if exists fundraiser_payment_orders_type_matches_fundraiser;
--   (orders with no fundraiser must be removed before restoring NOT NULL on fundraiser_id)
--   alter table public.organizations drop column if exists giving_enabled, drop column if exists giving_mode, drop column if exists giving_types, drop column if exists giving_share_token;
