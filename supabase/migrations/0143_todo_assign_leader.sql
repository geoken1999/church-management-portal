-- A to-do can now be assigned to a leader (a church member), not only to a
-- team member who has a dashboard login. A leader who signs in to the mobile
-- app with their phone sees their assigned to-dos in their Space tab and can
-- tick them off. Exactly one of assigned_to (team login) / assigned_member_id
-- (leader) is set, or neither.
alter table public.todos
  add column if not exists assigned_member_id uuid references public.members (id) on delete set null;

create index if not exists todos_assigned_member_id_idx on public.todos (assigned_member_id) where assigned_member_id is not null;

create or replace function public.check_todo_assigned_member_org()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_member_id is not null and not exists (
    select 1 from public.members m where m.id = new.assigned_member_id and m.organization_id = new.organization_id
  ) then
    raise exception 'assigned_member_id must belong to the same organization as the to-do';
  end if;
  return new;
end;
$$;

drop trigger if exists check_todo_assigned_member_org on public.todos;
create trigger check_todo_assigned_member_org
  before insert or update of assigned_member_id, organization_id on public.todos
  for each row execute function public.check_todo_assigned_member_org();

-- What a signed-in (phone-login) member sees: only the to-dos assigned to
-- them, with their event's name. A function rather than a table policy so a
-- member can't read anyone else's tasks or edit anything but "done".
create or replace function public.get_my_todos(target_org_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  due_at timestamptz,
  status text,
  event_title text,
  event_date date
)
language sql
security definer
stable
set search_path = public
as $$
  select t.id, t.title, t.description, t.due_at, t.status, e.title, e.event_date
  from public.todos t
  left join public.todo_events e on e.id = t.todo_event_id
  where t.organization_id = target_org_id
    and public.is_linked_member(target_org_id)
    and public.is_my_member(t.assigned_member_id)
  order by (t.status = 'completed'), t.due_at nulls last, t.created_at desc
  limit 200;
$$;

create or replace function public.set_my_todo_done(target_todo_id uuid, done boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.todos
  set status = case when done then 'completed' else 'pending' end,
      completed_at = case when done then now() else null end
  where id = target_todo_id and public.is_my_member(assigned_member_id);
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

grant execute on function public.get_my_todos(uuid) to authenticated;
grant execute on function public.set_my_todo_done(uuid, boolean) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.set_my_todo_done(uuid, boolean);
--   drop function if exists public.get_my_todos(uuid);
--   drop trigger if exists check_todo_assigned_member_org on public.todos;
--   drop function if exists public.check_todo_assigned_member_org();
--   alter table public.todos drop column if exists assigned_member_id;
