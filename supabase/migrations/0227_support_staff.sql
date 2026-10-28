-- Support staff: people who help churches but are not Super Admin. They sign in with their own email and password and
-- get the Support console only (tickets, and a read-only view of a church). Super Admin adds, switches off and removes
-- them. Only the server (service role) reads or writes this table, so RLS is on with no policies.
create table if not exists public.support_staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  name text not null check (length(trim(name)) >= 2),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists support_staff_email_idx on public.support_staff (lower(email));
alter table public.support_staff enable row level security;

-- Rollback:
--   drop table if exists public.support_staff;
