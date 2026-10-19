-- Quizzes, grading and certificates for the Bible School.
--
-- A quiz is a lesson of type 'quiz' with questions: single choice, multiple choice, true or false (graded by the
-- database) and short answer (graded by a teacher). The right answers never leave the server: students get the
-- questions without them and the result of each attempt. Passing the quiz is what completes its lesson, so a
-- required quiz counts towards finishing the course. A finished course earns a certificate with a code anyone
-- can check, and a finished program earns one too.

alter table public.lms_settings add column if not exists issue_certificates boolean not null default true;
alter table public.lms_settings add column if not exists certificate_signer_name text check (certificate_signer_name is null or length(certificate_signer_name) <= 120);
alter table public.lms_settings add column if not exists certificate_signer_title text check (certificate_signer_title is null or length(certificate_signer_title) <= 120);

create table if not exists public.lms_quizzes (
  lesson_id uuid primary key references public.lms_lessons (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  pass_percent integer not null default 60 check (pass_percent between 1 and 100),
  -- null = as many attempts as they like
  max_attempts integer check (max_attempts is null or max_attempts between 1 and 20),
  -- show which answers were right (and the explanation) once an attempt is graded
  show_answers boolean not null default true,
  instructions text check (instructions is null or length(instructions) <= 2000),
  updated_at timestamptz not null default now()
);
create index if not exists lms_quizzes_course_idx on public.lms_quizzes (course_id);

create table if not exists public.lms_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('single', 'multiple', 'true_false', 'short')),
  prompt text not null check (length(trim(prompt)) between 1 and 1000),
  points integer not null default 1 check (points between 1 and 100),
  -- [{"id": "a", "text": "...", "correct": true}]; empty for a short answer; true_false uses ids "true" and "false"
  options jsonb not null default '[]'::jsonb,
  explanation text check (explanation is null or length(explanation) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists lms_quiz_questions_lesson_idx on public.lms_quiz_questions (lesson_id, position);

create table if not exists public.lms_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete restrict,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  enrollment_id uuid not null references public.lms_enrollments (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  attempt_number integer not null,
  -- {"<question id>": ["a"]} for choices, {"<question id>": "text"} for a short answer
  answers jsonb not null default '{}'::jsonb,
  -- {"<question id>": {"points": 1, "correct": true, "feedback": "..."}}
  per_question jsonb not null default '{}'::jsonb,
  auto_score numeric not null default 0,
  manual_score numeric not null default 0,
  max_score numeric not null default 0,
  percent numeric not null default 0,
  -- submitted: a short answer is waiting for a teacher; graded: the score is final
  status text not null default 'graded' check (status in ('submitted', 'graded')),
  passed boolean not null default false,
  feedback text check (feedback is null or length(feedback) <= 2000),
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id, attempt_number)
);
create index if not exists lms_quiz_attempts_member_idx on public.lms_quiz_attempts (member_id, lesson_id);
create index if not exists lms_quiz_attempts_waiting_idx on public.lms_quiz_attempts (organization_id, status) where status = 'submitted';

create table if not exists public.lms_certificates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  course_id uuid references public.lms_courses (id) on delete set null,
  program_id uuid references public.lms_programs (id) on delete set null,
  -- what a person types to check it: 12 letters and numbers
  code text not null unique,
  student_name text not null,
  title text not null,
  organization_name text not null,
  percent numeric,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or length(revoked_reason) <= 300),
  check (course_id is not null or program_id is not null)
);
create unique index if not exists lms_certificates_course_once on public.lms_certificates (member_id, course_id) where course_id is not null;
create unique index if not exists lms_certificates_program_once on public.lms_certificates (member_id, program_id) where program_id is not null;
create index if not exists lms_certificates_org_idx on public.lms_certificates (organization_id, issued_at desc);

alter table public.lms_quizzes enable row level security;
alter table public.lms_quiz_questions enable row level security;
alter table public.lms_quiz_attempts enable row level security;
alter table public.lms_certificates enable row level security;

drop policy if exists "Staff can view lms_quizzes" on public.lms_quizzes;
create policy "Staff can view lms_quizzes" on public.lms_quizzes for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Staff can view lms_quiz_questions" on public.lms_quiz_questions;
create policy "Staff can view lms_quiz_questions" on public.lms_quiz_questions for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Staff can view lms_quiz_attempts" on public.lms_quiz_attempts;
create policy "Staff can view lms_quiz_attempts" on public.lms_quiz_attempts for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Students can view their own quiz attempts" on public.lms_quiz_attempts;
create policy "Students can view their own quiz attempts" on public.lms_quiz_attempts for select to authenticated using (member_id in (select public.lms_my_member_ids()));
drop policy if exists "Staff can view lms_certificates" on public.lms_certificates;
create policy "Staff can view lms_certificates" on public.lms_certificates for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "Students can view their own certificates" on public.lms_certificates;
create policy "Students can view their own certificates" on public.lms_certificates for select to authenticated using (member_id in (select public.lms_my_member_ids()));
-- No write policy anywhere, and students get no policy on the questions: the right answers stay in the database.

-- ---------------------------------------------------------------------------------------------
-- Finishing a lesson for a given member (after a quiz is passed or a teacher grades it)
-- ---------------------------------------------------------------------------------------------
create or replace function public.lms_finish_lesson_for(p_member uuid, p_lesson uuid)
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
  v_member := p_member;

  select * into v_enr from public.lms_enrollments
   where course_id = c.id and member_id = v_member and status in ('approved', 'active', 'completed')
   order by requested_at desc limit 1
   for update;
  if not found then
    return jsonb_build_object('required_total', 0, 'required_done', 0, 'course_completed', false);
  end if;

  insert into public.lms_lesson_progress (organization_id, enrollment_id, lesson_id, member_id, completed_at, last_opened_at)
  values (c.organization_id, v_enr.id, l.id, v_member, now(), now())
  on conflict (enrollment_id, lesson_id) do update
     set completed_at = coalesce(public.lms_lesson_progress.completed_at, now()),
         last_opened_at = now();

  select count(*) into v_total from public.lms_required_lessons(c.id);
  select count(*) into v_done
    from public.lms_lesson_progress lp
   where lp.enrollment_id = v_enr.id
     and lp.completed_at is not null
     and lp.lesson_id in (select public.lms_required_lessons(c.id));

  if v_total > 0 and v_done >= v_total and v_enr.status in ('approved', 'active') then
    update public.lms_enrollments set status = 'completed', completed_at = now(), last_lesson_id = l.id where id = v_enr.id;
    v_completed := true;
  elsif v_enr.status = 'approved' then
    update public.lms_enrollments set status = 'active', last_lesson_id = l.id where id = v_enr.id;
  end if;

  return jsonb_build_object('required_total', v_total, 'required_done', v_done, 'course_completed', v_completed or v_enr.status = 'completed');
end;
$$;
revoke all on function public.lms_finish_lesson_for(uuid, uuid) from public, anon, authenticated;

-- A quiz lesson is completed by passing the quiz, never by tapping 'mark as complete'.
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
-- Taking a quiz (the signed-in student)
-- ---------------------------------------------------------------------------------------------

-- Who may take this quiz: an enrolled student of a visible, published course, with the earlier lesson done.
-- Raises a plain sentence otherwise. Locks nothing; the submit function locks the enrollment itself.
create or replace function public.lms_quiz_access(p_lesson uuid)
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
  select * into l from public.lms_lessons where id = p_lesson and status = 'published' and content_type = 'quiz';
  if not found then
    raise exception 'That quiz could not be found.';
  end if;
  select * into c from public.lms_courses where id = l.course_id and status = 'published';
  if not found or not public.lms_feature_available(c.organization_id) or not public.lms_course_visible(c.id)
     or not exists (select 1 from public.lms_modules m where m.id = l.module_id and m.status = 'published') then
    raise exception 'That quiz could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(c.organization_id);
  if v_member is null then
    raise exception 'That quiz could not be found.';
  end if;
  select e.id into v_enr from public.lms_enrollments e
   where e.course_id = c.id and e.member_id = v_member and e.status in ('approved', 'active', 'completed')
   order by e.requested_at desc limit 1;
  if v_enr is null then
    raise exception 'Join this course to take the quiz.';
  end if;
  if l.prerequisite_lesson_id is not null and not exists (
    select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
  ) then
    raise exception 'Finish the earlier lesson first.';
  end if;
  return query select c.organization_id, c.id, v_member, v_enr, l.title;
end;
$$;
revoke all on function public.lms_quiz_access(uuid) from public, anon, authenticated;

-- One attempt as the student sees it. The right answers and explanations are included only when the quiz
-- shows answers and the attempt is graded.
create or replace function public.lms_attempt_json(p_attempt uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  a public.lms_quiz_attempts%rowtype;
  q public.lms_quizzes%rowtype;
  v_detail jsonb := null;
begin
  select * into a from public.lms_quiz_attempts where id = p_attempt;
  if not found then
    return null;
  end if;
  select * into q from public.lms_quizzes where lesson_id = a.lesson_id;
  if q.show_answers and a.status = 'graded' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', qq.id,
      'prompt', qq.prompt,
      'points', coalesce((a.per_question -> qq.id::text ->> 'points')::numeric, 0),
      'max_points', qq.points,
      'correct', (a.per_question -> qq.id::text ->> 'correct')::boolean,
      'feedback', a.per_question -> qq.id::text ->> 'feedback',
      'correct_option_ids', (select coalesce(jsonb_agg(o ->> 'id'), '[]'::jsonb) from jsonb_array_elements(qq.options) o where (o ->> 'correct')::boolean),
      'explanation', qq.explanation
    ) order by qq.position, qq.created_at), '[]'::jsonb) into v_detail
    from public.lms_quiz_questions qq where qq.lesson_id = a.lesson_id;
  end if;
  return jsonb_build_object(
    'id', a.id,
    'attempt_number', a.attempt_number,
    'status', a.status,
    'percent', a.percent,
    'passed', a.passed,
    'score', a.auto_score + a.manual_score,
    'max_score', a.max_score,
    'feedback', a.feedback,
    'submitted_at', a.submitted_at,
    'detail', v_detail
  );
end;
$$;
revoke all on function public.lms_attempt_json(uuid) from public, anon, authenticated;

create or replace function public.lms_get_quiz(p_lesson uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  acc record;
  q public.lms_quizzes%rowtype;
  v_used integer;
  v_passed boolean;
  v_pending boolean;
  v_best numeric;
  v_last uuid;
  v_questions jsonb;
begin
  select * into acc from public.lms_quiz_access(p_lesson);
  select * into q from public.lms_quizzes where lesson_id = p_lesson;
  if not found then
    raise exception 'This quiz is not ready yet.';
  end if;
  select count(*), coalesce(bool_or(passed), false), coalesce(bool_or(status = 'submitted'), false), max(percent) filter (where status = 'graded')
    into v_used, v_passed, v_pending, v_best
    from public.lms_quiz_attempts where lesson_id = p_lesson and member_id = acc.member_id;
  select id into v_last from public.lms_quiz_attempts where lesson_id = p_lesson and member_id = acc.member_id order by attempt_number desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', qq.id,
    'kind', qq.kind,
    'prompt', qq.prompt,
    'points', qq.points,
    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text')), '[]'::jsonb) from jsonb_array_elements(qq.options) o)
  ) order by qq.position, qq.created_at), '[]'::jsonb) into v_questions
  from public.lms_quiz_questions qq where qq.lesson_id = p_lesson;

  return jsonb_build_object(
    'lesson_id', p_lesson,
    'title', acc.lesson_title,
    'instructions', q.instructions,
    'pass_percent', q.pass_percent,
    'max_attempts', q.max_attempts,
    'attempts_used', v_used,
    'passed', v_passed,
    'waiting_for_teacher', v_pending,
    'best_percent', v_best,
    'can_attempt', not v_passed and not v_pending and (q.max_attempts is null or v_used < q.max_attempts) and jsonb_array_length(v_questions) > 0,
    'questions', v_questions,
    'last_attempt', case when v_last is null then null else public.lms_attempt_json(v_last) end
  );
end;
$$;

create or replace function public.lms_submit_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acc record;
  q public.lms_quizzes%rowtype;
  r record;
  v_enr public.lms_enrollments%rowtype;
  v_used integer;
  v_ans jsonb;
  v_selected text[];
  v_right text[];
  v_text text;
  v_ok boolean;
  v_points numeric;
  v_auto numeric := 0;
  v_max numeric := 0;
  v_has_manual boolean := false;
  v_per jsonb := '{}'::jsonb;
  v_percent numeric;
  v_status text;
  v_passed boolean;
  v_id uuid;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answer the questions first.';
  end if;
  select * into acc from public.lms_quiz_access(p_lesson);
  select * into q from public.lms_quizzes where lesson_id = p_lesson;
  if not found then
    raise exception 'This quiz is not ready yet.';
  end if;
  -- One attempt at a time per student: the enrollment row is the lock.
  select * into v_enr from public.lms_enrollments where id = acc.enrollment_id for update;
  if exists (select 1 from public.lms_quiz_attempts where lesson_id = p_lesson and member_id = acc.member_id and passed) then
    raise exception 'You have already passed this quiz.';
  end if;
  if exists (select 1 from public.lms_quiz_attempts where lesson_id = p_lesson and member_id = acc.member_id and status = 'submitted') then
    raise exception 'Your last attempt is waiting for your teacher to grade it.';
  end if;
  select count(*) into v_used from public.lms_quiz_attempts where lesson_id = p_lesson and member_id = acc.member_id;
  if q.max_attempts is not null and v_used >= q.max_attempts then
    raise exception 'You have used all % attempts for this quiz.', q.max_attempts;
  end if;

  for r in select * from public.lms_quiz_questions where lesson_id = p_lesson order by position, created_at loop
    v_max := v_max + r.points;
    v_ans := p_answers -> r.id::text;
    if r.kind = 'short' then
      v_has_manual := true;
      v_text := left(coalesce(case when jsonb_typeof(v_ans) = 'string' then v_ans #>> '{}' else '' end, ''), 2000);
      v_per := v_per || jsonb_build_object(r.id::text, jsonb_build_object('points', null, 'correct', null));
      p_answers := jsonb_set(p_answers, array[r.id::text], to_jsonb(v_text));
    else
      v_selected := case when jsonb_typeof(v_ans) = 'array' then array(select jsonb_array_elements_text(v_ans) order by 1) else array[]::text[] end;
      v_right := array(select o ->> 'id' from jsonb_array_elements(r.options) o where (o ->> 'correct')::boolean order by 1);
      v_ok := cardinality(v_selected) > 0 and v_selected = v_right
              and (r.kind = 'multiple' or cardinality(v_selected) = 1);
      v_points := case when v_ok then r.points else 0 end;
      v_auto := v_auto + v_points;
      v_per := v_per || jsonb_build_object(r.id::text, jsonb_build_object('points', v_points, 'correct', v_ok));
    end if;
  end loop;
  if v_max = 0 then
    raise exception 'This quiz has no questions yet.';
  end if;

  v_percent := round(v_auto / v_max * 100, 1);
  v_status := case when v_has_manual then 'submitted' else 'graded' end;
  v_passed := v_status = 'graded' and v_percent >= q.pass_percent;
  insert into public.lms_quiz_attempts (organization_id, lesson_id, course_id, enrollment_id, member_id, attempt_number, answers, per_question, auto_score, max_score, percent, status, passed, graded_at)
  values (acc.organization_id, p_lesson, acc.course_id, acc.enrollment_id, acc.member_id, v_used + 1, p_answers, v_per, v_auto, v_max, v_percent, v_status, v_passed, case when v_status = 'graded' then now() end)
  returning id into v_id;

  if v_passed then
    perform public.lms_finish_lesson_for(acc.member_id, p_lesson);
  end if;
  return public.lms_attempt_json(v_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grading a short-answer quiz (the church team, through the server)
-- ---------------------------------------------------------------------------------------------

-- p_points is {"<question id>": points} for the short-answer questions; anything else in it is ignored and
-- each mark is held between 0 and the question's points. Can be run again to change a grade; a lesson that
-- was completed stays completed.
create or replace function public.lms_grade_attempt(p_org uuid, p_attempt uuid, p_points jsonb, p_feedback text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.lms_quiz_attempts%rowtype;
  q public.lms_quizzes%rowtype;
  r record;
  v_manual numeric := 0;
  v_per jsonb;
  v_given numeric;
  v_percent numeric;
  v_passed boolean;
begin
  select * into a from public.lms_quiz_attempts where id = p_attempt and organization_id = p_org for update;
  if not found then
    raise exception 'That attempt could not be found.';
  end if;
  select * into q from public.lms_quizzes where lesson_id = a.lesson_id;
  v_per := a.per_question;
  for r in select * from public.lms_quiz_questions where lesson_id = a.lesson_id and kind = 'short' loop
    v_given := least(r.points, greatest(0, coalesce((p_points ->> r.id::text)::numeric, 0)));
    v_manual := v_manual + v_given;
    v_per := v_per || jsonb_build_object(r.id::text, jsonb_build_object('points', v_given, 'correct', v_given >= r.points));
  end loop;
  v_percent := case when a.max_score = 0 then 0 else round((a.auto_score + v_manual) / a.max_score * 100, 1) end;
  v_passed := v_percent >= q.pass_percent;
  update public.lms_quiz_attempts
     set per_question = v_per, manual_score = v_manual, percent = v_percent, status = 'graded', passed = v_passed,
         feedback = nullif(left(coalesce(p_feedback, ''), 2000), ''), graded_by = p_actor, graded_at = now()
   where id = p_attempt;
  if v_passed then
    perform public.lms_finish_lesson_for(a.member_id, a.lesson_id);
  end if;
  return jsonb_build_object('percent', v_percent, 'passed', v_passed);
end;
$$;
revoke all on function public.lms_grade_attempt(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------------------------

create or replace function public.lms_issue_certificate(p_member uuid, p_course uuid, p_program uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.members%rowtype;
  v_org text;
  v_title text;
  v_percent numeric;
  v_enabled boolean;
  v_id uuid;
  v_code text;
  v_try integer := 0;
begin
  select * into m from public.members where id = p_member;
  if not found then
    return null;
  end if;
  select coalesce(s.issue_certificates, true) into v_enabled from (select 1) x left join public.lms_settings s on s.organization_id = m.organization_id;
  if not coalesce(v_enabled, true) then
    return null;
  end if;
  select coalesce(nullif(trim(s.school_name), ''), o.name) into v_org
    from public.organizations o left join public.lms_settings s on s.organization_id = o.id where o.id = m.organization_id;
  if p_course is not null then
    select title into v_title from public.lms_courses where id = p_course;
    select round(avg(best), 1) into v_percent from (
      select max(percent) as best from public.lms_quiz_attempts
       where member_id = p_member and course_id = p_course and status = 'graded' group by lesson_id) t;
  else
    select title into v_title from public.lms_programs where id = p_program;
    select round(avg(percent), 1) into v_percent from public.lms_certificates
     where member_id = p_member and percent is not null and revoked_at is null
       and course_id in (select pc.course_id from public.lms_program_courses pc where pc.program_id = p_program);
  end if;
  if v_title is null then
    return null;
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_try := v_try + 1;
    begin
      insert into public.lms_certificates (organization_id, member_id, course_id, program_id, code, student_name, title, organization_name, percent)
      values (m.organization_id, p_member, p_course, p_program, v_code, trim(m.first_name || ' ' || coalesce(m.last_name, '')), v_title, coalesce(v_org, 'Bible School'), v_percent)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Either this person already has it (done), or the code clashed (try another).
      if exists (select 1 from public.lms_certificates where member_id = p_member and ((p_course is not null and course_id = p_course) or (p_program is not null and program_id = p_program))) then
        return null;
      end if;
      if v_try > 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;
revoke all on function public.lms_issue_certificate(uuid, uuid, uuid) from public, anon, authenticated;

-- A program is finished when every required published course in it is. Called when a course is completed.
create or replace function public.lms_complete_programs_for(p_member uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  for p in
    select pe.id as enrollment_id, pe.program_id
      from public.lms_program_courses pc
      join public.lms_program_enrollments pe on pe.program_id = pc.program_id and pe.member_id = p_member and pe.status in ('approved', 'active')
     where pc.course_id = p_course
  loop
    if (select count(*) from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
         where pc.program_id = p.program_id and pc.is_required and c.status = 'published') > 0
       and not exists (
         select 1 from public.lms_program_courses pc join public.lms_courses c on c.id = pc.course_id
          where pc.program_id = p.program_id and pc.is_required and c.status = 'published'
            and not exists (select 1 from public.lms_enrollments e where e.course_id = pc.course_id and e.member_id = p_member and e.status = 'completed'))
    then
      update public.lms_program_enrollments set status = 'completed', updated_at = now() where id = p.enrollment_id;
      perform public.lms_issue_certificate(p_member, null, p.program_id);
    end if;
  end loop;
end;
$$;
revoke all on function public.lms_complete_programs_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.lms_on_enrollment_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.lms_issue_certificate(new.member_id, new.course_id, null);
    perform public.lms_complete_programs_for(new.member_id, new.course_id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_lms_enrollment_completed on public.lms_enrollments;
create trigger on_lms_enrollment_completed
  after update of status on public.lms_enrollments
  for each row execute function public.lms_on_enrollment_completed();

-- Certificates for courses that were finished before this existed.
insert into public.lms_certificates (organization_id, member_id, course_id, code, student_name, title, organization_name, issued_at)
select e.organization_id, e.member_id, e.course_id,
       upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
       trim(m.first_name || ' ' || coalesce(m.last_name, '')), c.title,
       coalesce(nullif(trim(s.school_name), ''), o.name), coalesce(e.completed_at, now())
from public.lms_enrollments e
join public.members m on m.id = e.member_id
join public.lms_courses c on c.id = e.course_id
join public.organizations o on o.id = e.organization_id
left join public.lms_settings s on s.organization_id = e.organization_id
where e.status = 'completed' and coalesce(s.issue_certificates, true)
on conflict do nothing;

create or replace function public.lms_my_certificates(p_org uuid)
returns table (id uuid, code text, title text, kind text, percent numeric, issued_at timestamptz, organization_name text)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.code, c.title, case when c.program_id is not null then 'program' else 'course' end, c.percent, c.issued_at, c.organization_name
    from public.lms_certificates c
   where c.organization_id = p_org
     and c.member_id = public.lms_my_member_in_org(p_org)
     and c.revoked_at is null
     and public.lms_feature_available(p_org)
   order by c.issued_at desc;
$$;

-- Anyone with a certificate's code can check it. Only the name, what it is for and when are shown.
create or replace function public.lms_verify_certificate(p_code text)
returns table (code text, student_name text, title text, kind text, organization_name text, percent numeric, issued_at timestamptz, revoked boolean)
language sql
security definer
stable
set search_path = public
as $$
  select c.code, c.student_name, c.title, case when c.program_id is not null then 'program' else 'course' end,
         c.organization_name, c.percent, c.issued_at, c.revoked_at is not null
    from public.lms_certificates c
   where c.code = upper(trim(p_code))
   limit 1;
$$;

revoke all on function public.lms_get_quiz(uuid) from public, anon;
revoke all on function public.lms_submit_quiz(uuid, jsonb) from public, anon;
revoke all on function public.lms_my_certificates(uuid) from public, anon;
grant execute on function public.lms_get_quiz(uuid), public.lms_submit_quiz(uuid, jsonb), public.lms_my_certificates(uuid) to authenticated;
revoke all on function public.lms_verify_certificate(text) from public;
grant execute on function public.lms_verify_certificate(text) to anon, authenticated;

-- Reversal (run manually if needed):
--   drop trigger if exists on_lms_enrollment_completed on public.lms_enrollments;
--   drop function if exists public.lms_on_enrollment_completed(), public.lms_complete_programs_for(uuid, uuid), public.lms_issue_certificate(uuid, uuid, uuid),
--     public.lms_my_certificates(uuid), public.lms_verify_certificate(text), public.lms_grade_attempt(uuid, uuid, jsonb, text, uuid),
--     public.lms_submit_quiz(uuid, jsonb), public.lms_get_quiz(uuid), public.lms_attempt_json(uuid), public.lms_quiz_access(uuid), public.lms_finish_lesson_for(uuid, uuid);
--   drop table if exists public.lms_certificates, public.lms_quiz_attempts, public.lms_quiz_questions, public.lms_quizzes;
--   alter table public.lms_settings drop column if exists issue_certificates, drop column if exists certificate_signer_name, drop column if exists certificate_signer_title;
--   (and re-run lms_complete_lesson from 0191)
