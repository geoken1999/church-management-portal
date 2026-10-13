-- Live streaming is set up per church, on request: a church asks, the team enables it
-- (and bills for it) by hand. No row means the church hasn't asked and can't use it.
create table if not exists public.live_stream_access (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  requested_at timestamptz,
  requested_by uuid references public.profiles (auth_user_id) on delete set null,
  enabled_at timestamptz,
  -- For the team: what was agreed, and how it is billed.
  note text,
  updated_at timestamptz not null default now()
);

alter table public.live_stream_access enable row level security;

drop policy if exists "Team can see their church's live stream access" on public.live_stream_access;
create policy "Team can see their church's live stream access"
  on public.live_stream_access for select to authenticated
  using (public.is_org_member(organization_id));

-- Churches that already have live streams (made while this was in testing) keep using them.
insert into public.live_stream_access (organization_id, enabled, enabled_at, note)
select distinct organization_id, true, now(), 'Enabled automatically: had live streams before access was by request.'
from public.live_streams
on conflict (organization_id) do nothing;

-- Reversal (run manually if needed):
--   drop table if exists public.live_stream_access;
