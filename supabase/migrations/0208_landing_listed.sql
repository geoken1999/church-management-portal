-- Churches shown on the public landing page. Nothing is listed by default: a platform admin turns a church on (Super
-- Admin > the church > "Show on landing page"), after agreeing it with them. The landing page then shows the church's
-- name, logo and country, nothing else.

alter table public.organizations
  add column if not exists landing_listed boolean not null default false;

-- Reversal (run manually if needed):
--   alter table public.organizations drop column if exists landing_listed;
