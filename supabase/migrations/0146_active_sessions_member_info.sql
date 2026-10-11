-- Active sessions, with who a mobile member sign-in belongs to. A member
-- who signs in to the mobile app with their phone has no email, so the
-- Super Admin sessions page showed "(no email)"; this also returns their
-- phone and, when the phone is linked to a church member, the member's name
-- and church. (The return type changes, so the function is dropped and
-- recreated.)
drop function if exists public.get_active_sessions();

create function public.get_active_sessions()
returns table (
  session_id uuid,
  user_id uuid,
  user_email text,
  user_phone text,
  member_name text,
  organization_names text[],
  created_at timestamptz,
  updated_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as session_id,
    s.user_id,
    u.email as user_email,
    u.phone as user_phone,
    (array_agg(distinct m.first_name || ' ' || m.last_name) filter (where m.id is not null))[1] as member_name,
    coalesce(array_agg(distinct o.name) filter (where o.name is not null), '{}') as organization_names,
    s.created_at,
    s.updated_at,
    s.not_after,
    s.user_agent,
    s.ip::text
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  left join public.organization_members om on om.auth_user_id = s.user_id
  left join public.members m on m.auth_user_id = s.user_id
  left join public.organizations o on o.id in (om.organization_id, m.organization_id)
  where s.not_after is null or s.not_after > now()
  group by s.id, s.user_id, u.email, u.phone, s.created_at, s.updated_at, s.not_after, s.user_agent, s.ip
  order by s.updated_at desc
  limit 500;
$$;

revoke all on function public.get_active_sessions() from public;
grant execute on function public.get_active_sessions() to service_role;

-- Reversal (run manually if needed): recreate the function from migration 0083.
