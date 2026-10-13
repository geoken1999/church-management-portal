-- Health of the KingdomFlow mobile app, reported by the app itself and shown to the
-- platform admin: which versions and devices are in use, how often sessions end
-- badly, and which errors keep happening. Only the server writes and reads these.
--
-- mobile_app_devices: one row per installed copy of the app.
create table if not exists public.mobile_app_devices (
  device_id uuid primary key,
  platform text not null check (platform in ('android', 'ios')),
  app_version text not null default '',
  build_number text not null default '',
  os_version text not null default '',
  device_model text not null default '',
  role text check (role in ('team', 'member', 'guest')),
  auth_user_id uuid,
  organization_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists mobile_app_devices_last_seen_idx on public.mobile_app_devices (last_seen_at desc);

-- mobile_app_events: a session starting, an error the app caught, or a session that
-- seems to have ended in a crash (the app was in the foreground when it last ran and
-- never went to the background or closed normally).
create table if not exists public.mobile_app_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  kind text not null check (kind in ('session', 'error', 'crash_suspected')),
  platform text not null default '',
  app_version text not null default '',
  os_version text not null default '',
  device_model text not null default '',
  screen text not null default '',
  message text not null default '',
  stack text not null default '',
  fingerprint text not null default '',
  auth_user_id uuid,
  organization_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists mobile_app_events_created_idx on public.mobile_app_events (created_at desc);
create index if not exists mobile_app_events_kind_idx on public.mobile_app_events (kind, created_at desc);

alter table public.mobile_app_devices enable row level security;
alter table public.mobile_app_events enable row level security;
-- No policies on purpose: the server uses the service role.

-- Reversal (run manually if needed):
--   drop table if exists public.mobile_app_events;
--   drop table if exists public.mobile_app_devices;
