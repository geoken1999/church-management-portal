-- Enrollment and payment at program level. A program groups courses (Bible School, Program, Course, Module,
-- Lesson). A student joins a program, pays for the program, and is enrolled in every course of it. Courses
-- that belong to no program can still be joined on their own (free); a course in a program is joined through
-- the program. The course fee column from 0197 is no longer used by the screens.

alter table public.lms_programs add column if not exists price_amount numeric(10, 2)
  check (price_amount is null or (price_amount > 0 and price_amount <= 100000));
alter table public.lms_programs add column if not exists capacity integer check (capacity is null or capacity >= 1);
alter table public.lms_programs add column if not exists visibility text not null default 'organization'
  check (visibility in ('organization', 'public'));

create table if not exists public.lms_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null references public.lms_programs (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'active', 'completed', 'withdrawn', 'rejected')),
  source text not null default 'admin' check (source in ('admin', 'self', 'payment')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  enrolled_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_program_enrollments_org_idx on public.lms_program_enrollments (organization_id, status);
create index if not exists lms_program_enrollments_program_idx on public.lms_program_enrollments (program_id, status);
create unique index if not exists lms_program_enrollments_one_open_idx
  on public.lms_program_enrollments (program_id, member_id) where status in ('pending', 'approved', 'active');

alter table public.lms_program_enrollments enable row level security;
drop policy if exists "Staff can view lms_program_enrollments" on public.lms_program_enrollments;
create policy "Staff can view lms_program_enrollments"
  on public.lms_program_enrollments for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "Students can view their own program enrollments" on public.lms_program_enrollments;
create policy "Students can view their own program enrollments"
  on public.lms_program_enrollments for select to authenticated
  using (member_id in (select public.lms_my_member_ids()));
-- No write policy: program enrollments are written by the functions below (service role) only.

alter table public.lms_enrollments add column if not exists program_enrollment_id uuid references public.lms_program_enrollments (id) on delete set null;
alter table public.lms_enrollments drop constraint if exists lms_enrollments_source_check;
alter table public.lms_enrollments add constraint lms_enrollments_source_check check (source in ('admin', 'self', 'payment', 'program'));

alter table public.lms_student_applications add column if not exists program_id uuid references public.lms_programs (id) on delete set null;

alter table public.lms_payment_orders alter column course_id drop not null;
alter table public.lms_payment_orders add column if not exists program_id uuid references public.lms_programs (id) on delete cascade;
alter table public.lms_payment_orders drop constraint if exists lms_payment_orders_check;
alter table public.lms_payment_orders add constraint lms_payment_orders_target_check check (course_id is not null or program_id is not null);
alter table public.lms_payment_orders add constraint lms_payment_orders_payer_check check (member_id is not null or application_id is not null);
create index if not exists lms_payment_orders_program_idx on public.lms_payment_orders (program_id);

-- ---------------------------------------------------------------------------------------------
-- Who may see a program
-- ---------------------------------------------------------------------------------------------

create or replace function public.lms_program_visible(p_program uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lms_programs p
     where p.id = p_program
       and p.status = 'published'
       and (
         p.visibility = 'public'
         or (p.visibility = 'organization' and not public.lms_is_student(p.organization_id))
         or exists (
           select 1 from public.lms_program_enrollments e
            where e.program_id = p.id and e.member_id = public.lms_my_member_in_org(p.organization_id))
       )
  );
$$;
revoke all on function public.lms_program_visible(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enrolling in a program (service role / internal)
-- ---------------------------------------------------------------------------------------------

-- Gives an approved program enrollment its course enrollments: one per published course in the program,
-- skipping courses the student already has open or has finished. Capacity and dates of single courses do
-- not apply: the program has its own seat limit.
create or replace function public.lms_program_sync_courses(p_program_enrollment uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pe public.lms_program_enrollments%rowtype;
  made integer := 0;
  r record;
begin
  select * into pe from public.lms_program_enrollments where id = p_program_enrollment;
  if not found or pe.status not in ('approved', 'active') then
    return 0;
  end if;
  for r in
    select pc.course_id
      from public.lms_program_courses pc
      join public.lms_courses c on c.id = pc.course_id
     where pc.program_id = pe.program_id and c.status = 'published'
  loop
    if not exists (
      select 1 from public.lms_enrollments e
       where e.course_id = r.course_id and e.member_id = pe.member_id and e.status in ('pending', 'approved', 'active', 'completed')
    ) then
      insert into public.lms_enrollments (organization_id, course_id, member_id, status, source, decided_at, enrolled_at, program_enrollment_id)
      values (pe.organization_id, r.course_id, pe.member_id, 'approved', 'program', now(), now(), pe.id);
      made := made + 1;
    end if;
  end loop;
  return made;
end;
$$;
revoke all on function public.lms_program_sync_courses(uuid) from public, anon, authenticated;

create or replace function public.lms_enroll_program(
  p_organization_id uuid,
  p_program_id uuid,
  p_member_id uuid,
  p_status text,
  p_source text,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.lms_programs%rowtype;
  taken integer;
  new_id uuid;
begin
  if p_status not in ('pending', 'approved') then
    raise exception 'An enrollment starts as pending or approved.';
  end if;
  select * into p from public.lms_programs where id = p_program_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'That program could not be found.';
  end if;
  if p.status <> 'published' then
    raise exception 'This program is not open for enrollment.';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and organization_id = p_organization_id and status in ('active', 'student')) then
    raise exception 'That student could not be found.';
  end if;
  if exists (select 1 from public.lms_program_enrollments where program_id = p_program_id and member_id = p_member_id and status in ('pending', 'approved', 'active')) then
    raise exception 'This student already has an open enrollment in the program.';
  end if;
  if p.capacity is not null and p_status = 'approved' then
    select count(*) into taken from public.lms_program_enrollments where program_id = p_program_id and status in ('approved', 'active');
    if taken >= p.capacity then
      raise exception 'This program is full.';
    end if;
  end if;

  insert into public.lms_program_enrollments (organization_id, program_id, member_id, status, source, decided_at, decided_by, enrolled_at)
  values (
    p_organization_id, p_program_id, p_member_id, p_status, p_source,
    case when p_status = 'approved' then now() end,
    case when p_status = 'approved' then p_actor end,
    case when p_status = 'approved' then now() end
  )
  returning id into new_id;
  if p_status = 'approved' then
    perform public.lms_program_sync_courses(new_id);
  end if;
  return new_id;
end;
$$;
revoke all on function public.lms_enroll_program(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.lms_decide_program_enrollment(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_action text,
  p_actor uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.lms_program_enrollments%rowtype;
  p public.lms_programs%rowtype;
  taken integer;
  next_status text;
begin
  select * into e from public.lms_program_enrollments where id = p_enrollment_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'That enrollment could not be found.';
  end if;
  select * into p from public.lms_programs where id = e.program_id for update;

  if p_action = 'approve' and e.status = 'pending' then
    next_status := 'approved';
    if p.capacity is not null then
      select count(*) into taken from public.lms_program_enrollments where program_id = e.program_id and status in ('approved', 'active');
      if taken >= p.capacity then
        raise exception 'This program is full.';
      end if;
    end if;
  elsif p_action = 'reject' and e.status = 'pending' then
    next_status := 'rejected';
  elsif p_action = 'withdraw' and e.status in ('pending', 'approved', 'active') then
    next_status := 'withdrawn';
  else
    raise exception 'That change is not possible for an enrollment that is %.', e.status;
  end if;

  update public.lms_program_enrollments
     set status = next_status,
         decided_at = case when p_action in ('approve', 'reject') then now() else decided_at end,
         decided_by = case when p_action in ('approve', 'reject') then p_actor else decided_by end,
         enrolled_at = case when p_action = 'approve' then now() else enrolled_at end,
         withdrawn_at = case when p_action = 'withdraw' then now() else withdrawn_at end,
         updated_at = now()
   where id = p_enrollment_id;

  if next_status = 'approved' then
    perform public.lms_program_sync_courses(p_enrollment_id);
  elsif next_status = 'withdrawn' then
    -- The course enrollments that came with the program go too; finished courses and progress stay.
    update public.lms_enrollments
       set status = 'withdrawn', withdrawn_at = now()
     where program_enrollment_id = p_enrollment_id and status in ('pending', 'approved', 'active');
  end if;
  return next_status;
end;
$$;
revoke all on function public.lms_decide_program_enrollment(uuid, uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Student functions
-- ---------------------------------------------------------------------------------------------

create or replace function public.lms_program_catalog(p_org uuid)
returns table (
  program_id uuid,
  title text,
  description text,
  objectives text,
  capacity integer,
  seats_taken integer,
  course_count integer,
  lesson_count integer,
  my_status text,
  price_amount numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.description,
    p.objectives,
    p.capacity,
    (select count(*)::integer from public.lms_program_enrollments e where e.program_id = p.id and e.status in ('approved', 'active')),
    (select count(*)::integer from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id where pc.program_id = p.id and c.status = 'published'),
    (select count(*)::integer
       from public.lms_program_courses pc
       join public.lms_lessons l on l.course_id = pc.course_id and l.status = 'published'
       join public.lms_modules m on m.id = l.module_id and m.status = 'published'
      where pc.program_id = p.id),
    (select e.status from public.lms_program_enrollments e
      where e.program_id = p.id and e.member_id = public.lms_my_member_in_org(p_org)
      order by (e.status in ('pending', 'approved', 'active')) desc, e.requested_at desc limit 1),
    p.price_amount
  from public.lms_programs p
  where p.organization_id = p_org
    and public.lms_feature_available(p_org)
    and public.lms_my_member_in_org(p_org) is not null
    and public.lms_program_visible(p.id)
  order by p.title;
$$;

create or replace function public.lms_program_courses_list(p_program uuid)
returns table (
  course_id uuid,
  title text,
  description text,
  course_position integer,
  is_required boolean,
  lesson_count integer,
  my_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id,
    c.title,
    c.description,
    pc.position,
    pc.is_required,
    (select count(*)::integer from public.lms_lessons l join public.lms_modules m on m.id = l.module_id
      where l.course_id = c.id and l.status = 'published' and m.status = 'published'),
    (select e.status from public.lms_enrollments e
      where e.course_id = c.id and e.member_id = public.lms_my_member_in_org(c.organization_id)
      order by (e.status in ('pending', 'approved', 'active')) desc, e.requested_at desc limit 1)
  from public.lms_program_courses pc
  join public.lms_courses c on c.id = pc.course_id
  join public.lms_programs p on p.id = pc.program_id
  where pc.program_id = p_program
    and c.status = 'published'
    and public.lms_feature_available(p.organization_id)
    and public.lms_my_member_in_org(p.organization_id) is not null
    and public.lms_program_visible(p_program)
  order by pc.position, c.title;
$$;

create or replace function public.lms_my_programs(p_org uuid)
returns table (
  enrollment_id uuid,
  program_id uuid,
  title text,
  status text,
  courses_total integer,
  courses_done integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    p.id,
    p.title,
    case
      when e.status in ('approved', 'active')
       and (select count(*) from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
             where pc.program_id = p.id and pc.is_required and c.status = 'published') > 0
       and not exists (
         select 1 from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
          where pc.program_id = p.id and pc.is_required and c.status = 'published'
            and not exists (select 1 from public.lms_enrollments ce where ce.course_id = pc.course_id and ce.member_id = e.member_id and ce.status = 'completed'))
      then 'completed'
      else e.status
    end,
    (select count(*)::integer from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
      where pc.program_id = p.id and pc.is_required and c.status = 'published'),
    (select count(*)::integer from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
      where pc.program_id = p.id and pc.is_required and c.status = 'published'
        and exists (select 1 from public.lms_enrollments ce where ce.course_id = pc.course_id and ce.member_id = e.member_id and ce.status = 'completed'))
  from public.lms_program_enrollments e
  join public.lms_programs p on p.id = e.program_id
  where e.organization_id = p_org
    and e.member_id = public.lms_my_member_in_org(p_org)
    and e.status in ('pending', 'approved', 'active', 'completed')
    and public.lms_feature_available(p_org)
  order by e.requested_at desc;
$$;

-- Asking to join a program. Programs with a fee go through payment instead.
create or replace function public.lms_request_program(p_program uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.lms_programs%rowtype;
  s public.lms_settings%rowtype;
  v_member uuid;
  v_status text;
begin
  select * into p from public.lms_programs where id = p_program and status = 'published';
  if not found or not public.lms_feature_available(p.organization_id) or not public.lms_program_visible(p.id) then
    raise exception 'That program could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(p.organization_id);
  if v_member is null then
    raise exception 'You need to be an active member of this church to join a program.';
  end if;
  if p.price_amount is not null then
    raise exception 'This program has a fee. Pay for it to join.';
  end if;
  select * into s from public.lms_settings where organization_id = p.organization_id;
  if found and not s.allow_self_enrollment then
    raise exception 'Your church is not taking requests from members right now.';
  end if;
  v_status := case when coalesce(s.enrollment_requires_approval, true) then 'pending' else 'approved' end;
  perform public.lms_enroll_program(p.organization_id, p.id, v_member, v_status, 'self', null);
  return v_status;
end;
$$;

-- The published program a course belongs to, if any, for a course the person can see: used to send them to
-- the program to join.
create or replace function public.lms_course_program(p_course uuid)
returns table (program_id uuid, title text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.title
    from public.lms_program_courses pc
    join public.lms_programs p on p.id = pc.program_id
   where pc.course_id = p_course
     and p.status = 'published'
     and public.lms_program_visible(p.id)
   order by p.created_at
   limit 1;
$$;

-- A course that belongs to a published program is joined through the program.
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
  v_program text;
begin
  select * into c from public.lms_courses where id = p_course and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id) then
    raise exception 'That course could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'You need to be an active member of this church to join a course.';
  end if;
  select p.title into v_program
    from public.lms_program_courses pc join public.lms_programs p on p.id = pc.program_id
   where pc.course_id = c.id and p.status = 'published' limit 1;
  if v_program is not null then
    raise exception 'This course is part of the program "%". Join the program to take it.', v_program;
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

-- Approving an application can enrol the person in a program.
drop function if exists public.lms_approve_application(uuid, uuid, uuid, uuid);
create or replace function public.lms_approve_application(p_org uuid, p_application uuid, p_course uuid, p_actor uuid, p_program uuid default null)
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

  if p_program is not null then
    if not exists (select 1 from public.lms_program_enrollments e where e.program_id = p_program and e.member_id = v_member and e.status in ('pending', 'approved', 'active')) then
      perform public.lms_enroll_program(p_org, p_program, v_member, 'approved', 'admin', p_actor);
      v_enrolled := true;
    end if;
  elsif p_course is not null
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
revoke all on function public.lms_approve_application(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.lms_program_catalog(uuid) from public, anon;
revoke all on function public.lms_program_courses_list(uuid) from public, anon;
revoke all on function public.lms_my_programs(uuid) from public, anon;
revoke all on function public.lms_request_program(uuid) from public, anon;
revoke all on function public.lms_course_program(uuid) from public, anon;
grant execute on function public.lms_program_catalog(uuid), public.lms_program_courses_list(uuid), public.lms_my_programs(uuid), public.lms_request_program(uuid), public.lms_course_program(uuid) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.lms_program_catalog(uuid), public.lms_program_courses_list(uuid), public.lms_my_programs(uuid), public.lms_request_program(uuid), public.lms_course_program(uuid), public.lms_decide_program_enrollment(uuid, uuid, text, uuid), public.lms_enroll_program(uuid, uuid, uuid, text, text, uuid), public.lms_program_sync_courses(uuid), public.lms_program_visible(uuid);
--   drop table if exists public.lms_program_enrollments cascade;
--   alter table public.lms_enrollments drop column if exists program_enrollment_id;
--   alter table public.lms_student_applications drop column if exists program_id;
--   alter table public.lms_payment_orders drop column if exists program_id;
--   alter table public.lms_programs drop column if exists price_amount, drop column if exists capacity, drop column if exists visibility;
--   (and re-run lms_request_enrollment and lms_approve_application from 0197)
