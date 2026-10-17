-- Bible School: videos and audio uploaded to the app itself, played inside the member app, with
-- watch progress. Large files go straight from the browser to storage (see the upload actions), so
-- the bucket now takes up to 500 MB per file, and only the file types a lesson can use.
--
-- Note: Supabase also has a project-wide upload limit (Dashboard -> Storage -> Settings). It must be at
-- least as large as the biggest video you want to upload.

update storage.buckets
   set file_size_limit = 524288000,
       allowed_mime_types = array[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'audio/mpeg',
         'audio/mp4',
         'audio/x-m4a',
         'video/mp4'
       ]
 where id = 'lms-lesson-files';

-- Watch progress, kept with the lesson progress row. watched_seconds counts time actually watched
-- (skipping ahead adds nothing); position_seconds is where to resume.
alter table public.lms_lesson_progress
  add column if not exists position_seconds integer not null default 0 check (position_seconds >= 0),
  add column if not exists watched_seconds integer not null default 0 check (watched_seconds >= 0),
  add column if not exists duration_seconds integer check (duration_seconds is null or duration_seconds >= 0);

-- Opens a lesson (replaces the version in 0191): the same, plus where the member got to in a video or audio lesson.
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

-- Saves where the member is in a video or audio lesson, and counts the time they really watched.
-- The app reports every few seconds. Time counted since the last report is the move forward in the
-- position, but never more than the real time that passed (at up to double speed): seeking ahead or
-- reporting faster than the clock adds nothing. The lesson completes by itself once 90% of its length
-- has been watched, through the same function a manual "mark as complete" uses.
create or replace function public.lms_save_playback(p_lesson uuid, p_position integer, p_duration integer)
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
  v_old public.lms_lesson_progress%rowtype;
  v_credit integer := 0;
  v_elapsed numeric;
  v_watched integer;
  v_completed boolean;
  v_course_completed boolean := false;
  v_result jsonb;
begin
  if p_position is null or p_duration is null or p_position < 0 or p_duration <= 0 or p_position > p_duration + 5 then
    raise exception 'That playback position is not valid.';
  end if;
  select * into l from public.lms_lessons where id = p_lesson and status = 'published' and content_type in ('video', 'audio');
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
  if l.prerequisite_lesson_id is not null and not exists (
    select 1 from public.lms_lesson_progress lp where lp.lesson_id = l.prerequisite_lesson_id and lp.member_id = v_member and lp.completed_at is not null
  ) then
    raise exception 'Finish the earlier lesson first.';
  end if;

  select * into v_old from public.lms_lesson_progress where enrollment_id = v_enr.id and lesson_id = l.id;
  if found then
    v_elapsed := extract(epoch from (now() - v_old.last_opened_at));
    if p_position > v_old.position_seconds then
      v_credit := least(p_position - v_old.position_seconds, floor(v_elapsed * 2)::integer + 2);
    end if;
  end if;

  insert into public.lms_lesson_progress (organization_id, enrollment_id, lesson_id, member_id, position_seconds, watched_seconds, duration_seconds, last_opened_at)
  values (c.organization_id, v_enr.id, l.id, v_member, p_position, 0, p_duration, now())
  on conflict (enrollment_id, lesson_id) do update
     set position_seconds = excluded.position_seconds,
         duration_seconds = excluded.duration_seconds,
         watched_seconds = least(public.lms_lesson_progress.watched_seconds + v_credit, excluded.duration_seconds),
         last_opened_at = now()
  returning watched_seconds, (completed_at is not null) into v_watched, v_completed;

  if not v_completed and v_watched >= floor(p_duration * 0.9) then
    v_result := public.lms_complete_lesson(p_lesson, true);
    v_completed := true;
    v_course_completed := coalesce((v_result ->> 'course_completed')::boolean, false);
  end if;

  return jsonb_build_object(
    'position_seconds', p_position,
    'watched_seconds', v_watched,
    'duration_seconds', p_duration,
    'completed', v_completed,
    'course_completed', v_course_completed
  );
end;
$$;

revoke all on function public.lms_save_playback(uuid, integer, integer) from public, anon;
grant execute on function public.lms_save_playback(uuid, integer, integer) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.lms_save_playback(uuid, integer, integer);
--   alter table public.lms_lesson_progress drop column if exists position_seconds, drop column if exists watched_seconds, drop column if exists duration_seconds;
--   update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'lms-lesson-files';
--   (and re-run the lms_get_lesson definition from 0191)
