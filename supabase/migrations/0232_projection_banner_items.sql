-- A banner is one more kind of item in the projection library: a single picture (a church's contact details, a
-- welcome strip) shown along the bottom of the screen, like an announcement made as a picture. Its picture is kept
-- in slide_images, as for a presentation.
alter table public.projection_items drop constraint if exists projection_items_kind_check;
alter table public.projection_items
  add constraint projection_items_kind_check check (kind in ('song', 'announcement', 'custom', 'presentation', 'banner'));
