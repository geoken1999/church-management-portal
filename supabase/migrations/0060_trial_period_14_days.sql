-- Extends the free trial from 3 to 14 days (see migration 0044). Only
-- changes the default applied to newly-created organizations going
-- forward — unlike 0044's original "add column ... default (...)", this is
-- a plain "alter column ... set default", which does NOT touch existing
-- rows, so organizations already trialing or already past their trial
-- keep whatever trial_ends_at they already have.
alter table public.organizations
  alter column trial_ends_at set default (now() + interval '14 days');
