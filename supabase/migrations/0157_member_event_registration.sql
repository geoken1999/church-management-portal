-- Members can register for events from the mobile app, and see the events they
-- are registered for (with the details and boarding pass) in the Space tab until
-- the event is completed.

-- A member's registrations. Now carries the event's details (map, contact,
-- online link) and no longer includes completed or cancelled events: once an
-- event moves to completed, it leaves the member's Space.
drop function if exists public.get_my_event_passes(uuid);
create function public.get_my_event_passes(target_org_id uuid)
returns table (
  registration_id uuid,
  event_title text,
  event_description text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  venue text,
  map_link text,
  contact_name text,
  contact_phone text,
  meeting_mode text,
  meeting_link text,
  confirmation_code text,
  status text,
  pass_token uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, e.title, e.description, e.start_at, e.end_at, e.venue, e.map_link, e.contact_name, e.contact_phone,
    e.meeting_mode, e.meeting_link, r.confirmation_code, r.status, r.pass_token
  from public.members m
  join public.event_registrations r on r.organization_id = m.organization_id
  join public.events e on e.id = r.event_id
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and r.status in ('confirmed', 'checked_in')
    and e.status in ('pending', 'active')
    and coalesce(e.end_at, e.start_at) > now() - interval '2 days'
    and (
      (m.email is not null and lower(r.email) = lower(m.email))
      or (
        m.phone is not null and r.phone is not null
        and length(regexp_replace(m.phone, '\D', '', 'g')) >= 10
        and right(regexp_replace(m.phone, '\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\D', '', 'g'), 10)
      )
    )
  order by e.start_at asc
  limit 20;
$$;

grant execute on function public.get_my_event_passes(uuid) to authenticated;

-- Events the signed-in member can register for: registration is on, the event is
-- active and still open (not closed, not full, not about to start), and they
-- haven't registered already. quick_register is true when the app can register
-- them in one tap (the form only asks for name, email and phone, and nothing is
-- paid up front); otherwise the app opens the event's registration page.
create or replace function public.get_open_events_for_me(target_org_id uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  venue text,
  meeting_mode text,
  registration_share_token uuid,
  quick_register boolean,
  payment_required boolean,
  spots_remaining integer
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.title, e.description, e.start_at, e.end_at, e.venue, e.meeting_mode, e.registration_share_token,
    (
      not e.payment_required
      and not exists (
        select 1 from jsonb_array_elements(coalesce(e.registration_fields, '[]'::jsonb)) f
        where coalesce((f ->> 'required')::boolean, false)
          and f ->> 'key' not in ('name', 'email', 'phone')
          and f ->> 'field_type' not in ('email', 'phone')
      )
    ),
    e.payment_required,
    case
      when e.registration_capacity is null then null
      else greatest(0, e.registration_capacity - (select count(*)::int from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled'))
    end
  from public.events e
  where e.organization_id = target_org_id
    and public.is_linked_member(target_org_id)
    and e.registration_enabled = true
    and e.status = 'active'
    and (e.registration_closes_at is null or now() <= e.registration_closes_at)
    and (
      (e.is_recurring and e.recurrence_frequency is not null)
      or now() <= e.start_at - interval '1 hour'
    )
    and (
      e.registration_capacity is null
      or (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.registration_capacity
    )
    and not exists (
      select 1
      from public.members m
      join public.event_registrations r on r.event_id = e.id and r.status <> 'cancelled'
      where m.organization_id = target_org_id and m.auth_user_id = auth.uid()
        and (
          (m.email is not null and lower(r.email) = lower(m.email))
          or (
            m.phone is not null and r.phone is not null
            and length(regexp_replace(m.phone, '\D', '', 'g')) >= 10
            and right(regexp_replace(m.phone, '\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\D', '', 'g'), 10)
          )
        )
    )
  order by e.start_at asc
  limit 20;
$$;

grant execute on function public.get_open_events_for_me(uuid) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.get_open_events_for_me(uuid);
--   then re-run the get_my_event_passes definition from 0149.
