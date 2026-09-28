-- Push notifications for the KingdomFlow mobile app (Flutter, Firebase
-- Cloud Messaging). Two new tables plus one column on todos:
--
--   device_push_tokens        — one row per signed-in device/app-install,
--                                keyed by its FCM registration token.
--   notification_preferences  — per-user opt-in/out per notification
--                                category. A missing row means every
--                                category defaults to on (mirrors the
--                                "missing tab_permissions key = default"
--                                convention from migration 0040).
--   todos.last_reminder_sent_at — dedupes the daily due/overdue digest
--                                (see src/app/api/cron/todo-reminders) so
--                                the once-a-day cron doesn't re-notify for
--                                a to-do already covered today.
--
-- Sending itself happens from Next.js server code (src/lib/push/client.ts)
-- via firebase-admin, called directly from the events/todos server actions
-- and from the new daily cron route — the same "call the provider SDK
-- directly from server code" pattern already used for email/SMS/WhatsApp
-- (see src/lib/email/client.ts, src/lib/sms/client.ts), not a DB trigger
-- or Supabase Edge Function. Nothing in this migration sends anything by
-- itself.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_auth_user_id_idx
  on public.device_push_tokens (auth_user_id);

drop trigger if exists set_device_push_tokens_updated_at on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at
  before update on public.device_push_tokens
  for each row execute function public.set_updated_at();

alter table public.device_push_tokens enable row level security;

-- A device's token is only ever read server-side with the service-role
-- key (src/lib/push/client.ts) to fan out a send — no policy grants SELECT
-- to the anon/authenticated roles, so a signed-in user can register or
-- drop their own device's token but can never list tokens (their own or
-- anyone else's) through the client APIs.
drop policy if exists "Users manage their own device tokens" on public.device_push_tokens;
create policy "Users manage their own device tokens"
  on public.device_push_tokens
  for all
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create table if not exists public.notification_preferences (
  auth_user_id uuid primary key references public.profiles (auth_user_id) on delete cascade,
  event_new boolean not null default true,
  todo_assigned boolean not null default true,
  todo_due_soon boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "Users manage their own notification preferences" on public.notification_preferences;
create policy "Users manage their own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

alter table public.todos
  add column if not exists last_reminder_sent_at timestamptz;
