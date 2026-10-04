-- Paid event registration. Two independent organizer choices: which
-- gateway collects the money (the platform's own shared Razorpay account,
-- or the organizer's own external payment link — e.g. Stripe/PayPal/a
-- Razorpay Payment Page they already have), and when payment must happen
-- (before registration is considered complete, or collected later at
-- check-in). "External" has no API/webhook into whatever gateway the
-- organizer actually uses, so payment there is always confirmed manually
-- by staff — never a self-declared checkbox.
--
-- The registration row is always created immediately via the existing
-- submit_event_registration RPC below, regardless of payment_required —
-- what differs is only whether the confirmation pass email goes out right
-- away or is withheld until payment_status flips to 'paid' (see
-- src/lib/events/public-registration-actions.ts's sendPassEmailForRegistration).

alter table public.events
  add column if not exists payment_required boolean not null default false,
  add column if not exists payment_gateway text check (payment_gateway in ('platform', 'external')),
  add column if not exists payment_amount numeric(10, 2),
  add column if not exists external_payment_url text,
  add column if not exists payment_timing text check (payment_timing in ('before_registration', 'at_checkin'));

alter table public.events
  drop constraint if exists events_payment_consistency;
alter table public.events
  add constraint events_payment_consistency check (
    (not payment_required) or
    (payment_gateway is not null and payment_amount is not null and payment_amount > 0 and payment_timing is not null
     and (payment_gateway <> 'external' or external_payment_url is not null))
  );

alter table public.event_registrations
  add column if not exists payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'paid')),
  add column if not exists payment_amount numeric(10, 2),
  add column if not exists paid_at timestamptz;

create table if not exists public.event_registration_payment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  registration_id uuid not null references public.event_registrations (id) on delete cascade,
  razorpay_order_id text not null unique,
  amount numeric(10, 2) not null,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  razorpay_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_registration_payment_orders_organization_id_idx on public.event_registration_payment_orders (organization_id);
create index if not exists event_registration_payment_orders_event_id_idx on public.event_registration_payment_orders (event_id);
create index if not exists event_registration_payment_orders_registration_id_idx on public.event_registration_payment_orders (registration_id);

drop trigger if exists set_event_registration_payment_orders_updated_at on public.event_registration_payment_orders;
create trigger set_event_registration_payment_orders_updated_at
  before update on public.event_registration_payment_orders
  for each row execute function public.set_updated_at();

alter table public.event_registration_payment_orders enable row level security;

-- Same shape as fundraiser_payment_orders: members can view (for the
-- Registrants tab), only admins can write directly — in practice almost
-- all writes go through the admin client (order creation/finalization
-- happen from the public registration page and the Razorpay webhook,
-- neither of which has a session), so this policy mostly just governs the
-- one read path a logged-in team member takes.
drop policy if exists "Org members can view event registration payment orders" on public.event_registration_payment_orders;
create policy "Org members can view event registration payment orders"
  on public.event_registration_payment_orders
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can manage event registration payment orders" on public.event_registration_payment_orders;
create policy "Admins can manage event registration payment orders"
  on public.event_registration_payment_orders
  for all
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Re-create submit_event_registration (same signature as migration 0076)
-- with two additions: read payment_required/payment_amount off the event,
-- and snapshot payment_status/payment_amount onto the new registration
-- row. Every other line (capacity counting, required-field validation,
-- per-field uniqueness, email/phone uniqueness) is unchanged from 0076.
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

grant execute on function public.submit_event_registration(uuid, jsonb) to anon, authenticated;
