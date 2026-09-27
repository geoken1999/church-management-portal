-- Tracks whether an organization has completed (or skipped) the welcome
-- tour shown on first dashboard visit — org-level rather than per-user,
-- since the tour is about orienting a newly-created church account, not
-- each individual login. Nullable/no default: existing organizations are
-- treated as already past onboarding (the tour only auto-shows itself for
-- one that's never been marked, i.e. every org created before this
-- migration would otherwise see it pop up unexpectedly — backfilled below
-- so that doesn't happen).
alter table public.organizations
  add column if not exists tour_completed_at timestamptz;

update public.organizations set tour_completed_at = created_at where tour_completed_at is null;
