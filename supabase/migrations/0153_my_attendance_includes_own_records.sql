-- get_my_attendance (0151) only listed sessions of the member's own branch (and
-- church-wide ones). A member marked present at another branch's session, or
-- one with no branch set, then saw nothing. Anything they were actually marked
-- present at now always counts, on top of the branch rule.
create or replace function public.get_my_attendance(target_org_id uuid, since_days integer default 180)
returns table (session_title text, occurrence_date date, attended boolean)
language sql
security definer
stable
set search_path = public
as $$
  select s.title, s.occurrence_date, rec.session_id is not null
  from public.members m
  join public.attendance_sessions s on s.organization_id = m.organization_id
  left join public.attendance_records rec on rec.session_id = s.id and rec.member_id = m.id
  where m.organization_id = target_org_id
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and s.occurrence_date >= current_date - greatest(least(since_days, 365), 1)
    and s.occurrence_date <= current_date + 1
    and (s.branch_id is null or s.branch_id = m.branch_id or rec.session_id is not null)
  order by s.occurrence_date desc
  limit 400;
$$;

grant execute on function public.get_my_attendance(uuid, integer) to authenticated;

-- Reversal: re-run the get_my_attendance definition from 0151.
