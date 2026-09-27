-- Lets a platform admin see every currently-valid Supabase Auth session
-- across all tenants, labeled with the signed-in user's email and which
-- organization(s) they belong to, and force-revoke any one of them.
--
-- auth.sessions/auth.users aren't exposed via PostgREST (by design — Auth
-- internals shouldn't be queryable over the REST API), so this reaches them
-- the same way get_tenant_storage_bytes (migration 0080) reaches
-- storage.objects: a security definer function in the public schema,
-- locked to service_role only.
--
-- Revoking is a plain `delete from auth.sessions` — this is not a
-- workaround; Supabase's own docs describe normal sign-out as removing the
-- affected session row(s) from this exact table. refresh_tokens.session_id
-- has an ON DELETE CASCADE onto sessions.id (confirmed on this project), so
-- deleting the session row alone is enough to invalidate it — no separate
-- refresh_tokens cleanup needed. Because this app's proxy.ts calls
-- supabase.auth.getUser() (not the weaker getSession()) on every request,
-- that revalidates against the Auth server each time, so a killed session
-- stops working on the killed user's very next request rather than only
-- after their access token's own expiry.
create or replace function public.get_active_sessions()
returns table (
  session_id uuid,
  user_id uuid,
  user_email text,
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
    coalesce(array_agg(distinct o.name) filter (where o.name is not null), '{}') as organization_names,
    s.created_at,
    s.updated_at,
    s.not_after,
    s.user_agent,
    s.ip::text
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  left join public.organization_members om on om.auth_user_id = s.user_id
  left join public.organizations o on o.id = om.organization_id
  where s.not_after is null or s.not_after > now()
  group by s.id, s.user_id, u.email, s.created_at, s.updated_at, s.not_after, s.user_agent, s.ip
  order by s.updated_at desc
  limit 500;
$$;

revoke all on function public.get_active_sessions() from public;
grant execute on function public.get_active_sessions() to service_role;

create or replace function public.admin_revoke_session(target_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.sessions where id = target_session_id;
$$;

revoke all on function public.admin_revoke_session(uuid) from public;
grant execute on function public.admin_revoke_session(uuid) to service_role;
