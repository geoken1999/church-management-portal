-- Country (ISO 3166-1 alpha-2, e.g. 'US', 'GB', 'IN') for organizations
-- and branches — used to resolve which country code a member's phone
-- number should be parsed with for SMS. Nullable: existing orgs/branches
-- won't have one set, and the app prompts for it (via the Church Profile
-- page) rather than forcing a value here or guessing a default.
alter table public.organizations add column if not exists country text;
alter table public.branches add column if not exists country text;
