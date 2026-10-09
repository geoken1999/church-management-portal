-- baptism_date: a built-in (not org-customizable) field, same category as
-- date_of_birth/marital_status/wedding_date (migration 0024) — but
-- optional ("if they have") and admin-set only, never part of the
-- member-editable My Details flow (migration 0123's PROFILE_UPDATE_FIELDS
-- deliberately excludes it): it's a church-administered sacrament record,
-- not something a member self-reports.
--
-- membership_code: what the mobile app's Membership screen renders as a
-- QR code for a team member to scan and take attendance with — same
-- pattern as event_registrations.confirmation_code (plain opaque text,
-- no signing; scanning already requires an authenticated staff session
-- with RLS access to the member's own org, so the code itself doesn't
-- need to be cryptographically unguessable, just unique). The volatile
-- default backfills a distinct code for every existing member in the
-- same statement, not just new ones.
alter table public.members
  add column if not exists baptism_date date null,
  add column if not exists membership_code text unique not null default gen_random_uuid()::text;

-- Reversal (run manually if needed):
--   alter table public.members drop column if exists membership_code, drop column if exists baptism_date;
