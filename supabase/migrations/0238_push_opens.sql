-- How a sent notification performed: how many people it was delivered to (recipient_count, set when it is sent), how
-- many of the audience had the app (audience_size), and who opened it. An open is recorded by the app when the
-- person taps the notification; one row per person per notification. Read and written by the server only.
alter table public.push_broadcasts add column if not exists audience_size integer;

create table if not exists public.push_opens (
  broadcast_id uuid not null references public.push_broadcasts (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (broadcast_id, auth_user_id)
);

alter table public.push_opens enable row level security;
