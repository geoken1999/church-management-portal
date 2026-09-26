-- Adds the organization's name + logo to every public, unauthenticated
-- lookup RPC that backs a shareable page (Forms, Event registration, the
-- fundraiser Give page, and a shared Folder) — so each one can show the
-- church's own branding instead of (or alongside) KingdomFlow's, while the
-- app keeps its "Powered by KingdomFlow" attribution.
--
-- Every one of these functions is DROPPED before being recreated: adding
-- output columns via CREATE OR REPLACE fails with "cannot change return
-- type of existing function" (the same 42P13 hit in migration 0073) since
-- Postgres won't let a replace change a function's OUT-parameter row type.

drop function if exists public.get_public_form(text);
create function public.get_public_form(form_slug text)
returns table (
  form_id uuid,
  title text,
  description text,
  fields jsonb,
  organization_name text,
  organization_logo_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select f.id, f.title, f.description, f.fields, o.name, o.logo_url
  from public.forms f
  join public.organizations o on o.id = f.organization_id
  where f.slug = form_slug and f.status = 'published';
$$;

grant execute on function public.get_public_form(text) to anon, authenticated;

drop function if exists public.get_public_event_registration(uuid);
create function public.get_public_event_registration(token uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  registration_fields jsonb,
  registration_closes_at timestamptz,
  spots_remaining integer,
  is_open boolean,
  organization_name text,
  organization_logo_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.description,
    e.start_at,
    e.end_at,
    e.registration_fields,
    e.registration_closes_at,
    case
      when e.registration_capacity is null then null
      else greatest(0, e.registration_capacity - (
        select count(*)::int from public.event_registrations r
        where r.event_id = e.id and r.status <> 'cancelled'
      ))
    end,
    (
      (e.registration_closes_at is null or now() <= e.registration_closes_at)
      and (
        (e.is_recurring and e.recurrence_frequency is not null)
        or now() <= e.start_at - interval '1 hour'
      )
      and (
        e.registration_capacity is null
        or (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.registration_capacity
      )
    ),
    o.name,
    o.logo_url
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.registration_share_token = token and e.registration_enabled = true;
$$;

grant execute on function public.get_public_event_registration(uuid) to anon, authenticated;

drop function if exists public.get_shared_fundraiser(uuid);
create function public.get_shared_fundraiser(token uuid)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  organization_logo_url text,
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
      o.logo_url,
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

drop function if exists public.get_shared_category(uuid);
create function public.get_shared_category(token uuid)
returns table (
  id uuid,
  name text,
  organization_name text,
  organization_logo_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select c.id, c.name, o.name, o.logo_url
    from public.folder_categories c
    join public.organizations o on o.id = c.organization_id
    where c.share_token = token
      and c.share_enabled = true;
end;
$$;

grant execute on function public.get_shared_category(uuid) to anon, authenticated;
