-- Lets a platform admin turn a tab/feature off app-wide, for every tenant
-- at once, independent of any org's plan or per-member tab_permissions —
-- a layer above both of those, not a replacement. Keyed by the same
-- TabKey enum the existing per-org permission matrix already uses (see
-- src/lib/permissions/tabs.ts), rather than inventing a second, parallel
-- feature-naming scheme. A tab with no row here is enabled by default
-- (missing = enabled, not missing = disabled) — see getDisabledFeatures in
-- src/lib/platform-admin/feature-flags.ts.
--
-- No RLS policies: "platform admin" is a plain email allowlist
-- (PLATFORM_ADMIN_EMAILS), not an org-membership concept RLS can evaluate,
-- so this is only ever read/written via the service-role admin client —
-- same pattern as every other service-role-only table in this app.
create table if not exists public.platform_feature_flags (
  tab_key text primary key,
  enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_feature_flags enable row level security;
