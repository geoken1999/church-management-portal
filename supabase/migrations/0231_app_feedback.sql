-- Feedback from the web app and the mobile apps (rating, a kind of feedback and a message), read by the
-- KingdomFlow team in Super Admin → Feedback. Written only by the server (web action and /api/mobile/feedback)
-- and read only by the platform admin, so RLS is on with no policies.

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('web', 'android', 'ios')),
  organization_id uuid references public.organizations (id) on delete set null,
  auth_user_id uuid references auth.users (id) on delete set null,
  user_name text,
  user_email text,
  role text,
  rating integer not null check (rating between 1 and 5),
  category text not null default 'other' check (category in ('praise', 'idea', 'problem', 'other')),
  message text not null default '' check (length(message) <= 2000),
  screen text,
  app_version text,
  device text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);
create index if not exists app_feedback_user_idx on public.app_feedback (auth_user_id, created_at desc);

alter table public.app_feedback enable row level security;
