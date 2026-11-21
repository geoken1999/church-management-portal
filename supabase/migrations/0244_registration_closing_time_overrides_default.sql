-- A registration closing time the organiser chose is the cut-off.
-- Until now registration for a one-off event always closed an hour before it started, even when the organiser had set a later closing time (or "keep it open until the end of the day"),
-- because that default was checked on top of the closing time. Now the one-hour default applies only when NO closing time is set; a closing time that is set decides, in all three places that check it:
--   submit_event_registration       the form being submitted
--   get_public_event_registration   the public page's "open or closed"
--   get_open_events_for_me          the member's list of events they can register for
-- Nothing else about them changes. Recurring events are unaffected (they never had the default).
--
-- One-off: Jesus Redeems Youth Ministry - Maharashtra, "Mount Sinai - Andheri" (21 Nov 2026, starts 9:00 AM IST): keep registration open until the end of that day, 11:59 PM IST.

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
  phone_key text;
  registrant_email text;
  registrant_phone text;
  new_code text;
  new_id uuid;
  taken_count int;
  reg_payment_status text;
begin
  select id, organization_id, registration_fields, registration_enabled, registration_capacity, registration_closes_at, start_at, is_recurring, recurrence_frequency, status, payment_required, payment_amount
    into target_event
    from public.events
    where registration_share_token = token;

  if target_event.id is null then
    raise exception 'This registration link could not be found.';
  end if;

  if not target_event.registration_enabled then
    raise exception 'Registration for this event is not currently open.';
  end if;

  if target_event.status = 'cancelled' then
    raise exception 'This event has been cancelled.';
  elsif target_event.status = 'completed' then
    raise exception 'This event has already taken place.';
  elsif target_event.status = 'pending' then
    raise exception 'Registration for this event isn''t open yet.';
  end if;

  if target_event.registration_closes_at is not null and now() > target_event.registration_closes_at then
    raise exception 'Registration for this event has closed.';
  end if;

  -- The default cut-off (an hour before a one-off event starts) applies only when the organiser has NOT set a closing time: a closing time they chose is the cut-off.
  if target_event.registration_closes_at is null
    and not (target_event.is_recurring and target_event.recurrence_frequency is not null)
    and now() > target_event.start_at - interval '1 hour'
  then
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
    elsif field->>'field_type' = 'phone' then
      phone_key := field->>'key';
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

    if coalesce((field->>'unique')::boolean, false)
      and (answers ? (field->>'key'))
      and length(trim(coalesce(answers->>(field->>'key'), ''))) > 0
    then
      if exists (
        select 1 from public.event_registrations r
        where r.event_id = target_event.id
          and r.status <> 'cancelled'
          and trim(r.answers->>(field->>'key')) = trim(answers->>(field->>'key'))
      ) then
        raise exception 'A registration with that % already exists.', lower(field->>'label');
      end if;
    end if;
  end loop;

  if email_key is null or not (answers ? email_key) or length(trim(coalesce(answers->>email_key, ''))) = 0 then
    raise exception 'A valid email address is required.';
  end if;
  registrant_email := trim(answers->>email_key);

  if phone_key is not null and (answers ? phone_key) then
    registrant_phone := nullif(trim(answers->>phone_key), '');
  end if;

  for i in 1..5 loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.event_registrations where event_registrations.confirmation_code = new_code);
  end loop;

  reg_payment_status := case when target_event.payment_required then 'pending' else 'not_required' end;

  begin
    insert into public.event_registrations (event_id, organization_id, email, phone, answers, confirmation_code, payment_status, payment_amount)
    values (target_event.id, target_event.organization_id, registrant_email, registrant_phone, coalesce(answers, '{}'::jsonb), new_code, reg_payment_status, target_event.payment_amount)
    returning id into new_id;
  exception
    when unique_violation then
      raise exception 'You''ve already registered for this event with that email or phone number.';
  end;

  return query select new_id, new_code;
end;
$$;

create or replace function public.get_public_event_registration(token uuid)
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
  status text,
  organization_name text,
  organization_logo_url text,
  organization_timezone text
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
      e.status = 'active'
      and (e.registration_closes_at is null or now() <= e.registration_closes_at)
      and (
        (e.is_recurring and e.recurrence_frequency is not null)
        or e.registration_closes_at is not null
        or now() <= e.start_at - interval '1 hour'
      )
      and (
        e.registration_capacity is null
        or (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.registration_capacity
      )
    ),
    e.status,
    o.name,
    o.logo_url,
    o.timezone
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.registration_share_token = token and e.registration_enabled = true;
$$;

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
      or e.registration_closes_at is not null
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

update public.events set registration_closes_at = timestamptz '2026-11-21 23:59:59+05:30'
where id = '4c12f981-59ce-4877-b3be-733715565b55' and title = 'Mount Sinai - Andheri' and registration_enabled;
