-- Fixes registration incorrectly showing as closed for RECURRING events.
--
-- Migration 0070 added an automatic "closes 1 hour before the event
-- starts" rule, checked against events.start_at directly. That column
-- holds the ORIGINAL occurrence's start time (occurrences aren't stored
-- per-row — see src/lib/events/recurrence.ts, which expands them on the
-- fly for the calendar/list views). For a recurring event, start_at is
-- almost always in the past after its first occurrence, so
-- `now() <= start_at - interval '1 hour'` was permanently false —
-- registration looked "closed" even though capacity wasn't reached and
-- registration_closes_at hadn't passed.
--
-- There's no per-occurrence registration list to close per-occurrence
-- against anyway (event_registrations is keyed by event_id only — a
-- registrant signs up for the recurring series once, not for one specific
-- date), so the fix is simply: the 1-hour-before-start auto-close rule
-- only applies to one-time events. Capacity and registration_closes_at
-- (both explicit organizer choices) still apply to recurring events as
-- before.
--
-- get_public_event_registration is DROPPED first rather than CREATE OR
-- REPLACE'd: Postgres refuses to replace a function when its OUT/return
-- columns differ from what's currently live, and that's exactly the state
-- this migration may be running from — if 0070 (which first added the
-- is_open column) never successfully applied, the live function is still
-- 0067's original 8-column shape, one column short of what's defined
-- below. Dropping first makes this migration succeed regardless of which
-- of those two shapes is currently live.
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
  is_open boolean
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
    )
  from public.events e
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
  select id, organization_id, registration_fields, registration_enabled, registration_capacity, registration_closes_at, start_at, is_recurring, recurrence_frequency
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
