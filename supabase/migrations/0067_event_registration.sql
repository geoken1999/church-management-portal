-- Event registration — an organizer can turn on a public registration
-- form for an event (fields shaped exactly like Forms', migration 0048:
-- key/label/field_type/options/required) and share its link/QR code.
-- Every registration form always keeps at least one email-type field —
-- that's how a registrant's pass gets emailed to them (see
-- submit_event_registration below) — enforced by the app layer
-- (src/lib/events/registration-validation.ts) rather than a DB
-- constraint, same trust boundary as Forms' own field editor.
alter table public.events
  add column if not exists registration_enabled boolean not null default false,
  add column if not exists registration_share_token uuid not null default gen_random_uuid(),
  add column if not exists registration_fields jsonb not null default '[]'::jsonb,
  add column if not exists registration_capacity integer check (registration_capacity is null or registration_capacity > 0),
  add column if not exists registration_closes_at timestamptz;

create unique index if not exists events_registration_share_token_key on public.events (registration_share_token);

-- One row per registrant. answers holds every field's response (same
-- shape as form_responses.answers); email is pulled out into its own
-- column at insert time since it's what the confirmation/pass email goes
-- to, not just another answer to display.
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Denormalized from events.organization_id, same reasoning as
  -- form_responses.organization_id — avoids a join to events for RLS on
  -- every row.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  answers jsonb not null default '{}'::jsonb,
  -- Short, human-typeable code shown on the emailed pass and printed
  -- under its QR code — lets a door volunteer look someone up by hand if
  -- their phone won't scan.
  confirmation_code text not null unique,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'checked_in')),
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_registrations_event_id_idx on public.event_registrations (event_id);
create index if not exists event_registrations_organization_id_idx on public.event_registrations (organization_id);

-- Defense-in-depth: event_registrations.organization_id must always match
-- its parent event's organization_id, same pattern as
-- check_widget_submission_org (migration 0059).
create or replace function public.check_event_registration_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the parent event''s organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_event_registration_org on public.event_registrations;
create trigger check_event_registration_org
  before insert or update of event_id, organization_id on public.event_registrations
  for each row execute function public.check_event_registration_org();

alter table public.event_registrations enable row level security;

-- Same admin-manages / member-views shape as events itself — viewing and
-- checking in registrants is day-to-day team work, cancelling one is
-- admin-only as a safety net (same split events uses for edit vs delete).
drop policy if exists "Org members can view event registrations" on public.event_registrations;
create policy "Org members can view event registrations"
  on public.event_registrations for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can update event registrations" on public.event_registrations;
create policy "Org members can update event registrations"
  on public.event_registrations for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins can delete event registrations" on public.event_registrations;
create policy "Admins can delete event registrations"
  on public.event_registrations for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Minimal public info for the registration page — read-only, scoped by
-- share_token, and only returns anything for a registration-enabled
-- event. Mirrors get_public_form (migration 0048); also reports how many
-- spots remain (null = unlimited) so the public page can show/hide the
-- form once full.
create or replace function public.get_public_event_registration(token uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  registration_fields jsonb,
  registration_closes_at timestamptz,
  spots_remaining integer
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
    end
  from public.events e
  where e.registration_share_token = token and e.registration_enabled = true;
$$;

grant execute on function public.get_public_event_registration(uuid) to anon, authenticated;

-- Public registration entry point — mirrors submit_form_response's shape
-- (validates required fields against the live field definition) plus
-- capacity/closing-time checks and email extraction. Returns the new
-- registration's id and confirmation code so the caller (a Server Action,
-- not this RPC — sending email is outside SQL's job) can send the pass.
create or replace function public.submit_event_registration(
  token uuid,
  answers jsonb
)
returns table (registration_id uuid, confirmation_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event record;
  field jsonb;
  email_key text;
  registrant_email text;
  new_code text;
  new_id uuid;
  taken_count int;
begin
  select id, organization_id, registration_fields, registration_enabled, registration_capacity, registration_closes_at
    into target_event
    from public.events
    where registration_share_token = token;

  if target_event.id is null then
    raise exception 'This registration link could not be found.';
  end if;

  if not target_event.registration_enabled then
    raise exception 'Registration for this event is not currently open.';
  end if;

  if target_event.registration_closes_at is not null and now() > target_event.registration_closes_at then
    raise exception 'Registration for this event has closed.';
  end if;

  if target_event.registration_capacity is not null then
    select count(*) into taken_count from public.event_registrations
      where event_id = target_event.id and status <> 'cancelled';
    if taken_count >= target_event.registration_capacity then
      raise exception 'This event is full.';
    end if;
  end if;

  for field in select * from jsonb_array_elements(coalesce(target_event.registration_fields, '[]'::jsonb))
  loop
    if field->>'field_type' = 'email' then
      email_key := field->>'key';
    end if;

    if coalesce((field->>'required')::boolean, false) then
      if field->>'field_type' = 'checkbox' then
        if coalesce((answers->>(field->>'key'))::boolean, false) is not true then
          raise exception '% is required.', (field->>'label');
        end if;
      elsif not (answers ? (field->>'key')) or length(trim(coalesce(answers->>(field->>'key'), ''))) = 0 then
        raise exception '% is required.', (field->>'label');
      end if;
    end if;
  end loop;

  if email_key is null or not (answers ? email_key) or length(trim(coalesce(answers->>email_key, ''))) = 0 then
    raise exception 'A valid email address is required.';
  end if;
  registrant_email := trim(answers->>email_key);

  -- 8-char uppercase alphanumeric — short enough to read off a phone
  -- screen at a check-in table, collision-checked with a few retries
  -- rather than trusting randomness alone.
  for i in 1..5 loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.event_registrations where confirmation_code = new_code);
  end loop;

  insert into public.event_registrations (event_id, organization_id, email, answers, confirmation_code)
  values (target_event.id, target_event.organization_id, registrant_email, coalesce(answers, '{}'::jsonb), new_code)
  returning id into new_id;

  return query select new_id, new_code;
end;
$$;

grant execute on function public.submit_event_registration(uuid, jsonb) to anon, authenticated;
