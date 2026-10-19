-- A change log for the platform team: bugs, features, improvements and change requests, tracked like a
-- ticket board. Kept only in Super Admin (the service role); churches never see or read it.

create table if not exists public.change_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  type text not null default 'bug' check (type in ('bug', 'feature', 'improvement', 'change_request', 'security', 'task')),
  title text not null check (length(trim(title)) between 3 and 160),
  description text check (description is null or length(description) <= 8000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'in_review', 'done', 'closed', 'wont_do')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  area text not null default 'general' check (length(area) between 1 and 40),
  reported_by text check (reported_by is null or length(reported_by) <= 120),
  assignee text check (assignee is null or length(assignee) <= 120),
  release text check (release is null or length(release) <= 40),
  references_text text check (references_text is null or length(references_text) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists change_tickets_number_idx on public.change_tickets (number);
create index if not exists change_tickets_status_idx on public.change_tickets (status, created_at desc);

create table if not exists public.change_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.change_tickets (id) on delete cascade,
  author text not null check (length(author) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists change_ticket_comments_ticket_idx on public.change_ticket_comments (ticket_id, created_at);

alter table public.change_tickets enable row level security;
alter table public.change_ticket_comments enable row level security;
-- No policies: only the server (service role) reads and writes tickets.

drop trigger if exists set_change_tickets_updated_at on public.change_tickets;
create trigger set_change_tickets_updated_at
  before update on public.change_tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- A member asking to join a Bible School program tells the church team (the web bell)
-- ---------------------------------------------------------------------------------------------
create or replace function public.notify_program_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_program text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select trim(first_name || ' ' || coalesce(last_name, '')) into v_name from public.members where id = new.member_id;
  select title into v_program from public.lms_programs where id = new.program_id;
  insert into public.notifications (organization_id, type, title, body, link)
  values (
    new.organization_id,
    'bible_school_request',
    'Bible School request',
    coalesce(v_name, 'A member') || ' asked to join ' || coalesce(v_program, 'a program') || '.',
    '/dashboard/bible-school/enrollments'
  );
  return new;
end;
$$;
drop trigger if exists on_program_request_created on public.lms_program_enrollments;
create trigger on_program_request_created
  after insert on public.lms_program_enrollments
  for each row execute function public.notify_program_request();

-- ---------------------------------------------------------------------------------------------
-- The work done so far, as closed tickets (so the board starts with a history)
-- ---------------------------------------------------------------------------------------------
insert into public.change_tickets (type, area, title, description, status, priority, reported_by, assignee, resolved_at)
select v.type, v.area, v.title, v.description, 'done', 'medium', 'Platform team', 'Claude', now()
from (values
  ('feature', 'bible-school', 'Bible School module', 'Programs, courses, modules and lessons, enrollments, instructors and settings in the dashboard (migration 0190).'),
  ('feature', 'bible-school', 'Learning experience in the app', 'Catalogue, lesson player, notes, progress and completion rules for members (0191).'),
  ('feature', 'bible-school', 'Video and audio lessons played inside the app', 'Uploads to private storage, resume, speed, 10-second skips, watch-time tracking and completion at 90% (0192).'),
  ('feature', 'bible-school', 'Live classes', 'Scheduled in K-Connect rooms with notifications, reminders, attendance and recordings (0193).'),
  ('feature', 'bible-school', 'Bible School for people outside the church', 'Public application page, team approval, student phone sign-in limited to the Bible School (0194).'),
  ('feature', 'bible-school', 'Bible School is set up per church on request', 'Locked page with a request form, Super Admin switch, enforced in database and server (0196).'),
  ('feature', 'bible-school', 'Enrollment and payment at program level', 'Programs carry fee, seats and visibility; joining enrolls in every course; PayU checkout; course-fee payouts (0197, 0198).'),
  ('feature', 'bible-school', 'Web student portal', 'Sign in with a mobile number at /bible-school/learn and learn on the web, including paying for programs and joining live classes.'),
  ('feature', 'bible-school', 'Bible School guide and complete documentation', 'In-dashboard Guide tab and docs/bible-school-guide.md.'),
  ('improvement', 'bible-school', 'Video duration read from the uploaded file', 'Minutes, picture size and file size are filled in from the video or audio file.'),
  ('bug', 'mobile', 'Full screen video did not play properly', 'A redraw restarted and disposed the player; the file link is now fetched once per lesson.'),
  ('bug', 'mobile', 'App stayed in landscape after leaving full screen', 'Leaving full screen locks the app back to portrait.'),
  ('bug', 'mobile', 'Course completion was not shown in real time', 'Completing a lesson now refreshes the outline, Next and the course page at once.'),
  ('bug', 'mobile', 'Notification bell did not open the notification center', 'The lookup used the wrong profile column; it now uses auth_user_id and always opens.'),
  ('bug', 'mobile', 'Intermittent ''session is invalid'' screen', 'Expired access tokens are renewed before each server call.'),
  ('feature', 'notifications', 'Heads-up for birthdays and anniversaries tomorrow', 'Owners and admins get a day-before notification (0195).'),
  ('feature', 'prayer', 'Voice messages on prayer requests', 'Members record up to 90 seconds; stored privately; team and the wall can play them; deleted with the request, member or church (0199).'),
  ('feature', 'landing', 'Landing page: new features and iPhone coming soon', 'Bible School, pop-ups, birthday alerts, Bible School phone mockup and an App Store coming-soon badge.'),
  ('security', 'security', 'Sign-in session kept in secure storage on the phone', 'Keychain / Android Keystore instead of plain preferences; existing sessions are moved across.'),
  ('security', 'security', 'Connection secrets encrypted at rest', 'Social tokens, churches'' payment-gateway keys and SMTP passwords sealed with AES-256-GCM; encrypt and rotate scripts.'),
  ('security', 'security', 'Browser security headers and a report-only content security policy', 'Applied in next.config.ts with a report endpoint.'),
  ('security', 'security', 'Privacy policy lists the real security practices', 'Data security section rewritten to match what the code does.'),
  ('improvement', 'platform', 'Unexpected failures handled on web and mobile', 'Admin screens show a message instead of crashing; payment finalize and return never throw after money is taken.'),
  ('improvement', 'platform', 'End-to-end smoke tests, releasing checklist and key rotation', 'Playwright read-only tests, docs/releasing.md and scripts/rotate-connection-secrets.mjs.'),
  ('bug', 'bible-school', 'Program requests from the app were invisible to the team', 'Requests now show on the Enrollments page, on the overview and as a badge on the program; the team is notified.'),
  ('bug', 'bible-school', 'Enrolling a member in a course ignored the program', 'A course inside a program now enrolls the member in the program, approving an open request instead of leaving it waiting.'),
  ('improvement', 'members', 'Member search by name and mobile number in one box', 'Shared search used in the Bible School, attendance, prayer and push pickers.')
) as v(type, area, title, description)
where not exists (select 1 from public.change_tickets);

-- Reversal (run manually if needed):
--   drop trigger if exists on_program_request_created on public.lms_program_enrollments;
--   drop function if exists public.notify_program_request();
--   drop table if exists public.change_ticket_comments, public.change_tickets;
