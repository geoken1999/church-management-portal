-- Adds an event lifecycle status — pending, active, cancelled, completed —
-- separate from registration_enabled (the organizer's own on/off toggle
-- for the registration form itself, from the Registration Settings tab).
-- The registration link now only actually accepts registrants while an
-- event's status is 'active', regardless of what registration_enabled,
-- capacity, or the closing rules say — a cancelled or completed event
-- shouldn't take new registrations no matter how those are configured.
-- Existing events default (and are backfilled) to 'active' so this doesn't
-- silently close every event already relying on the current behavior.
alter table public.events
  add column if not exists status text not null default 'active' check (status in ('pending', 'active', 'cancelled', 'completed'));

update public.events set status = 'active' where status is null;

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
  status text,
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
      e.status = 'active'
      and (e.registration_closes_at is null or now() <= e.registration_closes_at)
      and (
        (e.is_recurring and e.recurrence_frequency is not null)
        or now() <= e.start_at - interval '1 hour'
      )
      and (
        e.registration_capacity is null
        or (select count(*) from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.registration_capacity
      )
    ),
    e.status,
    o.name,
    o.logo_url
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.registration_share_token = token and e.registration_enabled = true;
$$;

grant execute on function public.get_public_event_registration(uuid) to anon, authenticated;

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
begin
  select id, organization_id, registration_fields, registration_enabled, registration_capacity, registration_closes_at, start_at, is_recurring, recurrence_frequency, status
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

  if not (target_event.is_recurring and target_event.recurrence_frequency is not null)
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

    -- Generic per-field uniqueness for whatever the organizer opted in
    -- via the field editor's "No duplicates allowed" checkbox. Only
    -- meaningful when a value was actually given for it.
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

  -- 8-char uppercase alphanumeric — short enough to read off a phone
  -- screen at a check-in table, collision-checked with a few retries
  -- rather than trusting randomness alone.
  for i in 1..5 loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.event_registrations where event_registrations.confirmation_code = new_code);
  end loop;

  begin
    insert into public.event_registrations (event_id, organization_id, email, phone, answers, confirmation_code)
    values (target_event.id, target_event.organization_id, registrant_email, registrant_phone, coalesce(answers, '{}'::jsonb), new_code)
    returning id into new_id;
  exception
    when unique_violation then
      raise exception 'You''ve already registered for this event with that email or phone number.';
  end;

  return query select new_id, new_code;
end;
$$;

grant execute on function public.submit_event_registration(uuid, jsonb) to anon, authenticated;
