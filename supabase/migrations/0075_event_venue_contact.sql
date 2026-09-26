-- Lets an organizer record a venue (free text, distinct from the internal
-- Branch a event can already be tied to — a venue is an address/room name
-- meant for a registrant to read, not an org-structure link), a map link
-- for it, and a contact person for the event. All four are optional and
-- read at send time by src/lib/events/registration-pass.ts to show a
-- location line (linked to the map, when given) and a contact line on the
-- emailed registration pass — same trust boundary as any other
-- organizer-authored display text in this app (registration-pass.ts
-- escapes it before use).
alter table public.events
  add column if not exists venue text,
  add column if not exists map_link text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text;
