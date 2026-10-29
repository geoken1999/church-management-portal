-- Zoom and Google Meet: a church connects its own account, then creates meetings from KingdomFlow.
-- conference_connections holds the church's OAuth tokens (encrypted by the app before they are stored); it and
-- conference_meetings are read and written only by the server, after it has checked the person's K-Connect access,
-- so RLS is on with no policies.

create table if not exists public.conference_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('zoom', 'google_meet')),
  account_id text not null,
  account_email text,
  account_name text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

drop trigger if exists set_conference_connections_updated_at on public.conference_connections;
create trigger set_conference_connections_updated_at before update on public.conference_connections
  for each row execute function public.set_updated_at();

create table if not exists public.conference_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('zoom', 'google_meet')),
  -- Zoom: the meeting number. Google Meet: the space name ("spaces/abc...").
  external_id text not null,
  title text not null check (length(trim(title)) >= 1),
  start_time timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  join_url text not null,
  passcode text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists conference_meetings_org_idx on public.conference_meetings (organization_id, created_at desc);

alter table public.conference_connections enable row level security;
alter table public.conference_meetings enable row level security;
