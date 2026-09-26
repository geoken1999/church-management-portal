-- Lets an organizer brand the emailed registration pass — a color for its
-- header (mirrors website_widgets.primary_color, migration 0059) and an
-- optional custom message shown in place of the generic "your spot is
-- confirmed" line. Both are read at send time by
-- src/lib/events/registration-pass.ts, not enforced in SQL — same trust
-- boundary as every other organizer-authored display text in this app.
alter table public.events
  add column if not exists registration_pass_color text not null default '#7c3aed',
  add column if not exists registration_pass_message text;
