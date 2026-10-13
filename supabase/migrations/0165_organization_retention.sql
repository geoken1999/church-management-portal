-- What happens to a church whose access has ended (free trial over, or its paid
-- subscription cancelled or lapsed) and which never comes back: it is reminded every
-- 7 days to resubscribe, warned the day before, and after 30 days its account and all
-- of its data are deleted for good. A daily job (see src/lib/retention) does this.
--
-- organization_retention: one row per church that is in that countdown. The row goes
-- away on its own if the church resubscribes.
create table if not exists public.organization_retention (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- When we started the countdown (when we first saw the church without access).
  expired_since timestamptz not null default now(),
  reminders_sent integer not null default 0,
  last_reminder_at timestamptz,
  final_warning_sent_at timestamptz,
  -- Set by the platform admin to keep a church forever: it is never deleted.
  exempt boolean not null default false,
  -- Why a church due for deletion was skipped, e.g. it is still owed money.
  blocked_reason text,
  updated_at timestamptz not null default now()
);

-- platform_settings: a few switches the platform admin controls. The automatic
-- deletion switch is "retention_auto_delete" and starts OFF.
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default 'false'::jsonb,
  updated_at timestamptz not null default now()
);

-- deleted_organizations: a record that a church was deleted and when, kept after
-- the church itself is gone.
create table if not exists public.deleted_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  owner_email text,
  expired_since timestamptz,
  deleted_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

alter table public.organization_retention enable row level security;
alter table public.platform_settings enable row level security;
alter table public.deleted_organizations enable row level security;
-- No policies on purpose: only the server (service role) touches these.

-- Reversal (run manually if needed):
--   drop table if exists public.deleted_organizations;
--   drop table if exists public.platform_settings;
--   drop table if exists public.organization_retention;
