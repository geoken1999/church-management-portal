-- Bible School (LMS), phase 1: settings, programs, courses, curriculum, instructors and enrollments.
-- Everything is additive. Students are existing members (members.id), organizations and branches are
-- the existing ones, and sign-in is unchanged.
--
-- Access model (see docs/bible-school.md):
--   * staff (organization_members) can read their church's LMS rows; owners/admins can write them
--     directly, and everyone else is let in by the server after the "bibleschool" tab check, using the
--     service role, exactly like the other modules;
--   * a signed-in member (phone login) can read published courses of their church and, once enrolled,
--     the curriculum of that course, and their own enrollments. They cannot write anything here.

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- The member rows (one per church) that belong to the signed-in user.
create or replace function public.lms_my_member_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.members where auth_user_id = auth.uid() and status = 'active';
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lms_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  school_name text not null default '' check (length(school_name) <= 120),
  tagline text check (tagline is null or length(tagline) <= 200),
  default_language text not null default 'en' check (length(default_language) between 2 and 10),
  -- Whether a student's enrollment request waits for an admin (true) or is approved straight away.
  enrollment_requires_approval boolean not null default true,
  -- Whether members may ask to join a course themselves (from the student portal, phase 2).
  allow_self_enrollment boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Programs and courses
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lms_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 120),
  description text check (description is null or length(description) <= 4000),
  objectives text check (objectives is null or length(objectives) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_programs_org_idx on public.lms_programs (organization_id, status);

create table if not exists public.lms_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  code text check (code is null or code ~ '^[A-Za-z0-9-]{2,20}$'),
  title text not null check (length(trim(title)) between 3 and 120),
  description text check (description is null or length(description) <= 4000),
  objectives text check (objectives is null or length(objectives) <= 4000),
  cover_image_url text,
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  language text not null default 'en' check (length(language) between 2 and 30),
  delivery_mode text not null default 'self_paced' check (delivery_mode in ('self_paced', 'instructor_led', 'blended')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- Who can see the course in the catalogue: everyone in the church, or only people who have its link.
  visibility text not null default 'organization' check (visibility in ('organization', 'unlisted')),
  enrollment_opens_at timestamptz,
  enrollment_closes_at timestamptz,
  starts_on date,
  ends_on date,
  estimated_hours numeric check (estimated_hours is null or (estimated_hours >= 0 and estimated_hours <= 10000)),
  capacity integer check (capacity is null or capacity > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (enrollment_closes_at is null or enrollment_opens_at is null or enrollment_closes_at > enrollment_opens_at),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists lms_courses_org_idx on public.lms_courses (organization_id, status);
create unique index if not exists lms_courses_org_code_idx on public.lms_courses (organization_id, lower(code)) where code is not null;

-- A program groups courses in an order; a course may be in several programs.
create table if not exists public.lms_program_courses (
  program_id uuid not null references public.lms_programs (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position integer not null default 0,
  is_required boolean not null default true,
  primary key (program_id, course_id)
);
create index if not exists lms_program_courses_course_idx on public.lms_program_courses (course_id);

create table if not exists public.lms_course_prerequisites (
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  prerequisite_course_id uuid not null references public.lms_courses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (course_id, prerequisite_course_id),
  check (course_id <> prerequisite_course_id)
);

-- Instructors are existing members. A team login can be linked so the instructor can teach from the
-- dashboard (auth_user_id is that login).
create table if not exists public.lms_course_instructors (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  role text not null default 'lead' check (role in ('lead', 'assistant')),
  created_at timestamptz not null default now(),
  unique (course_id, member_id)
);
create index if not exists lms_course_instructors_auth_idx on public.lms_course_instructors (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Curriculum: course -> modules -> lessons
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lms_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  description text check (description is null or length(description) <= 2000),
  position integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_modules_course_idx on public.lms_modules (course_id, position);

create table if not exists public.lms_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.lms_modules (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  -- quiz, assignment and live_session lessons are created by later phases; the type is reserved now.
  content_type text not null default 'text' check (content_type in ('text', 'video', 'audio', 'document', 'resource', 'external', 'quiz', 'assignment', 'live_session')),
  -- Sanitized HTML for text lessons.
  body text check (body is null or length(body) <= 200000),
  -- A https link for video, audio, external and resource lessons.
  media_url text check (media_url is null or media_url ~ '^https://'),
  duration_minutes integer check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 1440)),
  position integer not null default 0,
  -- Whether finishing this lesson counts towards completing the course.
  is_required boolean not null default true,
  -- Visible to people who are not enrolled.
  is_free_preview boolean not null default false,
  prerequisite_lesson_id uuid references public.lms_lessons (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_lessons_module_idx on public.lms_lessons (module_id, position);
create index if not exists lms_lessons_course_idx on public.lms_lessons (course_id);

-- ---------------------------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lms_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'active', 'completed', 'withdrawn', 'rejected')),
  -- admin: enrolled by an administrator; self: the student asked.
  source text not null default 'admin' check (source in ('admin', 'self')),
  note text check (note is null or length(note) <= 500),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  enrolled_at timestamptz,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lms_enrollments_org_idx on public.lms_enrollments (organization_id, status);
create index if not exists lms_enrollments_course_idx on public.lms_enrollments (course_id, status);
create index if not exists lms_enrollments_member_idx on public.lms_enrollments (member_id);
-- One open enrollment per student and course.
create unique index if not exists lms_enrollments_one_open_idx
  on public.lms_enrollments (course_id, member_id) where status in ('pending', 'approved', 'active');

-- Whether the signed-in member may read a course's curriculum: they have an approved, active or
-- completed enrollment in it.
create or replace function public.lms_has_course_access(target_course_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.lms_enrollments e
     where e.course_id = target_course_id
       and e.status in ('approved', 'active', 'completed')
       and e.member_id in (select public.lms_my_member_ids())
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Audit trail for sensitive actions
-- ---------------------------------------------------------------------------------------------

create table if not exists public.lms_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_auth_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lms_audit_events_org_idx on public.lms_audit_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['lms_settings', 'lms_programs', 'lms_courses', 'lms_modules', 'lms_lessons', 'lms_enrollments'] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Transactional operations (called by the server with the service role)
-- ---------------------------------------------------------------------------------------------

-- Creates an enrollment, enforcing the course's rules in one transaction: the course must belong to
-- the church and be published, the student must be an active member of the same church, enrollment
-- must be open (unless an administrator overrides the window), and the course must not be full.
-- Returns the new enrollment id. Errors are raised with a plain message for the caller to show.
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
  if not exists (select 1 from public.members where id = p_member_id and organization_id = p_organization_id and status = 'active') then
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

-- Approves a pending enrollment (capacity checked), or moves an open one along. The caller passes the
-- church so one church can never touch another's enrollment.
create or replace function public.lms_decide_enrollment(
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
  e public.lms_enrollments%rowtype;
  c public.lms_courses%rowtype;
  taken integer;
  next_status text;
begin
  select * into e from public.lms_enrollments where id = p_enrollment_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'That enrollment could not be found.';
  end if;
  select * into c from public.lms_courses where id = e.course_id for update;

  if p_action = 'approve' and e.status = 'pending' then
    next_status := 'approved';
    if c.capacity is not null then
      select count(*) into taken from public.lms_enrollments where course_id = e.course_id and status in ('approved', 'active');
      if taken >= c.capacity then
        raise exception 'This course is full.';
      end if;
    end if;
  elsif p_action = 'reject' and e.status = 'pending' then
    next_status := 'rejected';
  elsif p_action = 'activate' and e.status = 'approved' then
    next_status := 'active';
  elsif p_action = 'withdraw' and e.status in ('pending', 'approved', 'active') then
    next_status := 'withdrawn';
  else
    raise exception 'That change is not possible for an enrollment that is %.', e.status;
  end if;

  update public.lms_enrollments
     set status = next_status,
         decided_at = case when p_action in ('approve', 'reject') then now() else decided_at end,
         decided_by = case when p_action in ('approve', 'reject') then p_actor else decided_by end,
         enrolled_at = case when p_action = 'approve' then now() else enrolled_at end,
         withdrawn_at = case when p_action = 'withdraw' then now() else withdrawn_at end
   where id = p_enrollment_id;
  return next_status;
end;
$$;

-- Moves a module up (-1) or down (1) among its course's modules, renumbering them 0..n in one go.
create or replace function public.lms_move_module(p_organization_id uuid, p_module_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.lms_modules%rowtype;
  ids uuid[];
  idx integer;
  swap integer;
  tmp uuid;
begin
  select * into m from public.lms_modules where id = p_module_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That module could not be found.';
  end if;
  perform pg_advisory_xact_lock(hashtext('lms-modules-' || m.course_id::text));
  select array_agg(id order by position, created_at) into ids from public.lms_modules where course_id = m.course_id;
  idx := array_position(ids, p_module_id);
  swap := idx + case when p_direction < 0 then -1 else 1 end;
  if swap >= 1 and swap <= array_length(ids, 1) then
    tmp := ids[idx]; ids[idx] := ids[swap]; ids[swap] := tmp;
  end if;
  for i in 1 .. array_length(ids, 1) loop
    update public.lms_modules set position = i - 1 where id = ids[i];
  end loop;
end;
$$;

-- Same for lessons within a module.
create or replace function public.lms_move_lesson(p_organization_id uuid, p_lesson_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.lms_lessons%rowtype;
  ids uuid[];
  idx integer;
  swap integer;
  tmp uuid;
begin
  select * into l from public.lms_lessons where id = p_lesson_id and organization_id = p_organization_id;
  if not found then
    raise exception 'That lesson could not be found.';
  end if;
  perform pg_advisory_xact_lock(hashtext('lms-lessons-' || l.module_id::text));
  select array_agg(id order by position, created_at) into ids from public.lms_lessons where module_id = l.module_id;
  idx := array_position(ids, p_lesson_id);
  swap := idx + case when p_direction < 0 then -1 else 1 end;
  if swap >= 1 and swap <= array_length(ids, 1) then
    tmp := ids[idx]; ids[idx] := ids[swap]; ids[swap] := tmp;
  end if;
  for i in 1 .. array_length(ids, 1) loop
    update public.lms_lessons set position = i - 1 where id = ids[i];
  end loop;
end;
$$;

-- These run with the service role only; nobody signed in may call them directly.
revoke all on function public.lms_create_enrollment(uuid, uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.lms_decide_enrollment(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.lms_move_module(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.lms_move_lesson(uuid, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.lms_settings enable row level security;
alter table public.lms_programs enable row level security;
alter table public.lms_courses enable row level security;
alter table public.lms_program_courses enable row level security;
alter table public.lms_course_prerequisites enable row level security;
alter table public.lms_course_instructors enable row level security;
alter table public.lms_modules enable row level security;
alter table public.lms_lessons enable row level security;
alter table public.lms_enrollments enable row level security;
alter table public.lms_audit_events enable row level security;

do $$
declare
  t text;
begin
  -- Staff of the church can read; owners and admins can also write directly.
  foreach t in array array['lms_settings', 'lms_programs', 'lms_courses', 'lms_program_courses', 'lms_course_prerequisites', 'lms_course_instructors', 'lms_modules', 'lms_lessons', 'lms_enrollments'] loop
    execute format('drop policy if exists "Staff can view %1$s" on public.%1$s', t);
    execute format('create policy "Staff can view %1$s" on public.%1$s for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('drop policy if exists "Admins can insert %1$s" on public.%1$s', t);
    execute format('create policy "Admins can insert %1$s" on public.%1$s for insert to authenticated with check (public.is_org_admin(organization_id))', t);
    execute format('drop policy if exists "Admins can update %1$s" on public.%1$s', t);
    execute format('create policy "Admins can update %1$s" on public.%1$s for update to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id))', t);
    execute format('drop policy if exists "Admins can delete %1$s" on public.%1$s', t);
    execute format('create policy "Admins can delete %1$s" on public.%1$s for delete to authenticated using (public.is_org_admin(organization_id))', t);
  end loop;
end $$;

-- The audit trail: owners and admins read it; only the server writes it.
drop policy if exists "Admins can view lms_audit_events" on public.lms_audit_events;
create policy "Admins can view lms_audit_events"
  on public.lms_audit_events for select to authenticated
  using (public.is_org_admin(organization_id));

-- Students (members signed in with their phone): published courses of their own church, except
-- unlisted ones they are not enrolled in; their own enrollments.
drop policy if exists "Members can view published courses" on public.lms_courses;
create policy "Members can view published courses"
  on public.lms_courses for select to authenticated
  using (
    status = 'published'
    and public.is_linked_member(organization_id)
    and (visibility = 'organization' or public.lms_has_course_access(id))
  );

drop policy if exists "Members can view their enrollments" on public.lms_enrollments;
create policy "Members can view their enrollments"
  on public.lms_enrollments for select to authenticated
  using (member_id in (select public.lms_my_member_ids()));

-- Curriculum: published modules and lessons, for enrolled students (free previews for any member of the church).
drop policy if exists "Students can view published modules" on public.lms_modules;
create policy "Students can view published modules"
  on public.lms_modules for select to authenticated
  using (
    status = 'published'
    and public.is_linked_member(organization_id)
    and exists (select 1 from public.lms_courses c where c.id = course_id and c.status = 'published')
  );

drop policy if exists "Students can view published lessons" on public.lms_lessons;
create policy "Students can view published lessons"
  on public.lms_lessons for select to authenticated
  using (
    status = 'published'
    and public.is_linked_member(organization_id)
    and exists (select 1 from public.lms_courses c where c.id = course_id and c.status = 'published')
    and (is_free_preview or public.lms_has_course_access(course_id))
  );

drop policy if exists "Students can view their course instructors" on public.lms_course_instructors;
create policy "Students can view their course instructors"
  on public.lms_course_instructors for select to authenticated
  using (public.is_linked_member(organization_id));

-- ---------------------------------------------------------------------------------------------
-- Course cover images (public: a cover is not sensitive)
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lms-course-covers', 'lms-course-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Reversal (run manually if needed; this removes all Bible School data):
--   drop function if exists public.lms_move_lesson(uuid, uuid, integer);
--   drop function if exists public.lms_move_module(uuid, uuid, integer);
--   drop function if exists public.lms_decide_enrollment(uuid, uuid, text, uuid);
--   drop function if exists public.lms_create_enrollment(uuid, uuid, uuid, text, text, uuid, boolean);
--   drop table if exists public.lms_audit_events, public.lms_enrollments, public.lms_lessons, public.lms_modules,
--     public.lms_course_instructors, public.lms_course_prerequisites, public.lms_program_courses,
--     public.lms_courses, public.lms_programs, public.lms_settings;
--   drop function if exists public.lms_has_course_access(uuid);
--   drop function if exists public.lms_my_member_ids();
--   delete from storage.buckets where id = 'lms-course-covers';
