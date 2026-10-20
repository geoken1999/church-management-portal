-- Assignments for the Bible School.
--
-- An assignment is a lesson of type 'assignment' with instructions, a maximum mark, an optional due date and
-- what the student may hand in: typed text, one file, or both. Handing it in completes the lesson (so a required
-- assignment counts towards finishing the course without waiting for marking); a teacher then marks it and
-- writes feedback. A hand-in after the due date is accepted and flagged late. The student can replace their
-- hand-in until it is marked. Files live in a private bucket that only the server touches.

create table if not exists public.lms_assignments (
  lesson_id uuid primary key references public.lms_lessons (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  instructions text not null default '' check (length(instructions) <= 4000),
  max_points integer not null default 100 check (max_points between 1 and 1000),
  due_at timestamptz,
  allow_text boolean not null default true,
  allow_file boolean not null default true,
  updated_at timestamptz not null default now(),
  check (allow_text or allow_file)
);
create index if not exists lms_assignments_course_idx on public.lms_assignments (course_id);

create table if not exists public.lms_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  enrollment_id uuid not null references public.lms_enrollments (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  answer_text text check (answer_text is null or length(answer_text) <= 10000),
  file_path text,
  file_name text check (file_name is null or length(file_name) <= 200),
  file_size integer check (file_size is null or file_size >= 0),
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  -- submitted: waiting for a teacher; graded: the mark is final
  status text not null default 'submitted' check (status in ('submitted', 'graded')),
  score numeric check (score is null or score >= 0),
  feedback text check (feedback is null or length(feedback) <= 2000),
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  check (answer_text is not null or file_path is not null),
  unique (lesson_id, member_id)
);
create index if not exists lms_assignment_submissions_waiting_idx on public.lms_assignment_submissions (organization_id, status) where status = 'submitted';
create index if not exists lms_assignment_submissions_course_idx on public.lms_assignment_submissions (course_id);

alter table public.lms_assignments enable row level security;
alter table public.lms_assignment_submissions enable row level security;

drop policy if exists "Staff can view lms_assignments" on public.lms_assignments;
create policy "Staff can view lms_assignments" on public.lms_assignments for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Staff can view lms_assignment_submissions" on public.lms_assignment_submissions;
create policy "Staff can view lms_assignment_submissions" on public.lms_assignment_submissions for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Students can view their own submissions" on public.lms_assignment_submissions;
create policy "Students can view their own submissions" on public.lms_assignment_submissions for select to authenticated using (member_id in (select public.lms_my_member_ids()));
-- No write policy anywhere: students hand in through lms_submit_assignment, teachers mark through the server.

insert into storage.buckets (id, name, public, file_size_limit)
values ('lms-submissions', 'lms-submissions', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
-- No storage policies: the bucket is private and only the server (service role) reads and writes it.

-- A lesson of type 'assignment' is completed by handing something in, never by ticking it off.
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
  if p_done and l.content_type = 'quiz' and not exists (
    select 1 from public.lms_quiz_attempts qa where qa.lesson_id = l.id and qa.member_id = v_member and qa.passed
  ) then
    raise exception 'Pass the quiz to complete this lesson.';
  end if;
  if p_done and l.content_type = 'assignment' and not exists (
    select 1 from public.lms_assignment_submissions s where s.lesson_id = l.id and s.member_id = v_member
  ) then
    raise exception 'Hand in the assignment to complete this lesson.';
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
revoke all on function public.lms_complete_lesson(uuid, boolean) from public, anon;
grant execute on function public.lms_complete_lesson(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Handing in (the signed-in student)
-- ---------------------------------------------------------------------------------------------

-- Who may hand this assignment in: an enrolled student of a visible, published course, with the earlier lesson
-- done. Raises a plain sentence otherwise.
create or replace function public.lms_assignment_access(p_lesson uuid)
returns table (organization_id uuid, course_id uuid, member_id uuid, enrollment_id uuid, lesson_title text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  l public.lms_lessons%rowtype;
  c public.lms_courses%rowtype;
  v_member uuid;
  v_enr uuid;
begin
  select * into l from public.lms_lessons where id = p_lesson and status = 'published' and content_type = 'assignment';
  if not found then
    raise exception 'That assignment could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id)
     or not exists (select 1 from public.lms_modules m where m.id = l.module_id and m.status = 'published') then
    raise exception 'That assignment could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'That assignment could not be found.';
  end if;
  select e.id into v_enr from public.lms_enrollments e
   where e.course_id = c.id and e.member_id = v_member and e.status in ('approved', 'active', 'completed')
   order by e.requested_at desc limit 1;
  if v_enr is null then
    raise exception 'Join this course to hand in the assignment.';
  end if;
  if l.prerequisite_lesson_id is not null and not exists (
    select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
  ) then
    raise exception 'Finish the earlier lesson first.';
  end if;
  return query select c.organization_id, c.id, v_member, v_enr, l.title;
end;
$$;
revoke all on function public.lms_assignment_access(uuid) from public, anon, authenticated;

-- What the student sees: the brief and their own hand-in (never the storage path).
create or replace function public.lms_get_assignment(p_lesson uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  acc record;
  a public.lms_assignments%rowtype;
  s public.lms_assignment_submissions%rowtype;
begin
  select * into acc from public.lms_assignment_access(p_lesson);
  select * into a from public.lms_assignments where lesson_id = p_lesson;
  if not found then
    raise exception 'This assignment is not ready yet.';
  end if;
  select * into s from public.lms_assignment_submissions where lesson_id = p_lesson and member_id = acc.member_id;
  return jsonb_build_object(
    'lesson_id', p_lesson,
    'title', acc.lesson_title,
    'instructions', a.instructions,
    'max_points', a.max_points,
    'due_at', a.due_at,
    'allow_text', a.allow_text,
    'allow_file', a.allow_file,
    'can_submit', s.id is null or s.status = 'submitted',
    'submission', case when s.id is null then null else jsonb_build_object(
      'answer_text', s.answer_text,
      'file_name', s.file_name,
      'file_size', s.file_size,
      'submitted_at', s.submitted_at,
      'is_late', s.is_late,
      'status', s.status,
      'score', s.score,
      'feedback', s.feedback,
      'graded_at', s.graded_at
    ) end
  );
end;
$$;

-- Where the app may upload this student's file: only a person who may hand the assignment in gets an answer.
create or replace function public.lms_assignment_upload_slot(p_lesson uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  acc record;
  a public.lms_assignments%rowtype;
  s public.lms_assignment_submissions%rowtype;
begin
  select * into acc from public.lms_assignment_access(p_lesson);
  select * into a from public.lms_assignments where lesson_id = p_lesson;
  if not found or not a.allow_file then
    raise exception 'This assignment does not take a file.';
  end if;
  select * into s from public.lms_assignment_submissions where lesson_id = p_lesson and member_id = acc.member_id;
  if found and s.status = 'graded' then
    raise exception 'This assignment has already been marked.';
  end if;
  return jsonb_build_object('organization_id', acc.organization_id, 'member_id', acc.member_id);
end;
$$;

create or replace function public.lms_submit_assignment(p_lesson uuid, p_text text, p_file_path text, p_file_name text, p_file_size integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acc record;
  a public.lms_assignments%rowtype;
  s public.lms_assignment_submissions%rowtype;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
  v_file text := nullif(p_file_path, '');
  v_old_file text;
  v_late boolean;
begin
  select * into acc from public.lms_assignment_access(p_lesson);
  select * into a from public.lms_assignments where lesson_id = p_lesson;
  if not found then
    raise exception 'This assignment is not ready yet.';
  end if;
  if v_text is not null and not a.allow_text then
    raise exception 'This assignment takes a file, not typed text.';
  end if;
  if v_file is not null and not a.allow_file then
    raise exception 'This assignment takes typed text, not a file.';
  end if;
  if v_text is null and v_file is null then
    raise exception 'Add your answer or a file before handing in.';
  end if;
  if v_text is not null and length(v_text) > 10000 then
    raise exception 'Keep your answer under 10000 characters.';
  end if;
  -- The file must be one this student's upload slot made, and it must really be there.
  if v_file is not null and (
    v_file not like acc.organization_id::text || '/' || acc.member_id::text || '/' || p_lesson::text || '/%'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'lms-submissions' and o.name = v_file)
  ) then
    raise exception 'The file did not upload. Please try again.';
  end if;

  select * into s from public.lms_assignment_submissions where lesson_id = p_lesson and member_id = acc.member_id for update;
  if found and s.status = 'graded' then
    raise exception 'This assignment has already been marked.';
  end if;
  v_late := a.due_at is not null and now() > a.due_at;
  v_old_file := s.file_path;

  insert into public.lms_assignment_submissions (organization_id, lesson_id, course_id, enrollment_id, member_id, answer_text, file_path, file_name, file_size, submitted_at, is_late, status)
  values (acc.organization_id, p_lesson, acc.course_id, acc.enrollment_id, acc.member_id, v_text, v_file, case when v_file is null then null else left(p_file_name, 200) end, case when v_file is null then null else p_file_size end, now(), v_late, 'submitted')
  on conflict (lesson_id, member_id) do update
     set answer_text = excluded.answer_text, file_path = excluded.file_path, file_name = excluded.file_name, file_size = excluded.file_size,
         submitted_at = now(), is_late = excluded.is_late, status = 'submitted';

  perform public.lms_finish_lesson_for(acc.member_id, p_lesson);
  -- The path of a replaced file, so the server can delete it from storage.
  return jsonb_build_object('late', v_late, 'replaced_file', case when v_old_file is distinct from v_file then v_old_file end, 'organization_id', acc.organization_id, 'course_id', acc.course_id, 'member_id', acc.member_id);
end;
$$;

-- The student's own file, for the server to sign a link for.
create or replace function public.lms_my_submission_file(p_lesson uuid)
returns table (file_path text, file_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  acc record;
begin
  select * into acc from public.lms_assignment_access(p_lesson);
  return query select s.file_path, s.file_name from public.lms_assignment_submissions s
   where s.lesson_id = p_lesson and s.member_id = acc.member_id and s.file_path is not null;
end;
$$;

-- A teacher marks a hand-in (the server checks the teacher may mark this course first).
create or replace function public.lms_grade_assignment(p_org uuid, p_submission uuid, p_score numeric, p_feedback text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.lms_assignment_submissions%rowtype;
  a public.lms_assignments%rowtype;
begin
  select * into s from public.lms_assignment_submissions where id = p_submission and organization_id = p_org for update;
  if not found then
    raise exception 'That hand-in could not be found.';
  end if;
  select * into a from public.lms_assignments where lesson_id = s.lesson_id;
  if p_score is null or p_score < 0 or p_score > a.max_points then
    raise exception 'The mark must be between 0 and %.', a.max_points;
  end if;
  update public.lms_assignment_submissions
     set status = 'graded', score = p_score, feedback = nullif(left(coalesce(p_feedback, ''), 2000), ''), graded_by = p_actor, graded_at = now()
   where id = p_submission;
  return jsonb_build_object('member_id', s.member_id, 'lesson_id', s.lesson_id, 'score', p_score, 'max_points', a.max_points);
end;
$$;
revoke all on function public.lms_grade_assignment(uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

revoke all on function public.lms_get_assignment(uuid) from public, anon;
revoke all on function public.lms_assignment_upload_slot(uuid) from public, anon;
revoke all on function public.lms_submit_assignment(uuid, text, text, text, integer) from public, anon;
revoke all on function public.lms_my_submission_file(uuid) from public, anon;
grant execute on function public.lms_get_assignment(uuid), public.lms_assignment_upload_slot(uuid), public.lms_submit_assignment(uuid, text, text, text, integer), public.lms_my_submission_file(uuid) to authenticated;

-- Reversal (run manually if needed):
--   drop table if exists public.lms_assignment_submissions, public.lms_assignments;
--   drop function if exists public.lms_assignment_access(uuid), public.lms_get_assignment(uuid), public.lms_assignment_upload_slot(uuid),
--     public.lms_submit_assignment(uuid, text, text, text, integer), public.lms_my_submission_file(uuid), public.lms_grade_assignment(uuid, uuid, numeric, text, uuid);
--   delete from storage.buckets where id = 'lms-submissions';
--   (and restore lms_complete_lesson from 0202)
