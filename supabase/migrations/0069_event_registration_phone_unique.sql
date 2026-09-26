-- Adds Phone as a default registration field (alongside Name and Email),
-- and stops the same person registering twice for the same event — by
-- email or by phone, whichever they repeat. Uniqueness is scoped to
-- (event_id, ...) rather than being global, so the same email/phone can
-- freely register for a *different* event, and excludes cancelled
-- registrations, so cancelling and re-registering isn't blocked by your
-- own old row. Phone is normalized to digits-and-leading-plus only before
-- comparing (e.g. "+1 234-567-8900" and "12345678900" collide) — this app
-- has no per-registrant country context to do full E.164 normalization
-- the way Members/SMS do, so this is a lighter, best-effort match.
alter table public.event_registrations
  add column if not exists phone text;

create unique index if not exists event_registrations_event_id_email_key
  on public.event_registrations (event_id, lower(email))
  where status <> 'cancelled';

create unique index if not exists event_registrations_event_id_phone_key
  on public.event_registrations (event_id, regexp_replace(phone, '[^0-9+]', '', 'g'))
  where phone is not null and status <> 'cancelled';

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
