-- Adds whether an event is held offline (in-person) or online, plus an
-- optional link (Zoom/Meet/etc.) for online meetings. Independent of
-- branch_id — an event's location (which branch, or "open meeting") and
-- its meeting mode (offline/online) answer different questions.

alter table public.events
  add column if not exists meeting_mode text not null default 'offline' check (meeting_mode in ('offline', 'online')),
  add column if not exists meeting_link text;
