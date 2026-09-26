-- Fixes "column reference confirmation_code is ambiguous" in
-- submit_event_registration (migration 0067). `returns table (...,
-- confirmation_code text)` implicitly declares confirmation_code as an
-- OUT parameter, in scope as a plain identifier throughout the function
-- body — colliding with public.event_registrations.confirmation_code
-- inside the uniqueness-check loop's WHERE clause, which meant every call
-- failed before ever reaching the insert. Same function body otherwise,
-- just with that one reference qualified by table name.
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
  -- rather than trusting randomness alone. `event_registrations.` prefix
  -- is the actual fix — without it this matched the function's own
  -- confirmation_code OUT parameter instead of the table column.
  for i in 1..5 loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.event_registrations where event_registrations.confirmation_code = new_code);
  end loop;

  insert into public.event_registrations (event_id, organization_id, email, answers, confirmation_code)
  values (target_event.id, target_event.organization_id, registrant_email, coalesce(answers, '{}'::jsonb), new_code)
  returning id into new_id;

  return query select new_id, new_code;
end;
$$;

grant execute on function public.submit_event_registration(uuid, jsonb) to anon, authenticated;
