-- Waiting room for K-Connect calls that admit people one by one, for people
-- joining from the mobile app. The call provider's own "ask to join" step isn't
-- reliable in the app's native SDK, so the request lives here: the person asks,
-- a host (on the web or in the app) admits or denies, and only then is the person
-- given a way into the call. Only the server touches this table.
create table if not exists public.kmeet_entry_requests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.kmeet_meetings(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'allowed', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (meeting_id, user_id)
);

alter table public.kmeet_entry_requests enable row level security;
-- No policies on purpose: the server uses the service role.

-- Reversal (run manually if needed): drop table if exists public.kmeet_entry_requests;
