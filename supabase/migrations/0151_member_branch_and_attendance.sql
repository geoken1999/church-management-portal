-- What a signed-in (phone-login) member can see about themselves in the
-- mobile app: the branch they belong to, and their attendance record.

create or replace function public.get_my_branch(target_org_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select b.name
  from public.members m
  join public.branches b on b.id = m.branch_id
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

-- The services this member could have attended in the last [since_days] days
-- (sessions of their own branch, plus church-wide sessions with no branch)
-- and whether they were marked present at each.
create or replace function public.get_my_attendance(target_org_id uuid, since_days integer default 180)
returns table (session_title text, occurrence_date date, attended boolean)
language sql
security definer
stable
set search_path = public
as $$
  select s.title, s.occurrence_date,
    exists (select 1 from public.attendance_records r where r.session_id = s.id and r.member_id = m.id)
  from public.members m
  join public.attendance_sessions s on s.organization_id = m.organization_id
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and s.occurrence_date >= current_date - greatest(least(since_days, 365), 1)
    and s.occurrence_date <= current_date
    and (s.branch_id is null or s.branch_id = m.branch_id)
  order by s.occurrence_date desc
  limit 400;
$$;

grant execute on function public.get_my_branch(uuid) to authenticated;
grant execute on function public.get_my_attendance(uuid, integer) to authenticated;

-- Reversal (run manually if needed):
--   drop function if exists public.get_my_attendance(uuid, integer);
--   drop function if exists public.get_my_branch(uuid);
