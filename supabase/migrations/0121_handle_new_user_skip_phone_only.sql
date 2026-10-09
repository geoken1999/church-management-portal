-- handle_new_user (0001_create_profiles.sql) fires on every new auth.users
-- row and unconditionally inserts into public.profiles with email =
-- new.email. That's fine for every signup this app had until now — Team
-- logins are always email/password — but phone+OTP member login
-- (migration 0120) creates an auth.users row with NO email at all, and
-- profiles.email is not-null. The insert fails, which rolls back the
-- WHOLE auth.users insert inside the same transaction, so
-- supabase.auth.signInWithOtp fails outright (confirmed live: a 500 with
-- "null value in column \"email\" of relation \"profiles\" violates
-- not-null constraint") before Supabase even gets to sending the SMS.
--
-- profiles is Team/staff identity, keyed by email — a phone-only auth
-- user has no business getting one at all; members.auth_user_id is the
-- separate identity a member actually gets. So this skips profile
-- creation entirely when there's no email, rather than relaxing the
-- not-null constraint and leaving a semantically-empty profiles row
-- behind for every member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

-- Reversal (run manually if needed — restores the unconditional insert):
--   create or replace function public.handle_new_user()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   begin
--     insert into public.profiles (auth_user_id, first_name, last_name, email, phone)
--     values (new.id, coalesce(new.raw_user_meta_data ->> 'first_name', ''), coalesce(new.raw_user_meta_data ->> 'last_name', ''), new.email, new.raw_user_meta_data ->> 'phone');
--     return new;
--   end;
--   $$;
