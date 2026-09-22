-- Constrains organizations.plan (added nullable/unchecked in migration
-- 0030) to the three real tiers now that Basic/Premium/Pro are defined in
-- code (see src/lib/plans/config.ts). Existing rows already default to
-- 'basic', so this never needs a backfill.
alter table public.organizations
  drop constraint if exists organizations_plan_check,
  add constraint organizations_plan_check check (plan in ('basic', 'premium', 'pro'));
