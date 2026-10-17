-- Bible School (LMS), phase 2: the learning experience. Students (members signed in with their phone)
-- browse the catalogue, ask to join courses, open lessons, tick them off, keep notes and bookmarks, and
-- finish courses. Everything a student does goes through the functions below, which work out who the
-- student is from the signed-in user (auth.uid()) and never trust a member id sent by the app.
--
-- Completion rule: a course is complete when every REQUIRED lesson that is published, in a published
-- module of a published course, has been completed by the student. Optional lessons never block it.
-- A finished course stays finished if lessons are added later.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- A lesson can carry a private file (PDF, slides, audio, video) instead of, or as well as, a link.
alter table public.lms_lessons
  add column if not exists file_path text,
  add column if not exists file_name text check (file_name is null or length(file_name) <= 200);

alter table public.lms_enrollments
  add column if not exists last_lesson_id uuid references public.lms_lessons (id) on delete set null;

-- One row per student, enrollment and lesson. completed_at set = done. Rows are never deleted with a
-- lesson (restrict), so published work cannot silently lose student progress.
create table if not exists public.lms_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null references public.lms_enrollments (id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  completed_at timestamptz,
  last_opened_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);
create index if not exists lms_lesson_progress_member_idx on public.lms_lesson_progress (member_id, lesson_id);
create index if not exists lms_lesson_progress_enrollment_idx on public.lms_lesson_progress (enrollment_id) where completed_at is not null;

-- A student's own notes and bookmark on a lesson. Private to them.
create table if not exists public.lms_lesson_notes (
  member_id uuid not null references public.members (id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  note text not null default '' check (length(note) <= 5000),
  bookmarked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (member_id, lesson_id)
);

alter table public.lms_lesson_progress enable row level security;
alter table public.lms_lesson_notes enable row level security;

-- Progress: the student sees their own; the church's staff see their church's (for rosters).
drop policy if exists "Students can view their progress" on public.lms_lesson_progress;
create policy "Students can view their progress"
  on public.lms_lesson_progress for select to authenticated
  using (member_id in (select public.lms_my_member_ids()));
drop policy if exists "Staff can view lms_lesson_progress" on public.lms_lesson_progress;
create policy "Staff can view lms_lesson_progress"
  on public.lms_lesson_progress for select to authenticated
  using (public.is_org_member(organization_id));

-- Notes: only the student. Not even the church's staff read them.
drop policy if exists "Students can view their notes" on public.lms_lesson_notes;
create policy "Students can view their notes"
  on public.lms_lesson_notes for select to authenticated
  using (member_id in (select public.lms_my_member_ids()));

-- Lesson files live in a private bucket; they are only ever handed out as short-lived links by the server.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lms-lesson-files', 'lms-lesson-files', false, 26214400)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (not callable by signed-in users)
-- ---------------------------------------------------------------------------------------------

-- Whether Bible School is switched on for a church: moved out of testing by the platform admin (beta
-- or live), and not switched off for the church's plan.
create or replace function public.lms_feature_available(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select f.enabled and f.status in ('beta', 'live') from public.platform_feature_flags f where f.tab_key = 'bibleschool'), false)
     and coalesce((select (o.custom_plan_limits -> 'tabOverrides' ->> 'bibleschool')::boolean from public.organizations o where o.id = p_org), true);
$$;

-- The signed-in user's active member row in a church, or null.
create or replace function public.lms_my_member_in_org(p_org uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.id from public.members m where m.organization_id = p_org and m.auth_user_id = auth.uid() and m.status = 'active' limit 1;
$$;

-- The lessons that count towards finishing a course.
create or replace function public.lms_required_lessons(p_course uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select l.id
    from public.lms_lessons l
    join public.lms_modules m on m.id = l.module_id
    join public.lms_courses c on c.id = l.course_id
   where l.course_id = p_course
     and l.status = 'published'
     and m.status = 'published'
     and c.status = 'published'
     and l.is_required;
$$;

revoke all on function public.lms_feature_available(uuid) from public, anon, authenticated;
revoke all on function public.lms_my_member_in_org(uuid) from public, anon, authenticated;
revoke all on function public.lms_required_lessons(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Student functions
-- ---------------------------------------------------------------------------------------------

-- The courses a member can see in their church: published ones (unlisted only when they have joined),
-- with their own status, the seats left, and whether the prerequisites are done.
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
      c.visibility = 'organization'
      or exists (select 1 from public.lms_enrollments e2 where e2.course_id = c.id and e2.member_id = public.lms_my_member_in_org(p_org))
    )
  order by c.title;
$$;

-- The member's courses with how far they have got.
create or replace function public.lms_my_courses(p_org uuid)
returns table (
  enrollment_id uuid,
  course_id uuid,
  title text,
  code text,
  cover_image_url text,
  status text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  required_total integer,
  required_done integer,
  last_lesson_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    c.id,
    c.title,
    c.code,
    c.cover_image_url,
    e.status,
    e.enrolled_at,
    e.completed_at,
    (select count(*)::integer from public.lms_required_lessons(c.id)),
    (select count(*)::integer
       from public.lms_lesson_progress lp
      where lp.enrollment_id = e.id
        and lp.completed_at is not null
        and lp.lesson_id in (select public.lms_required_lessons(c.id))),
    e.last_lesson_id
  from public.lms_enrollments e
  join public.lms_courses c on c.id = e.course_id
  where e.organization_id = p_org
    and e.member_id = public.lms_my_member_in_org(p_org)
    and e.status in ('pending', 'approved', 'active', 'completed')
    and public.lms_feature_available(p_org)
  order by (e.status = 'completed'), e.requested_at desc;
$$;

-- A course's outline: its published modules and lessons in order, with whether each is done and
-- whether it is locked (not enrolled and not a free preview, or waiting on an earlier lesson).
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
  order by m.position, m.created_at, l.position, l.created_at;
$$;

-- Asks to join a course. The rules are the church's: self-enrollment allowed, enrollment open, seats
-- left, prerequisites finished. Returns 'pending' (waits for an administrator) or 'approved'.
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
  if not found or not public.lms_feature_available(c.organization_id) then
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

-- Opens a lesson for the signed-in member and returns it. Notes where they are up to, and starts an
-- approved enrollment. Free previews open for any member of the church; everything else needs an
-- approved, active or completed enrollment and any earlier lesson it depends on.
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
begin
  select * into l from public.lms_lessons where id = p_lesson and status = 'published';
  if not found then
    raise exception 'That lesson could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id)
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
    'completed', coalesce((select lp.completed_at is not null from public.lms_lesson_progress lp where lp.lesson_id = l.id and lp.member_id = v_member), false),
    'note', coalesce(v_note.note, ''),
    'bookmarked', coalesce(v_note.bookmarked, false)
  );
end;
$$;

-- Marks a lesson done (or not done) for the signed-in member, and finishes the course when every
-- required lesson is done. Safe to call twice and from two devices at once: the enrollment row is
-- locked while it works, and finishing is a one-way step.
create or replace function public.lms_complete_lesson(p_lesson uuid, p_done boolean)
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
  v_total integer;
  v_done integer;
  v_completed boolean := false;
begin
  select * into l from public.lms_lessons where id = p_lesson and status = 'published';
  if not found then
    raise exception 'That lesson could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) then
    raise exception 'That lesson could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'That lesson could not be found.';
  end if;

  select * into v_enr from public.lms_enrollments
   where course_id = c.id and member_id = v_member and status in ('approved', 'active', 'completed')
   order by requested_at desc limit 1
   for update;
  if not found then
    raise exception 'Join this course to track your progress.';
  end if;
  if p_done and l.prerequisite_lesson_id is not null and not exists (
    select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
  ) then
    raise exception 'Finish the earlier lesson first.';
  end if;

  insert into public.lms_lesson_progress (organization_id, enrollment_id, lesson_id, member_id, completed_at, last_opened_at)
  values (c.organization_id, v_enr.id, l.id, v_member, case when p_done then now() end, now())
  on conflict (enrollment_id, lesson_id) do update
     set completed_at = case when p_done then coalesce(public.lms_lesson_progress.completed_at, now()) else null end,
         last_opened_at = now();

  select count(*) into v_total from public.lms_required_lessons(c.id);
  select count(*) into v_done
    from public.lms_lesson_progress lp
   where lp.enrollment_id = v_enr.id
     and lp.completed_at is not null
     and lp.lesson_id in (select public.lms_required_lessons(c.id));

  if p_done and v_total > 0 and v_done >= v_total and v_enr.status in ('approved', 'active') then
    update public.lms_enrollments set status = 'completed', completed_at = now(), last_lesson_id = l.id where id = v_enr.id;
    v_completed := true;
  elsif v_enr.status = 'approved' then
    update public.lms_enrollments set status = 'active', last_lesson_id = l.id where id = v_enr.id;
  end if;

  return jsonb_build_object('required_total', v_total, 'required_done', v_done, 'course_completed', v_completed or v_enr.status = 'completed');
end;
$$;

-- Saves the member's own note and bookmark on a lesson they can open.
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
  if not found or not public.lms_feature_available(c.organization_id) then
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

-- The storage path of a lesson's private file, if the signed-in member may open the lesson. The web
-- server calls this with the member's own session and then signs a short-lived link for the path.
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
  if not found or not public.lms_feature_available(c.organization_id) then
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

-- Only signed-in users may call the student functions; they check who is asking themselves.
revoke all on function public.lms_catalog(uuid) from public, anon;
revoke all on function public.lms_my_courses(uuid) from public, anon;
revoke all on function public.lms_course_outline(uuid) from public, anon;
revoke all on function public.lms_request_enrollment(uuid) from public, anon;
revoke all on function public.lms_get_lesson(uuid) from public, anon;
revoke all on function public.lms_complete_lesson(uuid, boolean) from public, anon;
revoke all on function public.lms_save_note(uuid, text, boolean) from public, anon;
revoke all on function public.lms_lesson_file_access(uuid) from public, anon;
grant execute on function public.lms_catalog(uuid) to authenticated;
grant execute on function public.lms_my_courses(uuid) to authenticated;
grant execute on function public.lms_course_outline(uuid) to authenticated;
grant execute on function public.lms_request_enrollment(uuid) to authenticated;
grant execute on function public.lms_get_lesson(uuid) to authenticated;
grant execute on function public.lms_complete_lesson(uuid, boolean) to authenticated;
grant execute on function public.lms_save_note(uuid, text, boolean) to authenticated;
grant execute on function public.lms_lesson_file_access(uuid) to authenticated;

-- Reversal (run manually if needed; this removes all student progress and notes):
--   drop function if exists public.lms_lesson_file_access(uuid), public.lms_save_note(uuid, text, boolean),
--     public.lms_complete_lesson(uuid, boolean), public.lms_get_lesson(uuid), public.lms_request_enrollment(uuid),
--     public.lms_course_outline(uuid), public.lms_my_courses(uuid), public.lms_catalog(uuid),
--     public.lms_required_lessons(uuid), public.lms_my_member_in_org(uuid), public.lms_feature_available(uuid);
--   drop table if exists public.lms_lesson_notes, public.lms_lesson_progress;
--   alter table public.lms_enrollments drop column if exists last_lesson_id;
--   alter table public.lms_lessons drop column if exists file_path, drop column if exists file_name;
--   delete from storage.buckets where id = 'lms-lesson-files';
