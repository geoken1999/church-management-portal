-- To-do events: the groups a team creates inside the To Do module itself
-- (a camp, a conference, a mission trip) to keep their tasks together. They
-- are NOT the calendar's Events: nobody has to create an event first, and
-- a to-do event is just a name and an optional date.
--
-- This replaces migration 0139's link from a to-do to a calendar event
-- (todos.event_id), which is migrated across and dropped below. Deleting a
-- to-do event keeps its to-dos (they become ordinary ones).
create table if not exists public.todo_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  event_date date,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_events_organization_id_idx on public.todo_events (organization_id);

drop trigger if exists set_todo_events_updated_at on public.todo_events;
create trigger set_todo_events_updated_at
  before update on public.todo_events
  for each row execute function public.set_updated_at();

-- Same open-to-the-team model as todos themselves (migration 0032): any
-- org member can create, rename, or delete them; the app's To Do tab
-- permissions are what gate who reaches this.
alter table public.todo_events enable row level security;

drop policy if exists "Members can view their org's todo events" on public.todo_events;
create policy "Members can view their org's todo events"
  on public.todo_events for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create todo events" on public.todo_events;
create policy "Members can create todo events"
  on public.todo_events for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update todo events" on public.todo_events;
create policy "Members can update todo events"
  on public.todo_events for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can delete todo events" on public.todo_events;
create policy "Members can delete todo events"
  on public.todo_events for delete to authenticated
  using (public.is_org_member(organization_id));

alter table public.todos
  add column if not exists todo_event_id uuid references public.todo_events (id) on delete set null;

create index if not exists todos_todo_event_id_idx on public.todos (todo_event_id) where todo_event_id is not null;

create or replace function public.check_todo_todo_event_org()
returns trigger
language plpgsql
as $$
begin
  if new.todo_event_id is not null and not exists (
    select 1 from public.todo_events e where e.id = new.todo_event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'todo_event_id must belong to the same organization as the to-do';
  end if;
  return new;
end;
$$;

drop trigger if exists check_todo_todo_event_org on public.todos;
create trigger check_todo_todo_event_org
  before insert or update of todo_event_id, organization_id on public.todos
  for each row execute function public.check_todo_todo_event_org();

-- Carry across anything already linked to a calendar event (0139): one
-- to-do event per calendar event, named and dated after it.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'todos' and column_name = 'event_id') then
    create temporary table _todo_event_map on commit drop as
      select e.id as calendar_id, gen_random_uuid() as new_id, e.organization_id, e.title, e.start_at::date as event_date
      from public.events e
      where e.id in (select event_id from public.todos where event_id is not null);

    insert into public.todo_events (id, organization_id, title, event_date)
    select new_id, organization_id, title, event_date from _todo_event_map;

    update public.todos t set todo_event_id = m.new_id
    from _todo_event_map m
    where t.event_id = m.calendar_id;
  end if;
end;
$$;

drop trigger if exists check_todo_event_org on public.todos;
drop function if exists public.check_todo_event_org();
drop index if exists public.todos_event_id_idx;
alter table public.todos drop column if exists event_id;

-- Reversal (run manually if needed): this drops the to-do events (their
-- to-dos stay, ungrouped).
--   drop trigger if exists check_todo_todo_event_org on public.todos;
--   drop function if exists public.check_todo_todo_event_org();
--   alter table public.todos drop column if exists todo_event_id;
--   drop table if exists public.todo_events;
