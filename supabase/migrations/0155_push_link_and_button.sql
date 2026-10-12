-- A push sent by an admin can carry a link (opened when the notification is
-- tapped) and an optional button label (e.g. "Join"): with a label the app
-- shows the message with that button, which opens the link.
alter table public.push_broadcasts
  add column if not exists link_url text check (link_url is null or link_url ~ '^https://'),
  add column if not exists button_label text check (button_label is null or length(trim(button_label)) between 1 and 24);

-- Reversal (run manually if needed):
--   alter table public.push_broadcasts drop column if exists link_url, drop column if exists button_label;
