-- One row per church per day once its daily "special days" summary has gone to the owners and admins,
-- so a re-run of the daily job never sends it twice. Only the server writes here.
create table if not exists public.special_day_digests (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, day)
);
alter table public.special_day_digests enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.special_day_digests;
