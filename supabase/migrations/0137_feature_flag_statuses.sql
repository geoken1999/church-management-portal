-- Module status beyond on/off. A module (tab) is one of:
--   off      nobody can use it
--   testing  only the platform's test users (FEATURE_TESTER_EMAILS)
--   beta     everyone, tagged "Beta" in the menu
--   live     everyone; right after moving from beta it is tagged "New" until
--            new_until (15 days later)
-- A tab with no row is live, as before. `enabled` is kept in step with it
-- (false only for 'off') so anything still reading it keeps working.
alter table public.platform_feature_flags
  add column if not exists status text not null default 'live' check (status in ('off', 'testing', 'beta', 'live')),
  add column if not exists new_until timestamptz;

-- Existing rows: a tab that was turned off stays off, the rest are live.
update public.platform_feature_flags set status = case when enabled then 'live' else 'off' end;

-- Reversal (run manually if needed):
--   alter table public.platform_feature_flags drop column if exists status, drop column if exists new_until;
