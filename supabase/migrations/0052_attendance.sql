-- Attendance module: a "session" is one taking-of-attendance instance,
-- scoped to a branch (nullable — null means org-wide, same convention as
-- events.branch_id/members.branch_id) and optionally linked to a calendar
-- event. Events don't store recurrence per-occurrence (see
-- src/lib/events/recurrence.ts) — occurrences are computed on the fly — so
-- a session records which event it's for AND which concrete date
-- (occurrence_date) that was, rather than relying on a per-occurrence row
-- that doesn't exist. Presence is modeled as row-existence in
-- attendance_records (one row per checked-in member) rather than a
-- present/absent enum — simpler to build a checklist UI against, and
-- absence is just "no row".

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  occurrence_date date not null,
  title text not null check (length(trim(title)) >= 2),
  notes text,
  headcount integer check (headcount is null or headcount >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);

create index if not exists attendance_sessions_organization_id_idx on public.attendance_sessions (organization_id);
create index if not exists attendance_sessions_branch_id_idx on public.attendance_sessions (branch_id);
create index if not exists attendance_sessions_event_id_idx on public.attendance_sessions (event_id);
create index if not exists attendance_records_organization_id_idx on public.attendance_records (organization_id);
create index if not exists attendance_records_session_id_idx on public.attendance_records (session_id);
create index if not exists attendance_records_member_id_idx on public.attendance_records (member_id);

-- One session per calendar-event occurrence — prevents accidentally
-- creating two attendance sessions for the same Sunday of the same
-- recurring event.
create unique index if not exists attendance_sessions_event_occurrence_key
  on public.attendance_sessions (event_id, occurrence_date)
  where event_id is not null;

drop trigger if exists set_attendance_sessions_updated_at on public.attendance_sessions;
create trigger set_attendance_sessions_updated_at
  before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

-- Belt-and-braces, same pattern as folder_categories/shared_documents
-- (migration 0050): branch_id and event_id must belong to the same org as
-- the session, so a session can't be filed under another org's branch or
-- event and leak data across tenants through a join.
create or replace function public.check_attendance_session_org()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'branch_id must belong to the same organization as the session';
  end if;

  if new.event_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'event_id must belong to the same organization as the session';
  end if;

  return new;
end;
$$;

drop trigger if exists check_attendance_session_org on public.attendance_sessions;
create trigger check_attendance_session_org
  before insert or update of branch_id, event_id, organization_id on public.attendance_sessions
  for each row execute function public.check_attendance_session_org();

-- Same guard for records: the checked-in member and the session's
-- organization_id must agree, and organization_id must actually match the
-- parent session's org (organization_id is denormalized here purely so RLS
-- can filter this table directly, same as committee_members).
create or replace function public.check_attendance_record_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.attendance_sessions s where s.id = new.session_id and s.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the attendance session''s organization';
  end if;

  if not exists (
    select 1 from public.members m where m.id = new.member_id and m.organization_id = new.organization_id
  ) then
    raise exception 'member_id must belong to the same organization as the session';
  end if;

  return new;
end;
$$;

drop trigger if exists check_attendance_record_org on public.attendance_records;
create trigger check_attendance_record_org
  before insert or update of session_id, member_id, organization_id on public.attendance_records
  for each row execute function public.check_attendance_record_org();

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

-- Same shape as events/members: any org member can add/edit day-to-day
-- attendance; deleting a session is restricted to admins as a safety net.
drop policy if exists "Org members can view attendance sessions" on public.attendance_sessions;
create policy "Org members can view attendance sessions"
  on public.attendance_sessions for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can add attendance sessions" on public.attendance_sessions;
create policy "Org members can add attendance sessions"
  on public.attendance_sessions for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Org members can update attendance sessions" on public.attendance_sessions;
create policy "Org members can update attendance sessions"
  on public.attendance_sessions for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins can delete attendance sessions" on public.attendance_sessions;
create policy "Admins can delete attendance sessions"
  on public.attendance_sessions for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists "Org members can view attendance records" on public.attendance_records;
create policy "Org members can view attendance records"
  on public.attendance_records for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can add attendance records" on public.attendance_records;
create policy "Org members can add attendance records"
  on public.attendance_records for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Org members can delete attendance records" on public.attendance_records;
create policy "Org members can delete attendance records"
  on public.attendance_records for delete to authenticated
  using (public.is_org_member(organization_id));
