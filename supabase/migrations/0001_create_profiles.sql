-- Module 01: User Management & Authentication
-- Profile table for Supabase-authenticated users, plus RLS so a user can only
-- ever see/edit their own row. Run this in the Supabase SQL editor, or via
-- `supabase db push` if the project is linked to the Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  -- organization_id uuid references public.organizations (id) on delete cascade,
  -- ^ reserved for the multi-tenant Organization module; intentionally not
  --   added yet so this module stays scoped to auth only.
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_auth_user_id_idx on public.profiles (auth_user_id);

-- Keep updated_at current on every row change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create a profile whenever a new Supabase Auth user is created, using
-- the metadata passed to supabase.auth.signUp({ options: { data } }). This
-- runs as SECURITY DEFINER so it can write to public.profiles regardless of
-- the RLS policies below (which intentionally block direct client inserts).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Row Level Security: a user may only ever read/update their own profile.
-- No insert/delete policies are defined for the client role — profile rows
-- are created exclusively by the trigger above and never deleted directly.
alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);
