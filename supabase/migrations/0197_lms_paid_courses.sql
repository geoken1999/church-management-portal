-- Paid courses. A course can have a fee; students and members pay on KingdomFlow's shared PayU account, are
-- enrolled automatically when the payment is confirmed, and the church is paid out through the Payouts page
-- like paid events and membership fees (2.5% service fee).

alter table public.lms_courses add column if not exists price_amount numeric(10, 2)
  check (price_amount is null or (price_amount > 0 and price_amount <= 100000));

alter table public.lms_enrollments drop constraint if exists lms_enrollments_source_check;
alter table public.lms_enrollments add constraint lms_enrollments_source_check check (source in ('admin', 'self', 'payment'));

-- A public application for a paid course waits for payment before the team sees it as ready.
alter table public.lms_student_applications add column if not exists payment_status text not null default 'none'
  check (payment_status in ('none', 'awaiting', 'paid'));

-- One row per payment attempt.
create table if not exists public.lms_payment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  application_id uuid references public.lms_student_applications (id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  payu_txnid text not null unique,
  payu_mihpayid text,
  payer_name text not null,
  payer_email text,
  payer_phone text,
  enrollment_id uuid references public.lms_enrollments (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_id is not null or application_id is not null)
);
create index if not exists lms_payment_orders_org_idx on public.lms_payment_orders (organization_id, status, created_at desc);
create index if not exists lms_payment_orders_course_idx on public.lms_payment_orders (course_id);

alter table public.lms_payment_orders enable row level security;
drop policy if exists "Staff can view lms_payment_orders" on public.lms_payment_orders;
create policy "Staff can view lms_payment_orders"
  on public.lms_payment_orders for select to authenticated
  using (public.is_org_member(organization_id));
-- No other policy: orders are written by the server (service role) only.

-- Payouts of course fees: one balance per church, like membership fees.
create table if not exists public.course_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text null,
  paid_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists course_payouts_org_idx on public.course_payouts (organization_id);
alter table public.course_payouts enable row level security;
drop policy if exists "Org members can view course payouts" on public.course_payouts;
create policy "Org members can view course payouts"
  on public.course_payouts for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.course_payout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  payout_method text not null check (payout_method in ('upi', 'bank_transfer')),
  upi_id text null,
  bank_account_holder text null,
  bank_account_number text null,
  bank_ifsc text null,
  bank_name text null,
  requested_by uuid null references auth.users (id) on delete set null,
  resolved_payout_id uuid null references public.course_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists course_payout_requests_one_pending_per_org
  on public.course_payout_requests (organization_id)
  where status = 'pending';
alter table public.course_payout_requests enable row level security;
drop policy if exists "Org members can view course payout requests" on public.course_payout_requests;
create policy "Org members can view course payout requests"
  on public.course_payout_requests for select to authenticated
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------------------------
-- Functions that know about fees
-- ---------------------------------------------------------------------------------------------

-- The catalogue gains the fee (a new column, so the function is replaced).
drop function if exists public.lms_catalog(uuid);
create or replace function public.lms_catalog(p_org uuid)
returns table (
  course_id uuid,
  title text,
  code text,
  description text,
  cover_image_url text,
  level text,
  language text,
  delivery_mode text,
  estimated_hours numeric,
  capacity integer,
  seats_taken integer,
  enrollment_opens_at timestamptz,
  enrollment_closes_at timestamptz,
  starts_on date,
  ends_on date,
  instructors text,
  lesson_count integer,
  my_status text,
  prerequisites_met boolean,
  missing_prerequisites text,
  price_amount numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id,
    c.title,
    c.code,
    c.description,
    c.cover_image_url,
    c.level,
    c.language,
    c.delivery_mode,
    c.estimated_hours,
    c.capacity,
    (select count(*)::integer from public.lms_enrollments e where e.course_id = c.id and e.status in ('approved', 'active')),
    c.enrollment_opens_at,
    c.enrollment_closes_at,
    c.starts_on,
    c.ends_on,
    (select string_agg(im.first_name || ' ' || im.last_name, ', ' order by i.created_at)
       from public.lms_course_instructors i join public.members im on im.id = i.member_id where i.course_id = c.id),
    (select count(*)::integer
       from public.lms_lessons pl join public.lms_modules pm on pm.id = pl.module_id
      where pl.course_id = c.id and pl.status = 'published' and pm.status = 'published'),
    (select e.status from public.lms_enrollments e
      where e.course_id = c.id and e.member_id = public.lms_my_member_in_org(p_org)
      order by (e.status in ('pending', 'approved', 'active')) desc, e.requested_at desc limit 1),
    not exists (
      select 1 from public.lms_course_prerequisites p
       where p.course_id = c.id
         and not exists (
           select 1 from public.lms_enrollments pe
            where pe.course_id = p.prerequisite_course_id and pe.member_id = public.lms_my_member_in_org(p_org) and pe.status = 'completed')),
    (select string_agg(pc.title, ', ')
       from public.lms_course_prerequisites p join public.lms_courses pc on pc.id = p.prerequisite_course_id
      where p.course_id = c.id
        and not exists (
          select 1 from public.lms_enrollments pe
           where pe.course_id = p.prerequisite_course_id and pe.member_id = public.lms_my_member_in_org(p_org) and pe.status = 'completed')),
    c.price_amount
  from public.lms_courses c
  where c.organization_id = p_org
    and c.status = 'published'
    and public.lms_feature_available(p_org)
    and public.lms_my_member_in_org(p_org) is not null
    and (
      c.visibility = 'public'
      or (c.visibility = 'organization' and not public.lms_is_student(p_org))
      or exists (select 1 from public.lms_enrollments e2 where e2.course_id = c.id and e2.member_id = public.lms_my_member_in_org(p_org))
    )
  order by c.title;
$$;
revoke all on function public.lms_catalog(uuid) from public, anon;
grant execute on function public.lms_catalog(uuid) to authenticated;

-- Asking to join a course with a fee is refused here: those go through payment.
create or replace function public.lms_request_enrollment(p_course uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.lms_courses%rowtype;
  s public.lms_settings%rowtype;
  v_member uuid;
  v_status text;
begin
  select * into c from public.lms_courses where id = p_course and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id) then
    raise exception 'That course could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'You need to be an active member of this church to join a course.';
  end if;
  if c.price_amount is not null then
    raise exception 'This course has a fee. Pay for it to join.';
  end if;
  select * into s from public.lms_settings where organization_id = c.organization_id;
  if found and not s.allow_self_enrollment then
    raise exception 'Your church is not taking course requests from members right now.';
  end if;
  if exists (
    select 1 from public.lms_course_prerequisites p
     where p.course_id = c.id
       and not exists (select 1 from public.lms_enrollments pe where pe.course_id = p.prerequisite_course_id and pe.member_id = v_member and pe.status = 'completed')
  ) then
    raise exception 'Finish the prerequisite courses first.';
  end if;
  v_status := case when coalesce(s.enrollment_requires_approval, true) then 'pending' else 'approved' end;
  perform public.lms_create_enrollment(c.organization_id, c.id, v_member, v_status, 'self', null, false);
  return v_status;
end;
$$;

-- An application that is still waiting for its fee cannot be approved by hand.
create or replace function public.lms_approve_application(p_org uuid, p_application uuid, p_course uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.lms_student_applications%rowtype;
  v_tail text;
  v_member uuid;
  v_status text;
  v_enrolled boolean := false;
begin
  select * into a from public.lms_student_applications where id = p_application and organization_id = p_org for update;
  if not found then
    raise exception 'That application could not be found.';
  end if;
  if a.status <> 'pending' then
    raise exception 'That application was already decided.';
  end if;
  if a.payment_status = 'awaiting' then
    raise exception 'This application is waiting for the course fee to be paid.';
  end if;
  v_tail := right(regexp_replace(a.phone, '\D', '', 'g'), 10);
  if length(v_tail) <> 10 then
    raise exception 'The phone number on this application is not a valid 10-digit number.';
  end if;

  if exists (
    select 1 from public.members m
     where m.organization_id <> p_org
       and m.status in ('active', 'student')
       and right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 10) = v_tail
  ) then
    raise exception 'This phone number is already registered with another church on KingdomFlow.';
  end if;

  select m.id, m.status into v_member, v_status
    from public.members m
   where m.organization_id = p_org
     and right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 10) = v_tail
   limit 1;

  if found then
    if v_status = 'pending' then
      raise exception 'This person has a waiting membership request. Deal with it under Members first.';
    elsif v_status = 'left' then
      update public.members set status = 'student' where id = v_member;
    end if;
  else
    insert into public.members (organization_id, first_name, last_name, phone, email, status)
    values (p_org, trim(a.first_name), trim(a.last_name), a.phone, nullif(trim(coalesce(a.email, '')), ''), 'student')
    returning id into v_member;
  end if;

  if p_course is not null
     and not exists (select 1 from public.lms_enrollments e where e.course_id = p_course and e.member_id = v_member and e.status in ('pending', 'approved', 'active')) then
    perform public.lms_create_enrollment(p_org, p_course, v_member, 'approved', 'admin', p_actor, true);
    v_enrolled := true;
  end if;

  update public.lms_student_applications
     set status = 'approved', member_id = v_member, decided_by = p_actor, decided_at = now()
   where id = p_application;
  return jsonb_build_object('member_id', v_member, 'enrolled', v_enrolled);
end;
$$;
revoke all on function public.lms_approve_application(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Reversal (run manually if needed):
--   drop table if exists public.course_payout_requests, public.course_payouts, public.lms_payment_orders;
--   alter table public.lms_student_applications drop column if exists payment_status;
--   alter table public.lms_courses drop column if exists price_amount;
--   (and re-run lms_catalog, lms_request_enrollment, lms_approve_application from 0194; restore the enrollment source check to ('admin','self'))
