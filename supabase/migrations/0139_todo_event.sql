-- Event-based to-dos: a to-do can belong to an event (a camp, a conference,
-- a service), so the tasks for it are kept together and shown with its
-- name, including in the mobile app for whoever the task is assigned to.
-- Optional: an ordinary to-do has no event. Deleting the event keeps its
-- to-dos (they just become ordinary ones).
alter table public.todos
  add column if not exists event_id uuid references public.events (id) on delete set null;

create index if not exists todos_event_id_idx on public.todos (event_id) where event_id is not null;

-- Belt-and-braces, same idea as the attendance tables: the event must
-- belong to the same organization as the to-do.
create or replace function public.check_todo_event_org()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.organization_id = new.organization_id
  ) then
    raise exception 'event_id must belong to the same organization as the to-do';
  end if;
  return new;
end;
$$;

drop trigger if exists check_todo_event_org on public.todos;
create trigger check_todo_event_org
  before insert or update of event_id, organization_id on public.todos
  for each row execute function public.check_todo_event_org();

-- Reversal (run manually if needed):
--   drop trigger if exists check_todo_event_org on public.todos;
--   drop function if exists public.check_todo_event_org();
--   alter table public.todos drop column if exists event_id;
