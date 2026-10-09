-- Member phone+OTP login for the mobile app. A member has no account of
-- their own today (members is congregation data staff maintain, not a
-- login) — this links a member row to the Supabase Auth identity Supabase
-- itself creates on first successful phone-OTP verification, set once by
-- the mobile app's own backend route (/api/mobile/member-auth/complete)
-- after re-verifying the OTP-session's phone server-side. Unrelated to
-- organization_members/profiles, which is what team/staff logins use.
alter table public.members
  add column if not exists auth_user_id uuid null unique references auth.users (id) on delete set null;

create index if not exists members_auth_user_id_idx on public.members (auth_user_id) where auth_user_id is not null;

-- A member can read their OWN row once linked — the one new read surface
-- this enables; everything else about what a logged-in member can see is
-- still unbuilt (see the mobile app's MemberHomePage placeholder). Existing
-- "Org members can view members" (staff, via is_org_member) is unaffected —
-- RLS policies for the same command are OR'd together, not replaced.
drop policy if exists "Members can view their own record" on public.members;
create policy "Members can view their own record"
  on public.members for select to authenticated
  using (auth_user_id = auth.uid());

-- Reversal (run manually if needed):
--   drop policy if exists "Members can view their own record" on public.members;
--   alter table public.members drop column if exists auth_user_id;
