-- Walkie-talkie channels: a live audio room for one of a church's groups (Media team, Worship team, ...) that its
-- members join from the mobile app to talk push-to-talk style during a service. One live channel per group at a
-- time. Read and written by the server only (the app goes through /api/mobile/walkie).
create table if not exists public.walkie_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  group_key text not null check (group_key in ('leaders', 'youth', 'worship', 'media', 'committee')),
  name text not null,
  room_id text not null,
  status text not null default 'live' check (status in ('live', 'ended')),
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists walkie_channels_one_live_per_group
  on public.walkie_channels (organization_id, group_key) where status = 'live';
create index if not exists walkie_channels_org_status on public.walkie_channels (organization_id, status);

alter table public.walkie_channels enable row level security;
