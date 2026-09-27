-- Lets an event be "hybrid" — both a physical venue and an online join
-- link at once — in addition to the existing offline/online modes from
-- migration 0018. venue/map_link and meeting_link are unchanged (already
-- independent, optional columns); only the allowed meeting_mode values
-- widen.
alter table public.events
  drop constraint if exists events_meeting_mode_check;

alter table public.events
  add constraint events_meeting_mode_check check (meeting_mode in ('offline', 'online', 'hybrid'));
