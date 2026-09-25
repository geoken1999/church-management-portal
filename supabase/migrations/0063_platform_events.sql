-- Platform events — a lightweight, app-wide operational log for the
-- Super Admin dashboard's "Logs" page. This app has no external log
-- drain/observability service (Sentry, Axiom, etc.) — server console
-- output isn't readable from inside the app itself — so this table is
-- what key failure points and business-signal moments (quota exceeded,
-- send failures, webhook signature failures, etc.) explicitly write to
-- via logPlatformEvent() (src/lib/platform-events/log.ts). It only covers
-- what's been instrumented, not raw request/console logs.
create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warning', 'error')),
  source text not null,
  message text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_events_created_at_idx on public.platform_events (created_at desc);
create index if not exists platform_events_level_idx on public.platform_events (level);
create index if not exists platform_events_organization_id_idx on public.platform_events (organization_id);

-- Spans every organization and is only ever read from the Super Admin
-- dashboard (gated by requirePlatformAdmin, a plain email allowlist) —
-- there's no authenticated-role policy at all, so only the service-role
-- client (logPlatformEvent's writes, and the platform-admin dal's reads)
-- can touch this table, same lockdown as organization_subscriptions.
alter table public.platform_events enable row level security;
