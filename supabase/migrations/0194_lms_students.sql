-- Bible School for people outside the church ("students"). A student applies on the church's public
-- Bible School page, a team member approves them, and they sign in to the app with their phone number
-- and see the Bible School only.
--
-- A student is a row in members with status 'student', so no second person table exists. Because every
-- church feature (membership fees, follow-ups, birthdays, directory, messaging, events, giving) looks at
-- members whose status is 'active', students are left out of all of it automatically.

-- members: one more status.
alter table public.members
  drop constraint if exists members_status_check,
  add constraint members_status_check check (status in ('active', 'left', 'pending', 'student'));

-- Courses can be shown to the public: on the church's Bible School page and to students.
alter table public.lms_courses
  drop constraint if exists lms_courses_visibility_check,
  add constraint lms_courses_visibility_check check (visibility in ('organization', 'unlisted', 'public'));

-- Applications from the public page.
create table if not exists public.lms_student_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid references public.lms_courses (id) on delete set null,
  first_name text not null check (length(trim(first_name)) between 1 and 60),
  last_name text not null check (length(trim(last_name)) between 1 and 60),
  phone text not null check (length(phone) between 7 and 20),
  email text check (email is null or length(email) <= 200),
  message text check (message is null or length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  member_id uuid references public.members (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists lms_student_applications_org_idx on public.lms_student_applications (organization_id, status, created_at desc);
-- One waiting application per phone number and church.
create unique index if not exists lms_student_applications_one_pending_idx
  on public.lms_student_applications (organization_id, right(regexp_replace(phone, '\D', '', 'g'), 10))
  where status = 'pending';

alter table public.lms_student_applications enable row level security;
drop policy if exists "Staff can view lms_student_applications" on public.lms_student_applications;
create policy "Staff can view lms_student_applications"
  on public.lms_student_applications for select to authenticated
  using (public.is_org_member(organization_id));
-- No other policy: applications are written by the server (service role) only.

-- ---------------------------------------------------------------------------------------------
-- Who counts as a learner: active members and students.
-- ---------------------------------------------------------------------------------------------

create or replace function public.lms_my_member_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.members where auth_user_id = auth.uid() and status in ('active', 'student');
$$;

create or replace function public.lms_my_member_in_org(p_org uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.id from public.members m where m.organization_id = p_org and m.auth_user_id = auth.uid() and m.status in ('active', 'student') limit 1;
$$;

-- Whether the signed-in user is a student (not a church member) in a church.
create or replace function public.lms_is_student(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.members m where m.organization_id = p_org and m.auth_user_id = auth.uid() and m.status = 'student');
$$;
revoke all on function public.lms_is_student(uuid) from public, anon, authenticated;

-- Enrollment accepts a student as well as an active member.
create or replace function public.lms_create_enrollment(
  p_organization_id uuid,
  p_course_id uuid,
  p_member_id uuid,
  p_status text,
  p_source text,
  p_actor uuid,
  p_ignore_window boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.lms_courses%rowtype;
  taken integer;
  new_id uuid;
begin
  if p_status not in ('pending', 'approved') then
    raise exception 'An enrollment starts as pending or approved.';
  end if;

  -- Serialises enrollments for one course so the capacity check cannot be raced.
  select * into c from public.lms_courses where id = p_course_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'That course could not be found.';
  end if;
  if c.status <> 'published' then
    raise exception 'This course is not open for enrollment.';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and organization_id = p_organization_id and status in ('active', 'student')) then
    raise exception 'That student could not be found.';
  end if;
  if not p_ignore_window then
    if c.enrollment_opens_at is not null and now() < c.enrollment_opens_at then
      raise exception 'Enrollment has not opened yet.';
    end if;
    if c.enrollment_closes_at is not null and now() > c.enrollment_closes_at then
      raise exception 'Enrollment has closed.';
    end if;
  end if;
  if exists (select 1 from public.lms_enrollments where course_id = p_course_id and member_id = p_member_id and status in ('pending', 'approved', 'active')) then
    raise exception 'This student already has an open enrollment in the course.';
  end if;
  if c.capacity is not null then
    select count(*) into taken from public.lms_enrollments where course_id = p_course_id and status in ('approved', 'active');
    if p_status = 'approved' and taken >= c.capacity then
      raise exception 'This course is full.';
    end if;
  end if;

  insert into public.lms_enrollments (organization_id, course_id, member_id, status, source, decided_at, decided_by, enrolled_at)
  values (
    p_organization_id, p_course_id, p_member_id, p_status, p_source,
    case when p_status = 'approved' then now() end,
    case when p_status = 'approved' then p_actor end,
    case when p_status = 'approved' then now() end
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- The catalogue: a church member sees public and church-only courses; a student sees public courses and
-- any course they have joined.
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
  missing_prerequisites text
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
           where pe.course_id = p.prerequisite_course_id and pe.member_id = public.lms_my_member_in_org(p_org) and pe.status = 'completed'))
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


-- ---------------------------------------------------------------------------------------------
-- A student sees only public courses (and ones they joined). The student functions check it.
-- ---------------------------------------------------------------------------------------------

-- Whether the signed-in user may see a course at all: public courses, church-only courses for church
-- members (not for students), and any course they have joined.
create or replace function public.lms_course_visible(p_course uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lms_courses c
     where c.id = p_course
       and c.status = 'published'
       and (
         c.visibility = 'public'
         or (c.visibility in ('organization', 'unlisted') and not public.lms_is_student(c.organization_id))
         or exists (
           select 1 from public.lms_enrollments e
            where e.course_id = c.id and e.member_id = public.lms_my_member_in_org(c.organization_id))
       )
  );
$$;
revoke all on function public.lms_course_visible(uuid) from public, anon, authenticated;


-- Asking to join: a student can only ask for a course they can see.
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

-- The outline of a course: only for people who can see the course.
create or replace function public.lms_course_outline(p_course uuid)
returns table (
  module_id uuid,
  module_title text,
  module_position integer,
  lesson_id uuid,
  lesson_title text,
  content_type text,
  duration_minutes integer,
  lesson_position integer,
  is_required boolean,
  is_free_preview boolean,
  completed boolean,
  locked boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (
    select c.id as course_id, c.organization_id as org, public.lms_my_member_in_org(c.organization_id) as member_id
      from public.lms_courses c where c.id = p_course and c.status = 'published'
  ),
  enrolled as (
    select exists (
      select 1 from public.lms_enrollments e join me on me.member_id = e.member_id
       where e.course_id = p_course and e.status in ('approved', 'active', 'completed')) as ok
  )
  select
    m.id,
    m.title,
    m.position,
    l.id,
    l.title,
    l.content_type,
    l.duration_minutes,
    l.position,
    l.is_required,
    l.is_free_preview,
    exists (select 1 from public.lms_lesson_progress lp join me on me.member_id = lp.member_id where lp.lesson_id = l.id and lp.completed_at is not null),
    (not ((select enrolled.ok from enrolled) or l.is_free_preview))
      or (l.prerequisite_lesson_id is not null
          and not exists (select 1 from public.lms_lesson_progress lp2 join me on me.member_id = lp2.member_id where lp2.lesson_id = l.prerequisite_lesson_id and lp2.completed_at is not null))
  from public.lms_modules m
  join public.lms_lessons l on l.module_id = m.id
  where m.course_id = p_course
    and m.status = 'published'
    and l.status = 'published'
    and exists (select 1 from me where me.member_id is not null and public.lms_feature_available(me.org))
    and public.lms_course_visible(p_course)
  order by m.position, m.created_at, l.position, l.created_at;
$$;

-- Opening a lesson: only in a course the person can see.
create or replace function public.lms_get_lesson(p_lesson uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.lms_lessons%rowtype;
  c public.lms_courses%rowtype;
  v_member uuid;
  v_enr public.lms_enrollments%rowtype;
  v_enrolled boolean;
  v_note public.lms_lesson_notes%rowtype;
  v_progress public.lms_lesson_progress%rowtype;
begin
  select * into l from public.lms_lessons where id = p_lesson and status = 'published';
  if not found then
    raise exception 'That lesson could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id)
     or not exists (select 1 from public.lms_modules m where m.id = l.module_id and m.status = 'published') then
    raise exception 'That lesson could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'That lesson could not be found.';
  end if;

  select * into v_enr from public.lms_enrollments
   where course_id = c.id and member_id = v_member and status in ('approved', 'active', 'completed')
   order by requested_at desc limit 1;
  v_enrolled := found;
  if not v_enrolled and not l.is_free_preview then
    raise exception 'Join this course to open this lesson.';
  end if;
  if v_enrolled and l.prerequisite_lesson_id is not null and not exists (
    select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
  ) then
    raise exception 'Finish the earlier lesson first.';
  end if;

  if v_enrolled then
    update public.lms_enrollments
       set last_lesson_id = l.id,
           status = case when status = 'approved' then 'active' else status end
     where id = v_enr.id;
    insert into public.lms_lesson_progress (organization_id, enrollment_id, lesson_id, member_id)
    values (c.organization_id, v_enr.id, l.id, v_member)
    on conflict (enrollment_id, lesson_id) do update set last_opened_at = now();
    select * into v_progress from public.lms_lesson_progress where enrollment_id = v_enr.id and lesson_id = l.id;
  end if;

  select * into v_note from public.lms_lesson_notes where member_id = v_member and lesson_id = l.id;

  return jsonb_build_object(
    'id', l.id,
    'course_id', c.id,
    'title', l.title,
    'content_type', l.content_type,
    'body', l.body,
    'media_url', l.media_url,
    'file_name', l.file_name,
    'has_file', l.file_path is not null,
    'duration_minutes', l.duration_minutes,
    'is_required', l.is_required,
    'enrolled', v_enrolled,
    'completed', coalesce(v_progress.completed_at is not null, false),
    'position_seconds', coalesce(v_progress.position_seconds, 0),
    'watched_seconds', coalesce(v_progress.watched_seconds, 0),
    'duration_seconds', v_progress.duration_seconds,
    'note', coalesce(v_note.note, ''),
    'bookmarked', coalesce(v_note.bookmarked, false)
  );
end;
$$;

create or replace function public.lms_save_note(p_lesson uuid, p_note text, p_bookmarked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.lms_lessons%rowtype;
  c public.lms_courses%rowtype;
  v_member uuid;
begin
  if length(coalesce(p_note, '')) > 5000 then
    raise exception 'Keep your note under 5000 characters.';
  end if;
  select * into l from public.lms_lessons where id = p_lesson and status = 'published';
  if not found then
    raise exception 'That lesson could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id) then
    raise exception 'That lesson could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null or not (
    l.is_free_preview or exists (
      select 1 from public.lms_enrollments e where e.course_id = c.id and e.member_id = v_member and e.status in ('approved', 'active', 'completed'))
  ) then
    raise exception 'Join this course to keep notes.';
  end if;
  insert into public.lms_lesson_notes (member_id, lesson_id, organization_id, note, bookmarked, updated_at)
  values (v_member, l.id, c.organization_id, coalesce(p_note, ''), coalesce(p_bookmarked, false), now())
  on conflict (member_id, lesson_id) do update
     set note = excluded.note, bookmarked = excluded.bookmarked, updated_at = now();
end;
$$;

create or replace function public.lms_lesson_file_access(p_lesson uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  l public.lms_lessons%rowtype;
  c public.lms_courses%rowtype;
  v_member uuid;
begin
  select * into l from public.lms_lessons where id = p_lesson and status = 'published' and file_path is not null;
  if not found then
    return null;
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id) then
    return null;
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    return null;
  end if;
  if l.is_free_preview or exists (
    select 1 from public.lms_enrollments e where e.course_id = c.id and e.member_id = v_member and e.status in ('approved', 'active', 'completed')
  ) then
    if l.prerequisite_lesson_id is not null and not l.is_free_preview and not exists (
      select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
    ) then
      return null;
    end if;
    return l.file_path;
  end if;
  return null;
end;
$$;

-- Members who may read published courses directly (the app uses the functions above): public courses too.
drop policy if exists "Members can view published courses" on public.lms_courses;
create policy "Members can view published courses"
  on public.lms_courses for select to authenticated
  using (
    status = 'published'
    and public.is_linked_member(organization_id)
    and (visibility in ('organization', 'public') or public.lms_has_course_access(id))
  );

-- ---------------------------------------------------------------------------------------------
-- Approving an application (service role only, in one transaction)
-- ---------------------------------------------------------------------------------------------

-- Turns an application into a student: reuses the person if the church already has them (a member or a
-- student with this phone number), creates a student otherwise, enrolls them in the chosen course, and
-- closes the application. A phone number already used by another church is refused, because the app
-- signs a phone number in to exactly one church.
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

-- Reversal (run manually if needed; students must be removed first):
--   delete from public.members where status = 'student';
--   drop function if exists public.lms_approve_application(uuid, uuid, uuid, uuid), public.lms_is_student(uuid);
--   drop table if exists public.lms_student_applications;
--   alter table public.members drop constraint if exists members_status_check, add constraint members_status_check check (status in ('active', 'left', 'pending'));
--   alter table public.lms_courses drop constraint if exists lms_courses_visibility_check, add constraint lms_courses_visibility_check check (visibility in ('organization', 'unlisted'));
--   (and re-run the lms_my_member_ids, lms_my_member_in_org, lms_create_enrollment and lms_catalog definitions from 0190 / 0191)
