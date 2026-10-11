-- Prayer requests raised by members in the mobile app, read (only) by the
-- church team on the web. Members create them through
-- /api/mobile/prayer-requests (which also notifies the team), so there is
-- no insert policy for them here.
--
-- visibility: 'private' = only the church team sees it; 'shared' = it also
-- appears on the in-app prayer wall for other members, with the member's
-- name hidden when is_anonymous. The team always sees who sent it, so they
-- can follow up.
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  request text not null check (length(trim(request)) between 3 and 1000),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  is_anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered')),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prayer_requests_org_created_idx on public.prayer_requests (organization_id, created_at desc);
create index if not exists prayer_requests_member_idx on public.prayer_requests (member_id, created_at desc);

drop trigger if exists set_prayer_requests_updated_at on public.prayer_requests;
create trigger set_prayer_requests_updated_at
  before update on public.prayer_requests
  for each row execute function public.set_updated_at();

-- Whether a members row is the signed-in member's own (phone-login) row.
create or replace function public.is_my_member(target_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where id = target_member_id and auth_user_id = auth.uid() and status = 'active'
  );
$$;

alter table public.prayer_requests enable row level security;

drop policy if exists "Org members can view prayer requests" on public.prayer_requests;
create policy "Org members can view prayer requests"
  on public.prayer_requests for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can view their own prayer requests" on public.prayer_requests;
create policy "Members can view their own prayer requests"
  on public.prayer_requests for select to authenticated
  using (public.is_my_member(member_id));

-- A member can close (mark answered) or withdraw their own request.
drop policy if exists "Members can update their own prayer requests" on public.prayer_requests;
create policy "Members can update their own prayer requests"
  on public.prayer_requests for update to authenticated
  using (public.is_my_member(member_id))
  with check (public.is_my_member(member_id));

drop policy if exists "Members can delete their own prayer requests" on public.prayer_requests;
create policy "Members can delete their own prayer requests"
  on public.prayer_requests for delete to authenticated
  using (public.is_my_member(member_id));

-- The prayer wall: other members' shared requests, without member ids and
-- with the name hidden for anonymous ones (otherwise shown as "First L.").
-- Open requests, plus answered ones for two weeks so praise can be seen.
create or replace function public.get_prayer_wall(target_org_id uuid)
returns table (
  id uuid,
  request text,
  author_name text,
  is_mine boolean,
  status text,
  created_at timestamptz,
  answered_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.request,
    case when p.is_anonymous then null else m.first_name || ' ' || left(m.last_name, 1) || '.' end,
    public.is_my_member(p.member_id),
    p.status,
    p.created_at,
    p.answered_at
  from public.prayer_requests p
  join public.members m on m.id = p.member_id
  where p.organization_id = target_org_id
    and public.is_linked_member(target_org_id)
    and p.visibility = 'shared'
    and (p.status = 'open' or p.answered_at > now() - interval '14 days')
  order by p.created_at desc
  limit 100;
$$;

grant execute on function public.get_prayer_wall(uuid) to authenticated;

-- Staff push preference for the new notification type (default on, like
-- the other categories).
alter table public.notification_preferences
  add column if not exists prayer_request boolean not null default true;

-- Reversal (run manually if needed):
--   alter table public.notification_preferences drop column if exists prayer_request;
--   drop function if exists public.get_prayer_wall(uuid);
--   drop table if exists public.prayer_requests;
--   drop function if exists public.is_my_member(uuid);
