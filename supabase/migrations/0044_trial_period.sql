-- New organizations get 3 days of Basic-tier access before a subscription
-- is required (see getPlanAccess in src/lib/plans/dal.ts). The default
-- expression is evaluated per row at insert time for new organizations;
-- for existing rows, this ALTER evaluates it once at migration time,
-- effectively giving every current organization a fresh 3-day trial from
-- today rather than backdating it to their original signup date.
alter table public.organizations
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '3 days');
