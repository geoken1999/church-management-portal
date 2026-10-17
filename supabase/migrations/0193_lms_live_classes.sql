-- Bible School, phase 3 (part 1): live classes. A class belongs to a course and is held in a K-Connect
-- room (video or audio) created when the class is scheduled; students of the course join from the
-- member app, and joining records their attendance. Teachers can adjust attendance by hand, add a
-- recording link afterwards, reschedule and cancel. Students hear about it by push notification
-- (see src/lib/lms/live-actions.ts and /api/cron/lms-class-reminders).

create table if not exists public.lms_live_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.lms_courses (id) on delete cascade,
  -- The K-Connect room. Null if that meeting was deleted from K-Connect.
  meeting_id uuid references public.kmeet_meetings (id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 120),
  description text check (description is null or length(description) <= 2000),
  mode text not null default 'video' check (mode in ('video', 'audio')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  recording_url text check (recording_url is null or recording_url ~ '^https://'),
  notes text check (notes is null or length(notes) <= 2000),
  -- When students were told about the class (or its last change), and when the "starts soon" reminder went out.
  announced_at timestamptz,
  reminder_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists lms_live_sessions_org_idx on public.lms_live_sessions (organization_id, starts_at);
create index if not exists lms_live_sessions_course_idx on public.lms_live_sessions (course_id, starts_at);
create index if not exists lms_live_sessions_due_idx on public.lms_live_sessions (starts_at) where status = 'scheduled' and reminder_sent_at is null;

drop trigger if exists set_lms_live_sessions_updated_at on public.lms_live_sessions;
create trigger set_lms_live_sessions_updated_at
  before update on public.lms_live_sessions
  for each row execute function public.set_updated_at();

-- Attendance: one row per class and student. 'app' means the student opened the class from the app;
-- 'manual' means a teacher set it.
create table if not exists public.lms_session_attendance (
  session_id uuid not null references public.lms_live_sessions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'present' check (status in ('present', 'absent', 'excused')),
  source text not null default 'app' check (source in ('app', 'manual')),
  first_joined_at timestamptz,
  marked_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
create index if not exists lms_session_attendance_member_idx on public.lms_session_attendance (member_id);

alter table public.lms_live_sessions enable row level security;
alter table public.lms_session_attendance enable row level security;

-- Staff of the church read; owners and admins write directly (teachers go through the server).
drop policy if exists "Staff can view lms_live_sessions" on public.lms_live_sessions;
create policy "Staff can view lms_live_sessions"
  on public.lms_live_sessions for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "Admins can write lms_live_sessions" on public.lms_live_sessions;
create policy "Admins can write lms_live_sessions"
  on public.lms_live_sessions for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Staff can view lms_session_attendance" on public.lms_session_attendance;
create policy "Staff can view lms_session_attendance"
  on public.lms_session_attendance for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "Students can view their attendance" on public.lms_session_attendance;
create policy "Students can view their attendance"
  on public.lms_session_attendance for select to authenticated
  using (member_id in (select public.lms_my_member_ids()));
drop policy if exists "Admins can write lms_session_attendance" on public.lms_session_attendance;
create policy "Admins can write lms_session_attendance"
  on public.lms_session_attendance for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------------------------
-- Student functions (the member is worked out from auth.uid(); none takes a member id)
-- ---------------------------------------------------------------------------------------------

-- The live classes of the courses the member is enrolled in: from the last 30 days on. can_join is
-- true from 15 minutes before the start until the class ends.
create or replace function public.lms_my_sessions(p_org uuid)
returns table (
  session_id uuid,
  course_id uuid,
  course_title text,
  title text,
  description text,
  mode text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  can_join boolean,
  my_attendance text,
  recording_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id,
    s.course_id,
    c.title,
    s.title,
    s.description,
    s.mode,
    s.starts_at,
    s.ends_at,
    s.status,
    (s.status = 'scheduled' and s.meeting_id is not null and now() >= s.starts_at - interval '15 minutes' and now() <= s.ends_at),
    (select a.status from public.lms_session_attendance a where a.session_id = s.id and a.member_id = public.lms_my_member_in_org(p_org)),
    s.recording_url
  from public.lms_live_sessions s
  join public.lms_courses c on c.id = s.course_id
  where s.organization_id = p_org
    and public.lms_feature_available(p_org)
    and public.lms_my_member_in_org(p_org) is not null
    and s.ends_at >= now() - interval '30 days'
    and exists (
      select 1 from public.lms_enrollments e
       where e.course_id = s.course_id
         and e.member_id = public.lms_my_member_in_org(p_org)
         and e.status in ('approved', 'active', 'completed'))
  order by s.starts_at;
$$;

-- Joins a class: checks the member is enrolled and the class is open, records them as present, and
-- returns the K-Connect room to connect to.
create or replace function public.lms_join_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.lms_live_sessions%rowtype;
  v_member uuid;
begin
  select * into s from public.lms_live_sessions where id = p_session;
  if not found or not public.lms_feature_available(s.organization_id) then
    raise exception 'That class could not be found.';
  end if;
  v_member := public.lms_my_member_in_org(s.organization_id);
  if v_member is null or not exists (
    select 1 from public.lms_enrollments e
     where e.course_id = s.course_id and e.member_id = v_member and e.status in ('approved', 'active', 'completed')
  ) then
    raise exception 'Join the course to attend its classes.';
  end if;
  if s.status = 'cancelled' then
    raise exception 'This class was cancelled.';
  end if;
  if s.meeting_id is null then
    raise exception 'This class has no room yet. Ask your teacher.';
  end if;
  if now() < s.starts_at - interval '15 minutes' then
    raise exception 'This class opens 15 minutes before it starts.';
  end if;
  if now() > s.ends_at then
    raise exception 'This class has ended.';
  end if;

  insert into public.lms_session_attendance (session_id, member_id, organization_id, status, source, first_joined_at)
  values (s.id, v_member, s.organization_id, 'present', 'app', now())
  on conflict (session_id, member_id) do update
     set status = 'present',
         first_joined_at = coalesce(public.lms_session_attendance.first_joined_at, now()),
         updated_at = now();

  return jsonb_build_object('meeting_id', s.meeting_id, 'title', s.title, 'mode', s.mode);
end;
$$;

revoke all on function public.lms_my_sessions(uuid) from public, anon;
revoke all on function public.lms_join_session(uuid) from public, anon;
grant execute on function public.lms_my_sessions(uuid) to authenticated;
grant execute on function public.lms_join_session(uuid) to authenticated;

-- Reversal (run manually if needed; this removes all live class records and attendance):
--   drop function if exists public.lms_join_session(uuid), public.lms_my_sessions(uuid);
--   drop table if exists public.lms_session_attendance, public.lms_live_sessions;
