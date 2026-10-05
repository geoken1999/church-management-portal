-- Member follow-up automation: flags members with no recorded attendance on
-- N consecutive Sundays and creates a follow-up task for a leader.
--
-- Attendance has no notion of "taken" vs "not taken": a session nobody
-- recorded looks the same as one where everyone was absent. recorded_at
-- is set by an explicit "mark register complete" action, and only
-- recorded sessions count toward absence.

alter table public.attendance_sessions
  add column if not exists recorded_at timestamptz null;

create index if not exists attendance_sessions_org_date_idx
  on public.attendance_sessions (organization_id, occurrence_date);

-- automations: widen the type check and add a config blob for types that
-- need more than name/status. Birthday rows keep their existing shape.
alter table public.automations drop constraint if exists automations_type_check;
alter table public.automations
  add constraint automations_type_check check (type in ('birthday_anniversary', 'member_followup')),
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists last_run_at timestamptz null;

-- todos: reused as the follow-up task store. All nullable so existing
-- to-dos are unaffected.
alter table public.todos
  add column if not exists member_id uuid null references public.members (id) on delete set null,
  add column if not exists branch_id uuid null references public.branches (id) on delete set null,
  add column if not exists automation_id uuid null references public.automations (id) on delete set null,
  add column if not exists priority text not null default 'normal' check (priority in ('low', 'normal', 'high'));

create index if not exists todos_automation_member_idx on public.todos (automation_id, member_id);

-- One open follow-up per member per automation. Completing the task lets
-- the next cycle create a new one; a second insert while it's still
-- pending fails at the database, not just in application code.
create unique index if not exists todos_one_open_followup_per_member
  on public.todos (automation_id, member_id)
  where status = 'pending' and automation_id is not null and member_id is not null;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  run_key text not null unique,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  members_evaluated integer not null default 0,
  members_qualified integer not null default 0,
  tasks_created integer not null default 0,
  notifications_sent integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  error_summary text null
);

create index if not exists automation_runs_automation_idx on public.automation_runs (automation_id, started_at desc);

create table if not exists public.automation_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid null references public.members (id) on delete set null,
  outcome text not null check (outcome in ('task_created', 'skipped_existing_task', 'skipped_data_quality', 'error')),
  todo_id uuid null references public.todos (id) on delete set null,
  error_message text null,
  created_at timestamptz not null default now(),
  unique (run_id, member_id)
);

create index if not exists automation_run_items_run_idx on public.automation_run_items (run_id);

alter table public.automation_runs enable row level security;
alter table public.automation_run_items enable row level security;

drop policy if exists "Org members can view automation runs" on public.automation_runs;
create policy "Org members can view automation runs"
  on public.automation_runs for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can view automation run items" on public.automation_run_items;
create policy "Org members can view automation run items"
  on public.automation_run_items for select to authenticated
  using (public.is_org_member(organization_id));

-- Runs and their items are written only by the server-side engine (service
-- role), so no insert/update policy is granted to authenticated users.

-- Activation is the only point where an automation starts consuming the
-- plan's "active at a time" limit. The count and the status flip run under a
-- per-organization advisory lock in one transaction, so two concurrent
-- activations can't both see room and both succeed. Returns false when the
-- limit is reached. A null limit means unlimited.
create or replace function public.activate_automation_within_limit(
  p_org uuid,
  p_automation uuid,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('automation_activate:' || p_org::text));

  -- The automation must belong to this organization, otherwise nothing is
  -- activated and the caller must not be told it was.
  if not exists (
    select 1 from public.automations where id = p_automation and organization_id = p_org
  ) then
    return false;
  end if;

  select count(*) into active_count
    from public.automations
    where organization_id = p_org and status = 'active' and id <> p_automation;

  if p_limit is not null and active_count >= p_limit then
    return false;
  end if;

  update public.automations
    set status = 'active', updated_at = now()
    where id = p_automation and organization_id = p_org;

  return true;
end;
$$;

revoke execute on function public.activate_automation_within_limit(uuid, uuid, integer) from public, anon, authenticated;

-- Reversal (run manually if needed):
--   drop table if exists public.automation_run_items;
--   drop table if exists public.automation_runs;
--   drop index if exists public.todos_one_open_followup_per_member;
--   drop index if exists public.todos_automation_member_idx;
--   alter table public.todos drop column if exists priority, drop column if exists automation_id,
--     drop column if exists branch_id, drop column if exists member_id;
--   alter table public.automations drop column if exists last_run_at, drop column if exists config;
--   alter table public.automations drop constraint if exists automations_type_check;
--   alter table public.automations add constraint automations_type_check check (type in ('birthday_anniversary'));
--   drop function if exists public.activate_automation_within_limit(uuid, uuid, integer);
--   drop index if exists public.attendance_sessions_org_date_idx;
--   alter table public.attendance_sessions drop column if exists recorded_at;
