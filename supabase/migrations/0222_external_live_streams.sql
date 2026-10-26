-- A church that streams to YouTube or Facebook (from OBS, outside KingdomFlow) can tell its members: it saves the link of
-- the live stream, members are notified, and the app shows a "Live now" card that opens it. KingdomFlow does not carry the
-- video; this is only the link, so it costs the church and us nothing.
create table if not exists public.external_live_streams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  platform text not null check (platform in ('youtube', 'facebook')),
  url text not null check (url like 'https://%' and length(url) <= 400),
  started_at timestamptz not null default now(),
  -- Null while it is live. A stream nobody ended stops showing after 12 hours anyway.
  ended_at timestamptz,
  notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists external_live_streams_org_idx on public.external_live_streams (organization_id, started_at desc);

alter table public.external_live_streams enable row level security;

-- The church's team can read them; the server (service role) writes after checking the Live stream permission, and
-- members' phones read through the mobile API.
drop policy if exists "Org members can view external live streams" on public.external_live_streams;
create policy "Org members can view external live streams"
  on public.external_live_streams for select to authenticated
  using (public.is_org_member(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.external_live_streams;
