-- Service users for the KingdomFlow Admin app: people who are not platform owners but may be given a limited set of
-- scopes (for example only "tickets" or only "health") in the admin app. Platform owners are still the emails in
-- PLATFORM_ADMIN_EMAILS and always have every scope. The table is read and written by the server only (service
-- role), never by a signed-in user directly. Managing these people from a screen comes later; until then a row is
-- added by hand.

create table if not exists public.platform_service_users (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  -- Any of: overview, churches, tickets, billing, health (see src/lib/admin-app/scopes.ts).
  scopes text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.platform_service_users enable row level security;
-- No policies on purpose: the server uses the service role.

-- Reversal (run manually if needed):
--   drop table if exists public.platform_service_users;
