-- Backs the "AI is typing..." indicator: the webhook handler (which
-- generates and sends AI replies) and the dashboard's open conversation
-- view (which shows the indicator) run as separate processes with no
-- shared memory, so this flag is the only way for one to signal the other.
alter table public.instagram_ai_mode
  add column if not exists is_typing boolean not null default false,
  add column if not exists typing_started_at timestamptz;
