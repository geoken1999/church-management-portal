-- Planner checklist items assigned to a member (plans.items[].assignedTo holds
-- a members.id), shown to that member in the mobile app's Space tab, where
-- they can also tick them off.

create or replace function public.get_my_plan_tasks(target_org_id uuid)
returns table (
  plan_id uuid,
  plan_title text,
  plan_target_date date,
  item_id text,
  item_text text,
  done boolean,
  start_time text,
  end_time text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.title, p.target_date, e.item ->> 'id', e.item ->> 'text',
    coalesce((e.item ->> 'done')::boolean, false), e.item ->> 'startTime', e.item ->> 'endTime'
  from public.members m
  join public.plans p on p.organization_id = m.organization_id
  cross join lateral jsonb_array_elements(p.items) as e(item)
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and p.status in ('draft', 'active')
    and e.item ->> 'assignedTo' = m.id::text
  order by coalesce((e.item ->> 'done')::boolean, false), p.target_date nulls last, p.title
  limit 100;
$$;

-- Ticks (or unticks) one item, only if it is assigned to the signed-in member.
create or replace function public.set_my_plan_task_done(target_org_id uuid, target_plan_id uuid, target_item_id text, is_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_member_id uuid;
begin
  select m.id into my_member_id
  from public.members m
  where m.organization_id = target_org_id and m.auth_user_id = auth.uid() and m.status = 'active'
  limit 1;
  if my_member_id is null then
    raise exception 'Not a member of this organization';
  end if;

  update public.plans p
  set items = (
    select coalesce(jsonb_agg(
      case
        when t.item ->> 'id' = target_item_id and t.item ->> 'assignedTo' = my_member_id::text
          then jsonb_set(t.item, '{done}', to_jsonb(is_done))
        else t.item
      end
      order by t.ord
    ), '[]'::jsonb)
    from jsonb_array_elements(p.items) with ordinality as t(item, ord)
  )
  where p.id = target_plan_id and p.organization_id = target_org_id;
end;
$$;

grant execute on function public.get_my_plan_tasks(uuid) to authenticated;
grant execute on function public.set_my_plan_task_done(uuid, uuid, text, boolean) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.set_my_plan_task_done(uuid, uuid, text, boolean);
--   drop function if exists public.get_my_plan_tasks(uuid);
